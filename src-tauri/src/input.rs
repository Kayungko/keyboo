//! Keyboo 全局输入捕获(Windows,clean-room 实现)
//!
//! 架构:两个专用线程 + 有界通道。
//! - 钩子线程:安装 WH_KEYBOARD_LL / WH_MOUSE_LL 低级钩子并泵消息。
//!   回调内只做一件事——把原始事件 `try_send` 进通道后立即返回。
//!   Windows 的低级钩子是同步的:回调不返回,系统输入管线就阻塞,
//!   因此回调里绝不加锁、不分配、不做 IPC。
//! - 工作线程:消费通道,维护按键按下状态、检测全局显隐快捷键、
//!   按 ~120Hz 合并鼠标移动事件,最后统一序列化并 emit 给主窗口。

use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::state::AppState;

/// 钩子→工作线程队列容量;写满时丢弃事件而不是阻塞钩子
const EVENT_QUEUE_CAPACITY: usize = 1024;
/// 鼠标移动事件合并后的最大派发频率(约 120Hz)
const MOUSE_MOVE_EMIT_INTERVAL: Duration = Duration::from_millis(8);
/// 工作线程接收超时:事件流空闲时用于冲刷最后一个鼠标移动事件
const WORKER_RECV_TIMEOUT: Duration = Duration::from_millis(16);
/// 低级钩子扩展键标志(如右侧 Ctrl/Alt、小键盘 Enter)
const LLKHF_EXTENDED: u32 = 0x0000_0001;
/// 长按保活间隔:周期性重发按下事件,让前端刷新时间戳,
/// 避免长时间按住(如录屏时按住 Shift)被卡键清理误释放
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(10);

static EVENT_TX: OnceLock<SyncSender<RawInput>> = OnceLock::new();

/// 钩子线程推入通道的原始事件
#[derive(Debug, Clone, Copy)]
enum RawInput {
    Key {
        vk: u32,
        scan: u32,
        flags: u32,
        pressed: bool,
    },
    Button {
        button: MouseButton,
        pressed: bool,
    },
    Move {
        x: i32,
        y: i32,
    },
    Wheel {
        delta: i16,
    },
}

/// 发往前端的事件(与前端 InputEvent 类型对应)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum InputEvent {
    KeyEvent { pressed: bool, name: String },
    MouseButtonEvent { pressed: bool, button: MouseButton },
    MouseMoveEvent { x: f64, y: f64 },
    MouseWheelEvent { delta_y: i64 },
}

#[derive(Debug, Clone, Copy, Serialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    Other,
}

/// 工作线程维护的物理按住键:保留原始虚拟键码,
/// 供保活周期用 GetAsyncKeyState 对账硬件状态、补发丢失的释放
#[derive(Clone)]
struct PressedKey {
    vk: u32,
    name: String,
}

pub fn start_input_listener(app: AppHandle, toggle_item: MenuItem<Wry>) {
    let (tx, rx) = sync_channel::<RawInput>(EVENT_QUEUE_CAPACITY);
    EVENT_TX.set(tx).expect("input channel already initialized");

    start_hook_thread();
    start_worker_thread(app, rx, toggle_item);
}

// ─────────────────────────── 钩子线程 ───────────────────────────

#[cfg(windows)]
fn start_hook_thread() {
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, MSG, WH_KEYBOARD_LL,
        WH_MOUSE_LL,
    };

    thread::spawn(|| {
        unsafe {
            let hmod = match GetModuleHandleW(None) {
                Ok(h) => windows::Win32::Foundation::HINSTANCE(h.0),
                Err(e) => {
                    eprintln!("[keyboo] GetModuleHandleW failed: {e}");
                    return;
                }
            };
            let kb_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), Some(hmod), 0);
            let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), Some(hmod), 0);
            if kb_hook.is_err() || mouse_hook.is_err() {
                eprintln!("[keyboo] failed to install low-level hooks");
                return;
            }

            println!("[keyboo] global input hooks installed");

            // 低级钩子依赖消息泵保持活跃
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    });
}

#[cfg(windows)]
unsafe extern "system" fn keyboard_hook(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, KBDLLHOOKSTRUCT, HC_ACTION, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP,
    };

    if code == HC_ACTION as i32 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let msg = wparam.0 as u32;
        let pressed = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let released = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        if pressed || released {
            let _ = EVENT_TX.get().map(|tx| {
                tx.try_send(RawInput::Key {
                    vk: kb.vkCode,
                    scan: kb.scanCode,
                    flags: kb.flags.0,
                    pressed,
                })
            });
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

#[cfg(windows)]
unsafe extern "system" fn mouse_hook(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, MSLLHOOKSTRUCT, HC_ACTION, WM_LBUTTONDOWN, WM_LBUTTONUP,
        WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN, WM_RBUTTONUP,
        WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    if code == HC_ACTION as i32 {
        let ms = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        let msg = wparam.0 as u32;
        let event = match msg {
            WM_LBUTTONDOWN => Some(RawInput::Button { button: MouseButton::Left, pressed: true }),
            WM_LBUTTONUP => Some(RawInput::Button { button: MouseButton::Left, pressed: false }),
            WM_RBUTTONDOWN => Some(RawInput::Button { button: MouseButton::Right, pressed: true }),
            WM_RBUTTONUP => Some(RawInput::Button { button: MouseButton::Right, pressed: false }),
            WM_MBUTTONDOWN => Some(RawInput::Button { button: MouseButton::Middle, pressed: true }),
            WM_MBUTTONUP => Some(RawInput::Button { button: MouseButton::Middle, pressed: false }),
            WM_XBUTTONDOWN | WM_XBUTTONUP => Some(RawInput::Button {
                button: MouseButton::Other,
                pressed: msg == WM_XBUTTONDOWN,
            }),
            WM_MOUSEMOVE => Some(RawInput::Move { x: ms.pt.x, y: ms.pt.y }),
            WM_MOUSEWHEEL => {
                // 滚轮增量在 wParam 高 16 位
                let delta = ((wparam.0 & 0xFFFF_0000) >> 16) as u16 as i16;
                Some(RawInput::Wheel { delta })
            }
            _ => None,
        };
        if let Some(event) = event {
            let _ = EVENT_TX.get().map(|tx| tx.try_send(event));
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

#[cfg(not(windows))]
fn start_hook_thread() {
    eprintln!("[keyboo] global input capture is only implemented on Windows");
}

// ─────────────────────────── 工作线程 ───────────────────────────

fn start_worker_thread(app: AppHandle, rx: Receiver<RawInput>, toggle_item: MenuItem<Wry>) {
    thread::spawn(move || {
        // 合并槽:只保留最新鼠标坐标
        let mut pending_move: Option<(i32, i32)> = None;
        // 初始化为足够早的时刻,首个移动事件立即可派发
        let mut last_move_emit = Instant::now() - MOUSE_MOVE_EMIT_INTERVAL;
        // 物理按下键列表(用于显隐快捷键匹配与保活对账)
        let mut pressed_keys: Vec<PressedKey> = Vec::new();
        let mut last_keepalive = Instant::now();

        loop {
            let raw = match rx.recv_timeout(WORKER_RECV_TIMEOUT) {
                Ok(raw) => Some(raw),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => break,
            };

            let is_move = matches!(raw, Some(RawInput::Move { .. }));

            if let Some(RawInput::Move { x, y }) = raw {
                pending_move = Some((x, y));
            }

            // 冲刷合并的鼠标移动:
            // - 非移动事件到来时立即冲刷,保证坐标先于点击到达;
            // - 持续移动时按节流间隔派发;
            // - 空闲超时时冲刷最后一个坐标,保证指示器停在真实位置。
            if pending_move.is_some()
                && (!is_move || last_move_emit.elapsed() >= MOUSE_MOVE_EMIT_INTERVAL)
            {
                if let Some((x, y)) = pending_move.take() {
                    emit_mouse_move(&app, x, y);
                    last_move_emit = Instant::now();
                }
            }

            // 长按保活:重发按下事件只用于刷新前端时间戳(前端对重复按下仅更新时间)。
            // 重发前先对账硬件状态:释放事件丢失的卡键在这里补发释放并移除,
            // 否则会被保活永远重发、前端卡键清理因时间戳持续刷新而永远不触发。
            if last_keepalive.elapsed() >= KEEPALIVE_INTERVAL {
                last_keepalive = Instant::now();
                reconcile_stuck_keys(&app, &mut pressed_keys);
                for key in pressed_keys.iter() {
                    emit_input_event(
                        &app,
                        InputEvent::KeyEvent { pressed: true, name: key.name.clone() },
                    );
                }
            }

            let Some(raw) = raw else { continue };
            if is_move {
                continue;
            }

            match raw {
                RawInput::Key { vk, scan, flags, pressed } => {
                    let Some(name) = vk_to_name(vk, scan, flags) else { continue };
                    if pressed {
                        if pressed_keys.iter().any(|k| k.name == name) {
                            continue; // 忽略键盘自动重复
                        }
                        pressed_keys.push(PressedKey { vk, name: name.to_string() });
                        check_toggle_shortcut(&app, &pressed_keys, &toggle_item);
                    } else {
                        pressed_keys.retain(|k| k.name != name);
                    }
                    emit_input_event(&app, InputEvent::KeyEvent { pressed, name: name.to_string() });
                }
                RawInput::Button { button, pressed } => {
                    emit_input_event(&app, InputEvent::MouseButtonEvent { pressed, button });
                }
                RawInput::Move { .. } => unreachable!("move handled above"),
                RawInput::Wheel { delta } => {
                    emit_input_event(&app, InputEvent::MouseWheelEvent { delta_y: delta as i64 });
                }
            }
        }
    });
}

/// 显隐快捷键:集合匹配(顺序无关、左右修饰键归一),默认 Shift + F10,可在设置中修改
fn check_toggle_shortcut(app: &AppHandle, pressed_keys: &[PressedKey], toggle_item: &MenuItem<Wry>) {
    let held_names: Vec<String> = pressed_keys.iter().map(|k| k.name.clone()).collect();
    // 先判定是否命中,立即释放锁——std::sync::Mutex 不可重入,
    // 绝不能持锁调用 toggle_listening / emit(内部会再次 emit 或加锁)
    let should_toggle = {
        let state = app.state::<Mutex<AppState>>();
        let app_state = state.lock().unwrap();
        !app_state.toggle_shortcut.is_empty()
            && shortcut_matches(&app_state.toggle_shortcut, &held_names)
    };
    if !should_toggle {
        return;
    }

    let listening_after = {
        let state = app.state::<Mutex<AppState>>();
        let mut app_state = state.lock().unwrap();
        app_state.toggle_listening(app, toggle_item);
        app_state.listening
    };

    if !listening_after {
        // 暂停监听:绕过监听闸门,直接补发所有按下键的释放,避免键帽残留
        for key in pressed_keys.iter() {
            let _ = app.emit_to(
                "main",
                "input-event",
                InputEvent::KeyEvent { pressed: false, name: key.name.clone() },
            );
        }
    }
}

/// 左右修饰键归一化:录制器记录的是实际按下的左/右键名,
/// 匹配时归一,左 Ctrl 与右 Ctrl 都能命中 Ctrl
fn normalize_key(name: &str) -> String {
    match name {
        "ShiftLeft" | "ShiftRight" => "Shift".to_string(),
        "ControlLeft" | "ControlRight" => "Control".to_string(),
        "Alt" | "AltRight" => "Alt".to_string(),
        "MetaLeft" | "MetaRight" => "Meta".to_string(),
        other => other.to_string(),
    }
}

fn shortcut_matches(shortcut: &[String], pressed: &[String]) -> bool {
    if shortcut.len() != pressed.len() {
        return false;
    }
    let mut want: Vec<String> = shortcut.iter().map(|s| normalize_key(s)).collect();
    let mut got: Vec<String> = pressed.iter().map(|s| normalize_key(s)).collect();
    want.sort();
    got.sort();
    want == got
}

/// 卡键对账:用硬件物理状态(GetAsyncKeyState)核对仍留在 pressed_keys 中的键,
/// 对实际已松开的键补发释放并移除。
///
/// 释放事件可能丢失的已知通道:通道写满时 try_send 丢弃、UAC 安全桌面与会话切换
/// 期间钩子收不到事件。卡键若留在 pressed_keys 中会被保活永远重发——前端卡键清理
/// 因时间戳每 10s 被保活刷新而永远不触发,表现为无输入时键帽常驻;卡键还会污染
/// 显隐快捷键的集合匹配(要求精确等长),导致 Shift+F10 失灵。以硬件状态为准对账,
/// 每 10s 一次,最坏 10s 内自愈。
///
/// 注意:Return 与 KpReturn 共享 VK_RETURN、左右 Shift 在钩子里同为 VK_SHIFT,
/// 共享 vk 时任一键仍物理按住则都保留——只可能延迟清理,不会误清真实按住。
#[cfg(windows)]
fn reconcile_stuck_keys(app: &AppHandle, pressed_keys: &mut Vec<PressedKey>) {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

    let mut i = 0;
    while i < pressed_keys.len() {
        let physically_down =
            (unsafe { GetAsyncKeyState(pressed_keys[i].vk as i32) } as u16 & 0x8000) != 0;
        if physically_down {
            i += 1;
            continue;
        }
        let stuck = pressed_keys.remove(i);
        emit_input_event(
            app,
            InputEvent::KeyEvent { pressed: false, name: stuck.name },
        );
    }
}

#[cfg(not(windows))]
fn reconcile_stuck_keys(_app: &AppHandle, _pressed_keys: &mut Vec<PressedKey>) {}

/// 打字伙伴的点击穿透翻转由前端判定(前端实时持有鼠标坐标与自身矩形),
/// 通过 set_cursor_passthrough 命令下发,这里不再做区域判断。
fn emit_mouse_move(app: &AppHandle, x: i32, y: i32) {
    // 先拷贝 listening 与显示器原点并释放锁,再 emit,避免持锁派发
    let (listening, origin_x, origin_y) = {
        let state = app.state::<Mutex<AppState>>();
        let app_state = state.lock().unwrap();
        (
            app_state.listening,
            app_state.monitor_position.0,
            app_state.monitor_position.1,
        )
    };
    if !listening {
        return;
    }
    if let Err(e) = app.emit_to(
        "main",
        "input-event",
        InputEvent::MouseMoveEvent {
            x: (x - origin_x) as f64,
            y: (y - origin_y) as f64,
        },
    ) {
        eprintln!("[keyboo] emit failed: {e}");
    }
}

/// 注意:调用方不得持有 AppState 锁(std::sync::Mutex 不可重入)
fn emit_input_event(app: &AppHandle, event: InputEvent) {
    let state = app.state::<Mutex<AppState>>();
    let listening = state.lock().unwrap().listening;
    if !listening {
        return;
    }
    if let Err(e) = app.emit_to("main", "input-event", event) {
        eprintln!("[keyboo] emit failed: {e}");
    }
}

// ─────────────────────────── 键位映射 ───────────────────────────

/// 把虚拟键码映射为稳定的逻辑键名(与前端 keymap 对应)。
/// 修饰键依据扫描码/扩展标志区分左右。
fn vk_to_name(vk: u32, scan: u32, flags: u32) -> Option<&'static str> {
    let extended = flags & LLKHF_EXTENDED != 0;
    match vk {
        // 修饰键(区分左右)
        0x10 => Some(match scan {
            0x36 => "ShiftRight",
            _ => "ShiftLeft",
        }),
        0x11 => Some(if extended { "ControlRight" } else { "ControlLeft" }),
        0x12 => Some(if extended { "AltRight" } else { "Alt" }),
        0x5B => Some("MetaLeft"),
        0x5C => Some("MetaRight"),

        // 主键区
        0x08 => Some("Backspace"),
        0x09 => Some("Tab"),
        0x0D => Some(if extended { "KpReturn" } else { "Return" }),
        0x13 => Some("Pause"),
        0x14 => Some("CapsLock"),
        0x1B => Some("Escape"),
        0x20 => Some("Space"),
        0x21 => Some("PageUp"),
        0x22 => Some("PageDown"),
        0x23 => Some("End"),
        0x24 => Some("Home"),
        0x25 => Some("LeftArrow"),
        0x26 => Some("UpArrow"),
        0x27 => Some("RightArrow"),
        0x28 => Some("DownArrow"),
        0x2C => Some("PrintScreen"),
        0x2D => Some("Insert"),
        0x2E => Some("Delete"),
        0x5D => Some("ContextMenu"),
        0x90 => Some("NumLock"),
        0x91 => Some("ScrollLock"),

        // 数字与字母
        vk @ 0x30..=0x39 => Some(num_name(vk - 0x30)),
        vk @ 0x41..=0x5A => Some(alpha_name(vk - 0x41)),

        // F1-F12
        vk @ 0x70..=0x7B => Some(f_name(vk - 0x70)),

        // 小键盘
        vk @ 0x60..=0x69 => Some(kp_name(vk - 0x60)),
        0x6A => Some("KpMultiply"),
        0x6B => Some("KpPlus"),
        0x6D => Some("KpMinus"),
        0x6E => Some("KpDecimal"),
        0x6F => Some("KpDivide"),

        // 标点符号(美式布局键位)
        0xBA => Some("SemiColon"),
        0xBB => Some("Equal"),
        0xBC => Some("Comma"),
        0xBD => Some("Minus"),
        0xBE => Some("Dot"),
        0xBF => Some("Slash"),
        0xC0 => Some("BackQuote"),
        0xDB => Some("LeftBracket"),
        0xDC => Some("BackSlash"),
        0xDD => Some("RightBracket"),
        0xDE => Some("Quote"),

        // 多媒体键
        0xAD => Some("VolumeMute"),
        0xAE => Some("VolumeDown"),
        0xAF => Some("VolumeUp"),
        0xB3 => Some("MediaPlayPause"),

        _ => None,
    }
}

fn num_name(i: u32) -> &'static str {
    const NAMES: [&str; 10] = [
        "Num0", "Num1", "Num2", "Num3", "Num4", "Num5", "Num6", "Num7", "Num8", "Num9",
    ];
    NAMES[i as usize]
}

fn alpha_name(i: u32) -> &'static str {
    const NAMES: [&str; 26] = [
        "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK",
        "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV",
        "KeyW", "KeyX", "KeyY", "KeyZ",
    ];
    NAMES[i as usize]
}

fn f_name(i: u32) -> &'static str {
    const NAMES: [&str; 12] = [
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ];
    NAMES[i as usize]
}

fn kp_name(i: u32) -> &'static str {
    const NAMES: [&str; 10] = [
        "Kp0", "Kp1", "Kp2", "Kp3", "Kp4", "Kp5", "Kp6", "Kp7", "Kp8", "Kp9",
    ];
    NAMES[i as usize]
}
