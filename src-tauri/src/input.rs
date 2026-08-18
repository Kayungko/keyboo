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
        // 物理按下键列表(用于显隐快捷键匹配)
        let mut pressed_keys: Vec<String> = Vec::new();

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

            let Some(raw) = raw else { continue };
            if is_move {
                continue;
            }

            match raw {
                RawInput::Key { vk, scan, flags, pressed } => {
                    let Some(name) = vk_to_name(vk, scan, flags) else { continue };
                    if pressed {
                        if pressed_keys.iter().any(|k| k == name) {
                            continue; // 忽略键盘自动重复
                        }
                        pressed_keys.push(name.to_string());
                        check_toggle_shortcut(&app, &pressed_keys, &toggle_item);
                    } else {
                        pressed_keys.retain(|k| k != name);
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

/// 显隐快捷键:Shift + F10(与设置里的 toggle 保持一致的默认值)
fn check_toggle_shortcut(app: &AppHandle, pressed_keys: &[String], toggle_item: &MenuItem<Wry>) {
    let expected = ["ShiftLeft".to_string(), "F10".to_string()];
    if pressed_keys != expected {
        return;
    }
    let state = app.state::<Mutex<AppState>>();
    let mut app_state = state.lock().unwrap();
    app_state.toggle_listening(app, toggle_item);
    if !app_state.listening {
        // 暂停监听:补发所有按下键的释放,避免键帽残留
        for key in pressed_keys.iter() {
            emit_input_event(
                app,
                InputEvent::KeyEvent { pressed: false, name: key.clone() },
            );
        }
    }
}

fn emit_mouse_move(app: &AppHandle, x: i32, y: i32) {
    let state = app.state::<Mutex<AppState>>();
    let app_state = state.lock().unwrap();
    if !app_state.listening {
        return;
    }
    let (origin_x, origin_y) = app_state.monitor_position;
    emit_input_event(
        app,
        InputEvent::MouseMoveEvent {
            x: (x - origin_x) as f64,
            y: (y - origin_y) as f64,
        },
    );
}

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
