//! Keyboo 键啵 — 桌面按键可视化与打字伙伴
//! MIT License © 2026 Keyboo

use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindowBuilder,
};

mod cli;
mod icon;
mod input;
mod state;

use input::start_input_listener;
use state::AppState;

/// 把覆盖层窗口移到指定显示器并调整为该显示器尺寸(启动选择与分辨率变化恢复共用)。
/// monitor_name 为 None / 空 / 未匹配时回退第一台显示器。
fn apply_monitor_selection(app: &tauri::AppHandle, monitor_name: Option<&str>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("no monitors found".to_string());
    }
    let monitor = monitors
        .iter()
        .find(|m| m.name().map(|s| s.as_str()) == monitor_name)
        .unwrap_or(&monitors[0]);

    let size = monitor.size();
    let position = monitor.position();
    window
        .set_position(*position)
        .map_err(|e| e.to_string())?;
    window
        .set_size(tauri::PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;

    // 记录显示器原点,供鼠标坐标换算
    let state = app.state::<Mutex<AppState>>();
    state.lock().unwrap().monitor_position = (position.x, position.y);
    Ok(())
}

#[tauri::command]
fn set_main_window_monitor(app: tauri::AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    let normalized = monitor_name.filter(|n| !n.is_empty());
    apply_monitor_selection(&app, normalized.as_deref())?;
    // 记录用户选择:分辨率变化时后台线程据此恢复,而不是重铺虚拟屏幕
    let state = app.state::<Mutex<AppState>>();
    state.lock().unwrap().selected_monitor = normalized;
    Ok(())
}

/// 把覆盖层铺满整个虚拟屏幕(所有显示器的并集)。
/// 相比单显示器覆盖,兼容双屏与远程桌面(RDP 单屏)两种分辨率场景:
/// RDP 会话下虚拟屏幕尺寸 = 会话分辨率,窗口据此铺满,不再留白。
fn fit_virtual_screen(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        };
        let Some(window) = app.get_webview_window("main") else {
            return Err("main window not found".to_string());
        };
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            if w <= 0 || h <= 0 {
                return Err("invalid virtual screen size".to_string());
            }
            window
                .set_position(tauri::PhysicalPosition::new(x, y))
                .map_err(|e| e.to_string())?;
            window
                .set_size(tauri::PhysicalSize::new(w as u32, h as u32))
                .map_err(|e| e.to_string())?;
            let state = app.state::<Mutex<AppState>>();
            state.lock().unwrap().monitor_position = (x, y);
        }
    }
    Ok(())
}

/// 覆盖层窗口配置:点击穿透 + 置顶。
/// set_ignore_cursor_events 让窗口对鼠标完全透明(WS_EX_TRANSPARENT),
/// 否则全屏覆盖层会拦截左键点击、右键还会弹出 WebView 默认菜单。
fn config_overlay_window(window: &tauri::WebviewWindow) {
    window
        .set_ignore_cursor_events(true)
        .expect("Failed to set ignore cursor events");

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE};

        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            }
        }
    }
}

/// 覆盖层首帧就绪后由前端调用显示窗口。
/// 启动时不直接 show:WebView 首帧渲染前 show 会出现一瞬间的透明窗体闪烁
/// (参考软件 Keyviz 在 setup 直接 show,存在同样问题);改为前端挂载后通知。
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
    }
}

/// 把便签窗口位置钳制到虚拟屏幕内(物理像素)。
/// 分辨率变化/拔显示器后恢复持久位置时,防止窗口完全跑出可见区域。
/// 先 min 后 max:窗口比屏幕宽时也不会 panic(Rust clamp 的 min>max 会 panic)。
fn clamp_to_virtual_screen(
    pos: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
) -> tauri::PhysicalPosition<i32> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        };
        unsafe {
            let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            let w = size.width as i32;
            let h = size.height as i32;
            let x = pos.x.min(vx + vw - w).max(vx);
            let y = pos.y.min(vy + vh - h).max(vy);
            return tauri::PhysicalPosition::new(x, y);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = size;
        pos
    }
}

/// 便签窗口定位:优先恢复持久化位置(钳制到虚拟屏内),
/// 无持久值时落主显示器右上角(留 24 逻辑边距)。
fn position_note_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("keyboo.json") {
        if let Some(value) = store.get("keyboo-note-position") {
            let x = value.get("x").and_then(|v| v.as_i64());
            let y = value.get("y").and_then(|v| v.as_i64());
            if let (Some(x), Some(y)) = (x, y) {
                let size = window
                    .outer_size()
                    .unwrap_or(tauri::PhysicalSize::new(292, 320));
                let clamped =
                    clamp_to_virtual_screen(tauri::PhysicalPosition::new(x as i32, y as i32), size);
                let _ = window.set_position(clamped);
                return Ok(());
            }
        }
    }
    // primary_monitor() 返回 Result<Option<Monitor>>:ok().flatten() 转成 Option 后接备用显示器
    let monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| {
            window
                .available_monitors()
                .ok()
                .and_then(|monitors| monitors.into_iter().next())
        })
        .ok_or_else(|| "no monitor found".to_string())?;
    let scale = monitor.scale_factor();
    let margin = (24.0 * scale) as i32;
    let win_w = (read_note_width(app) * scale) as i32;
    let pos = monitor.position();
    let size = monitor.size();
    window
        .set_position(tauri::PhysicalPosition::new(
            pos.x + size.width as i32 - win_w - margin,
            pos.y + margin,
        ))
        .map_err(|e| e.to_string())
}

/// 便签钉住态的读取路径:Rust 独占条目 keyboo-note-pinned,无值时默认钉住
fn read_note_pinned(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("keyboo.json")
        .ok()
        .and_then(|store| store.get("keyboo-note-pinned"))
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

/// 便签宽度的落盘下限/上限(逻辑像素):下限 = 原始设计宽,上限防拉成横幅
const NOTE_WIDTH_MIN: f64 = 292.0;
const NOTE_WIDTH_MAX: f64 = 560.0;

/// 便签宽度读取路径:Rust 独占条目 keyboo-note-width,无值时默认原设计宽
fn read_note_width(app: &tauri::AppHandle) -> f64 {
    use tauri_plugin_store::StoreExt;
    app.store("keyboo.json")
        .ok()
        .and_then(|store| store.get("keyboo-note-width"))
        .and_then(|value| value.as_f64())
        .map(|w| w.clamp(NOTE_WIDTH_MIN, NOTE_WIDTH_MAX))
        .unwrap_or(NOTE_WIDTH_MIN)
}

/// 便签高度(窗口总高)的落盘下限/上限(逻辑像素)。与前端常量互为镜像,
/// 改动必须两端同步(前端常量由前端侧维护)。下限保证列表区可滚动可用,
/// 上限防超过常规屏幕工作区。默认值沿用原窗口创建高度的 320
const NOTE_HEIGHT_MIN: f64 = 280.0;
const NOTE_HEIGHT_MAX: f64 = 860.0;
const NOTE_HEIGHT_DEFAULT: f64 = 320.0;

/// 便签高度读取路径:Rust 独占条目 keyboo-note-height(f64,与宽度同构),
/// 无值时默认 320(原创建高度),读取后同样钳制
fn read_note_height(app: &tauri::AppHandle) -> f64 {
    use tauri_plugin_store::StoreExt;
    app.store("keyboo.json")
        .ok()
        .and_then(|store| store.get("keyboo-note-height"))
        .and_then(|value| value.as_f64())
        .map(|h| h.clamp(NOTE_HEIGHT_MIN, NOTE_HEIGHT_MAX))
        .unwrap_or(NOTE_HEIGHT_DEFAULT)
}

/// 创建便签窗口(照抄 settings 窗口模式,但常驻:禁用时只 hide 不销毁,
/// 保住 webview 内存态,重新启用无闪烁)。显示由前端首帧后触发(show_note_window)。
fn create_note_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("note") {
        let _ = window.show();
        return Ok(());
    }
    let pinned = read_note_pinned(app);
    let url = tauri::WebviewUrl::App("index.html#/note".into());
    let window = WebviewWindowBuilder::new(app, "note", url)
        .title("Keyboo 便签")
        .inner_size(read_note_width(app), read_note_height(app))
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(pinned)
        // 不抢焦点:便签是常驻记录工具,点击它才聚焦
        .focused(false)
        // 首帧渲染前不显示,避免透明窗体闪烁(同 show_main_window 的理由)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = position_note_window(app, &window);
    // z-order:钉住时 note 与 main 同为 TOPMOST,显式断言把便签压到 topmost 组顶部,
    // 否则全屏覆盖层可能画在便签上面;未钉住时保持普通层级(会被其他应用遮挡)
    #[cfg(target_os = "windows")]
    if pinned {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        };
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            }
        }
    }
    Ok(())
}

/// 便签开关的唯一更新路径(设置窗口命令与托盘菜单共用):
/// 写 Rust 独占条目 keyboo-note-enabled、同步托盘勾选态、显示/隐藏窗口。
/// 静默模式下保持隐藏,退出静默时由 toggle_silent 回显。
fn apply_note_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    {
        let state = app.state::<Mutex<AppState>>();
        let mut guard = state.lock().unwrap();
        guard.note_enabled = enabled;
        if let Some(item) = &guard.note_item {
            let _ = item.set_checked(enabled);
        }
    }
    // 只读写 Rust 独占条目,不碰前端 zustand persist 的 JSON 字符串条目
    let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
    store.set("keyboo-note-enabled", serde_json::json!(enabled));
    store.save().map_err(|e| e.to_string())?;

    if enabled {
        if let Some(window) = app.get_webview_window("note") {
            let silent = app.state::<Mutex<AppState>>().lock().unwrap().silent;
            if !silent {
                let _ = window.show();
                let _ = app.emit_to("note", "note-window-restored", ());
            }
        } else {
            create_note_window(app)?;
        }
    } else if let Some(window) = app.get_webview_window("note") {
        let _ = window.hide();
    }
    // 设置窗口打开时同步开关 UI
    let _ = app.emit_to("settings", "note-enabled-changed", enabled);
    Ok(())
}

#[tauri::command]
fn set_note_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    apply_note_enabled(&app, enabled)
}

#[tauri::command]
fn get_note_enabled(app: tauri::AppHandle) -> bool {
    app.state::<Mutex<AppState>>().lock().unwrap().note_enabled
}

/// 便签窗口右上角图钉按钮调用:切换置顶并持久化,
/// 重建窗口(重启)时由 read_note_pinned 恢复
#[tauri::command]
fn get_note_pinned(app: tauri::AppHandle) -> bool {
    read_note_pinned(&app)
}

#[tauri::command]
fn set_note_pinned(app: tauri::AppHandle, pinned: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
    store.set("keyboo-note-pinned", serde_json::json!(pinned));
    store.save().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("note") {
        window
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
        // Windows 下显式 SetWindowPos:取消置顶必须给 HWND_NOTOPMOST,
        // 否则 Tauri 内部走 SWP 的路径在某些版本不降级 topmost 位
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
            };
            if let Ok(hwnd) = window.hwnd() {
                let after = if pinned { HWND_TOPMOST } else { HWND_NOTOPMOST };
                unsafe {
                    let _ =
                        SetWindowPos(hwnd, Some(after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
                }
            }
        }
    }
    Ok(())
}

/// 便签首帧就绪后由前端调用显示窗口(同 show_main_window 的防闪烁理由)
#[tauri::command]
fn show_note_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("note") {
        let _ = window.show();
    }
}

/// 便签拖动结束后由前端调用:读窗口当前位置(物理像素),
/// 钳制到虚拟屏内后落盘。分辨率变化后重启时按钳制值恢复,不会跑出屏幕
#[tauri::command]
fn save_note_position(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let clamped = clamp_to_virtual_screen(pos, size);
    let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
    store.set("keyboo-note-position", serde_json::json!({ "x": clamped.x, "y": clamped.y }));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// 便签高度动画的共享状态:
/// - generation:代际计数,新 resize 请求自增,旧动画线程发现失配即自杀
/// - current_height:上次设定的高度(逻辑像素)。动画线程逐帧回写,
///   新请求从「屏幕上真实呈现的高度」续接,打断不跳变
/// - user_height:用户设定的展开态基准高度(窗口总高,逻辑像素)。
///   底缘拖拽热区写入(set_note_height);条幅态 52 / 菜单扩窗 156 等
///   内容驱动的临时高度只改 current_height 不碰它,结束后由
///   restore_note_height 动画回到这个基准
/// - width:当前窗口宽度(逻辑像素)。拖宽实时更新内存,松手才落盘;
///   高度动画线程每帧从这里读,避免拖宽期间动画把窗口缩回旧宽
#[derive(Default)]
struct NoteResizeState {
    generation: u64,
    current_height: Option<f64>,
    user_height: f64,
    width: f64,
}

/// 高度动画帧循环(约 16ms 一帧,总时长 180ms,三次 ease-out,与前端强
/// ease-out 曲线同族)。resize_note_window(内容自适应)与 restore_note_height
/// (回用户基准高度)共用;generation 为本次动画的代际,调用方先自增,
/// 旧线程在下一帧锁内发现失配即自杀(当前高度由新线程续写,打断不跳变)。
fn spawn_note_height_animation(
    app: tauri::AppHandle,
    generation: u64,
    start: f64,
    target: f64,
) {
    let duration_ms: f64 = 180.0;
    let step_ms: u64 = 16;
    std::thread::spawn(move || {
        let mut elapsed_ms: f64 = 0.0;
        loop {
            let (h, width) = {
                let state = app.state::<Mutex<NoteResizeState>>();
                let mut s = state.lock().unwrap();
                // 新请求已接管,让位退出(当前高度由新线程续写)
                if s.generation != generation {
                    return;
                }
                let t = (elapsed_ms / duration_ms).min(1.0);
                let p = 1.0 - (1.0 - t).powi(3);
                let h = start + (target - start) * p;
                s.current_height = Some(h);
                (h, s.width)
            };
            let Some(w) = app.get_webview_window("note") else {
                return;
            };
            let _ = w.set_size(tauri::LogicalSize::new(width, h));
            if elapsed_ms >= duration_ms {
                // 收尾精确落位,消除帧间舍入残差
                let width = {
                    let state = app.state::<Mutex<NoteResizeState>>();
                    let x = state.lock().unwrap().width;
                    x
                };
                let _ = w.set_size(tauri::LogicalSize::new(width, target));
                let state = app.state::<Mutex<NoteResizeState>>();
                let mut s = state.lock().unwrap();
                if s.generation == generation {
                    s.current_height = Some(target);
                }
                return;
            }
            elapsed_ms += step_ms as f64;
            std::thread::sleep(std::time::Duration::from_millis(step_ms));
        }
    });
}

/// 便签内容高度变化时由前端调用自适应窗口高度。
/// set_size 固定左上角原点,顶部锚定的便签向下生长,语义正确。
/// 高度插值动画(约 180ms 三次 ease-out):窗口边框跟着内容平滑生长/收缩,
/// 消除「内容先跳、100ms 后窗口底边再跳」的双跳观感。
/// 注意:这里只写 current_height,不碰 user_height——内容驱动高度是临时态,
/// 展开态基准高度由 set_note_height 单独维护
#[tauri::command]
fn resize_note_window(app: tauri::AppHandle, height: f64, animate: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    // 52px 条幅态仍需走同一条高度动画;上限保持原内容安全边界。
    let target = height.clamp(52.0, 800.0);

    let state = app.state::<Mutex<NoteResizeState>>();
    let (generation, start) = {
        let mut s = state.lock().unwrap();
        let width = s.width;
        if !animate {
            s.generation += 1;
            s.current_height = Some(target);
            window
                .set_size(tauri::LogicalSize::new(width, target))
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        // 首次调用(无记录)直接落位:开窗首跳与旧行为一致,不额外放大动画
        if s.current_height.is_none() {
            window
                .set_size(tauri::LogicalSize::new(width, target))
                .map_err(|e| e.to_string())?;
            s.current_height = Some(target);
            return Ok(());
        }
        let start = s.current_height.unwrap_or(target);
        s.generation += 1;
        (s.generation, start)
    };

    spawn_note_height_animation(app, generation, start, target);
    Ok(())
}

/// 便签宽度:前端左缘热区拖拽调用。拖拽中 save=false 只改内存并 set_size 跟手;
/// 松手 save=true 落盘到 keyboo-note-width,重启由 create_note_window 恢复。
/// 左缘锚定语义:向左生长,右缘不动——set_size 默认以左上角为原点向右扩,
/// 这里按宽度增量左移 x 补偿位置,并钳制到虚拟屏(左边没空间时退化为向右生长)。
#[tauri::command]
fn set_note_width(app: tauri::AppHandle, width: f64, save: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    let target = width.clamp(NOTE_WIDTH_MIN, NOTE_WIDTH_MAX);
    let state = app.state::<Mutex<NoteResizeState>>();
    let (old_width, height) = {
        let mut s = state.lock().unwrap();
        let old = s.width;
        s.width = target;
        (old, s.current_height)
    };
    // 无高度记录(开窗后还没发生过高度自适应)时读窗口实际逻辑高度
    let height = match height {
        Some(h) => h,
        None => {
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            window
                .inner_size()
                .map(|size| size.to_logical::<f64>(scale).height)
                .map_err(|e| e.to_string())?
        }
    };
    // 位置补偿 + 原子应用:宽度增量换算物理像素,x 左移;虚拟屏左界外钳制(右缘随之右移)。
    // 位置与尺寸合并为一次 SetWindowPos:分两次调用会在两步之间闪一下右缘
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let grow = ((target - old_width) * scale).round() as i32;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let new_phys = tauri::PhysicalSize::new(
        (target * scale).round() as u32,
        (height * scale).round() as u32,
    );
    let clamped = clamp_to_virtual_screen(
        tauri::PhysicalPosition::new(pos.x - grow, pos.y),
        new_phys,
    );
    let applied = {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
            };
            match window.hwnd() {
                Ok(hwnd) => unsafe {
                    SetWindowPos(
                        hwnd,
                        None,
                        clamped.x,
                        clamped.y,
                        new_phys.width as i32,
                        new_phys.height as i32,
                        SWP_NOZORDER | SWP_NOACTIVATE,
                    )
                    .is_ok()
                },
                Err(_) => false,
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            false
        }
    };
    if !applied {
        let _ = window.set_position(clamped);
        window
            .set_size(tauri::LogicalSize::new(target, height))
            .map_err(|e| e.to_string())?;
    }
    if save {
        use tauri_plugin_store::StoreExt;
        let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
        store.set("keyboo-note-width", serde_json::json!(target));
        store.save().map_err(|e| e.to_string())?;
        // 位置被左移补偿改过:一并落盘(set_position 不保证触发前端 onMoved)
        let _ = save_note_position(app);
    }
    Ok(())
}

/// 前端首帧读取便签宽度(内容卡片跟随窗口宽度自适应)
#[tauri::command]
fn get_note_width(app: tauri::AppHandle) -> f64 {
    let state = app.state::<Mutex<NoteResizeState>>();
    let w = state.lock().unwrap().width;
    if w > 0.0 {
        w
    } else {
        read_note_width(&app)
    }
}

/// 前端读取便签用户高度(内存优先,回退持久条目;供展开态基准高度对齐)
#[tauri::command]
fn get_note_height(app: tauri::AppHandle) -> f64 {
    let state = app.state::<Mutex<NoteResizeState>>();
    let h = state.lock().unwrap().user_height;
    if h > 0.0 {
        h
    } else {
        read_note_height(&app)
    }
}

/// 便签高度(窗口总高):前端底缘拖拽热区调用,语义与 set_note_width 同构。
/// 拖拽中 save=false 只改内存并 set_size 跟手;松手 save=true 落盘到
/// keyboo-note-height,重启由 create_note_window 恢复。
/// 顶部锚定:只改 height 不动 x/y,便签向下生长,无需宽度的左缘 x 补偿;
/// 但要防底缘拖出屏幕——按窗口所在显示器工作区钳制可用高度
/// (工作区不足时高度收缩到工作区底缘;连最小高度都放不下时退化为最小高,
/// 允许贴出工作区,与宽度的退化策略一致)。
#[tauri::command]
fn set_note_height(app: tauri::AppHandle, height: f64, save: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    let target = height.clamp(NOTE_HEIGHT_MIN, NOTE_HEIGHT_MAX);
    let state = app.state::<Mutex<NoteResizeState>>();
    let width = state.lock().unwrap().width;

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    // 工作区钳制:current_monitor 拿不到(极罕见)时跳过,只靠最后的虚拟屏钳制兜底
    let mut effective = target;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let work = monitor.work_area();
        let bottom = work.position.y + work.size.height as i32;
        let available = (bottom - pos.y) as f64 / scale;
        if available < effective {
            effective = target.min(available).max(NOTE_HEIGHT_MIN);
        }
    }

    {
        let mut s = state.lock().unwrap();
        // 三件事一次锁内完成:
        // 1) generation 自增:正在跑的内容高度动画让位,否则它下一帧会把高度拉回去
        // 2) user_height 同步:这是展开态基准高度,restore_note_height 回到这里
        // 3) current_height 同步:后续动画从用户拖到的高度续接
        s.generation += 1;
        s.user_height = effective;
        s.current_height = Some(effective);
    }

    // 位置与尺寸合并为一次 SetWindowPos:顶部锚定下位置本就不变(工作区
    // 钳制退化时才可能上移),合并调用是为了与宽度路径统一,避免两步间闪烁
    let new_phys = tauri::PhysicalSize::new(
        (width * scale).round() as u32,
        (effective * scale).round() as u32,
    );
    let clamped = clamp_to_virtual_screen(pos, new_phys);
    let applied = {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
            };
            match window.hwnd() {
                Ok(hwnd) => unsafe {
                    SetWindowPos(
                        hwnd,
                        None,
                        clamped.x,
                        clamped.y,
                        new_phys.width as i32,
                        new_phys.height as i32,
                        SWP_NOZORDER | SWP_NOACTIVATE,
                    )
                    .is_ok()
                },
                Err(_) => false,
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            false
        }
    };
    if !applied {
        let _ = window.set_position(clamped);
        window
            .set_size(tauri::LogicalSize::new(width, effective))
            .map_err(|e| e.to_string())?;
    }
    if save {
        use tauri_plugin_store::StoreExt;
        let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
        // 落盘的是实际生效高度(工作区钳制后):保证重启恢复的就是用户看到的高度
        store.set("keyboo-note-height", serde_json::json!(effective));
        store.save().map_err(|e| e.to_string())?;
        // 与宽度路径保持一致:顺带落盘位置(set_position 不保证触发前端 onMoved)
        let _ = save_note_position(app);
    }
    Ok(())
}

/// 把窗口高度动画恢复到用户设定的展开态基准高度(user_height)。
/// 供前端从条幅态(52)/菜单扩窗(156)等临时内容高度返回展开态时调用。
#[tauri::command]
fn restore_note_height(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    let target = {
        let state = app.state::<Mutex<NoteResizeState>>();
        let s = state.lock().unwrap();
        // user_height 在 setup 时初始化;防御性回退持久条目(理论上不会走到)
        if s.user_height > 0.0 {
            s.user_height
        } else {
            read_note_height(&app)
        }
    };
    let state = app.state::<Mutex<NoteResizeState>>();
    let (generation, start) = {
        let mut s = state.lock().unwrap();
        // 首次调用(无记录)直接落位,不开动画:与 resize_note_window 的首跳策略一致
        if s.current_height.is_none() {
            let width = s.width;
            window
                .set_size(tauri::LogicalSize::new(width, target))
                .map_err(|e| e.to_string())?;
            s.current_height = Some(target);
            return Ok(());
        }
        let start = s.current_height.unwrap_or(target);
        s.generation += 1;
        (s.generation, start)
    };
    spawn_note_height_animation(app, generation, start, target);
    Ok(())
}


/// 设置显隐快捷键:更新内存状态并持久化到 store
#[tauri::command]
fn set_toggle_shortcut(app: tauri::AppHandle, shortcut: Vec<String>) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    // 更新内存
    {
        let state = app.state::<Mutex<AppState>>();
        state.lock().unwrap().toggle_shortcut = shortcut.clone();
    }

    // 持久化到 Rust 独占的条目。
    // 绝不读写 keyboo-event-store:那是前端 zustand persist 的条目,
    // 存储格式是 JSON 字符串(不是对象),按对象索引会 panic。
    let store = app.store("keyboo.json").map_err(|e| e.to_string())?;
    store.set("keyboo-toggle-shortcut", serde_json::json!(shortcut));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// 自定义伙伴形象的存放目录($APPDATA/companions/)
fn companions_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("companions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 导入自定义伙伴图片:校验格式/大小后复制到 $APPDATA/companions/custom.<ext>,
/// 覆盖旧形象(同一时刻只保留一张自定义图),返回完整路径供前端 convertFileSrc 使用
#[tauri::command]
fn import_companion_image(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let src = std::path::Path::new(&path);
    if !src.is_file() {
        return Err("文件不存在".to_string());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg") {
        return Err("不支持的格式,请选择 PNG / JPG / WebP / GIF / SVG 图片".to_string());
    }
    let meta = std::fs::metadata(src).map_err(|e| e.to_string())?;
    if meta.len() > 8 * 1024 * 1024 {
        return Err("图片过大(上限 8MB)".to_string());
    }
    let dir = companions_dir(&app)?;
    // 清理旧的 custom.*(此前导入可能是别的扩展名)
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with("custom.") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let dest = dir.join(format!("custom.{ext}"));
    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

/// 移除自定义伙伴图片
#[tauri::command]
fn remove_companion_image(app: tauri::AppHandle) -> Result<(), String> {
    let dir = companions_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with("custom.") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

/// 读取本机 AI CLI 登录态原文(AI 额度订阅类数据源)。
/// 白名单映射固定路径,拒绝任意路径读取:
/// - codex  → %USERPROFILE%\.codex\auth.json
/// - gemini → %USERPROFILE%\.gemini\oauth_creds.json
#[tauri::command]
fn read_local_credential(kind: String) -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "无法获取用户目录".to_string())?;
    let rel: &[&str] = match kind.as_str() {
        "codex" => &[".codex", "auth.json"],
        "gemini" => &[".gemini", "oauth_creds.json"],
        _ => return Err("未知的凭据类型".to_string()),
    };
    let path = rel
        .iter()
        .fold(std::path::PathBuf::from(&home), |p, seg| p.join(seg));
    if !path.is_file() {
        return Err(format!("未找到本机登录态:{}", path.display()));
    }
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败:{e}"))
}

/// 外部写入路由的终点:入队 → 确保便签窗口存在 → 通知前端消费。
/// note 窗口是 keyboo-note-store 的唯一写者,这里只投递、绝不直接写该键。
fn enqueue_external_op(app: &tauri::AppHandle, op: cli::ExternalOp) {
    {
        let queue = app.state::<Mutex<Vec<cli::ExternalOp>>>();
        queue.lock().unwrap().push(op);
    }
    // 窗口不存在时借 apply_note_enabled 拉起:它统一走「落盘开关 + 托盘勾选
    // 同步 + 创建窗口」的既有路径,避免绕过开关状态造出与托盘勾选不一致的窗口。
    // 窗口已存在(含隐藏)则不动显隐——隐藏时 webview 仍在运行,事件照常送达
    if app.get_webview_window("note").is_none() {
        if let Err(error) = apply_note_enabled(app, true) {
            eprintln!("[keyboo] failed to create note window for external op: {error}");
        }
    }
    // webview 未就绪时事件会丢:前端挂载时主动调用 take_external_ops 兜底消费
    let _ = app.emit_to("note", "keyboo-external-ops", ());
}

/// single-instance 回调入口(运行在常驻实例内):第二实例的 argv 转发到这里。
/// 校验理论上不会失败(第二实例在启动早期已拦截并退出),失败只打常驻日志
fn handle_cli_forward(app: &tauri::AppHandle, args: Vec<String>) {
    match cli::parse_cli(&args) {
        cli::CliParse::Command(cli::CliCommand::Write(op)) => enqueue_external_op(app, op),
        // list 由第二实例直接读文件打印,不会转发到这;防御性忽略
        cli::CliParse::Command(_) => {}
        cli::CliParse::Invalid(message) => {
            eprintln!("[keyboo] forwarded CLI args invalid: {message}")
        }
        cli::CliParse::None => {}
    }
}

/// 前端消费外部操作队列:便签挂载时兜底调用 + keyboo-external-ops 事件驱动。
/// drain 语义保证冷启动入队/转发入队与多次触发之间不重复、不漏单
#[tauri::command]
fn take_external_ops(app: tauri::AppHandle) -> Vec<cli::ExternalOp> {
    let queue = app.state::<Mutex<Vec<cli::ExternalOp>>>();
    let mut guard = queue.lock().unwrap();
    std::mem::take(&mut *guard)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // CLI 子命令在 Tauri 启动前拦截(第二实例视角):
    // - list:只读 keyboo.json 打印后退出,不启动应用、不转发(读不违反唯一写者)
    // - 校验失败:stderr + 非零退出码,不进入转发路径
    // - 写命令:打印成功提示后继续往下走——常驻实例存在则 single-instance 插件
    //   在 build 阶段转发 argv 后本进程退出(0);不存在则本进程成为常驻实例,
    //   setup 阶段把该操作入队(冷启动路径),便签挂载时 take 兜底消费
    let context = tauri::generate_context!();
    let identifier = context.config().identifier.clone();
    let mut startup_cli_op: Option<cli::ExternalOp> = None;
    match cli::parse_cli(&std::env::args().collect::<Vec<String>>()) {
        cli::CliParse::Command(cli::CliCommand::ListTodos) => {
            cli::attach_parent_console();
            match cli::read_note_store_snapshot(&identifier) {
                Ok(snapshot) => cli::print_todo_list(&snapshot),
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
            std::process::exit(0);
        }
        cli::CliParse::Command(cli::CliCommand::ListProjects) => {
            cli::attach_parent_console();
            match cli::read_note_store_snapshot(&identifier) {
                Ok(snapshot) => cli::print_project_list(&snapshot),
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
            std::process::exit(0);
        }
        cli::CliParse::Invalid(message) => {
            cli::attach_parent_console();
            eprintln!("{message}");
            std::process::exit(1);
        }
        cli::CliParse::Command(cli::CliCommand::Write(op)) => {
            cli::attach_parent_console();
            match &op {
                cli::ExternalOp::AddTodo { text, project: Some(project) } => {
                    println!("已提交: {text}(主题:{project})")
                }
                cli::ExternalOp::AddTodo { text, project: None } => println!("已提交: {text}"),
                cli::ExternalOp::AddProject { title } => println!("已提交主题: {title}"),
            }
            startup_cli_op = Some(op);
        }
        cli::CliParse::None => {}
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_cli_forward(app, args);
        }))
        .plugin(tauri_plugin_prevent_default::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // 全局状态
            app.manage(Mutex::new(AppState::new(&app_handle)));
            // 便签高度动画状态(见 resize_note_window);宽度与用户高度从持久化条目恢复
            app.manage(Mutex::new(NoteResizeState {
                width: read_note_width(&app_handle),
                user_height: read_note_height(&app_handle),
                ..Default::default()
            }));
            // 外部操作队列(CLI 写命令的转发/冷启动入队,前端 take_external_ops 取走)
            app.manage(Mutex::new(Vec::<cli::ExternalOp>::new()));

            // 托盘菜单
            let toggle_item = MenuItem::with_id(app, "toggle", "暂停", true, None::<&str>)?;
            let silent_item = MenuItem::with_id(app, "silent", "进入静默模式", true, None::<&str>)?;
            let note_enabled = {
                let state = app.state::<Mutex<AppState>>();
                let enabled = state.lock().unwrap().note_enabled;
                enabled
            };
            let note_item = CheckMenuItem::with_id(app, "note", "便签", true, note_enabled, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let restart_item = MenuItem::with_id(app, "restart", "重启", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            // 托盘句柄入全局状态:apply_note_enabled 同步勾选态时需要
            {
                let state = app.state::<Mutex<AppState>>();
                state.lock().unwrap().note_item = Some(note_item.clone());
            }

            // 启动全局输入捕获(钩子线程 + 工作线程)
            start_input_listener(app_handle.clone(), toggle_item.clone());

            let menu = Menu::with_items(app, &[&toggle_item, &silent_item, &note_item, &settings_item, &restart_item, &quit_item])?;
            let _ = TrayIconBuilder::with_id("keyboo-tray")
                .icon(icon::tray_image())
                .tooltip("Keyboo 键啵")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => {
                        let state = app.state::<Mutex<AppState>>();
                        let mut app_state = state.lock().unwrap();
                        app_state.toggle_listening(app, &toggle_item);
                    }
                    "silent" => {
                        let state = app.state::<Mutex<AppState>>();
                        let mut app_state = state.lock().unwrap();
                        app_state.toggle_silent(app, &silent_item);
                    }
                    "note" => {
                        // Alt+F4 只是隐藏(note_enabled 仍为 true):此时点击托盘=重新显示,
                        // 而不是先禁用再启用。静默模式下便签保持隐藏(由 toggle_silent 回显)
                        let (enabled, visible) = {
                            let state = app.state::<Mutex<AppState>>();
                            let guard = state.lock().unwrap();
                            let visible = app
                                .get_webview_window("note")
                                .map(|w| w.is_visible().unwrap_or(true))
                                .unwrap_or(false);
                            (guard.note_enabled, visible)
                        };
                        let target = if enabled && !visible { true } else { !enabled };
                        if let Err(error) = apply_note_enabled(app, target) {
                            eprintln!("[keyboo] failed to toggle note: {error}");
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.set_focus();
                            return;
                        }
                        let url = tauri::WebviewUrl::App("index.html#/settings".into());
                        let window = WebviewWindowBuilder::new(app, "settings", url)
                            .title("Keyboo 设置")
                            .inner_size(760.0, 600.0)
                            .min_inner_size(600.0, 460.0)
                            .maximizable(false)
                            // 先安装按 DPI 匹配的标题栏/任务栏图标，再显示窗口，避免首帧闪过模糊图标。
                            .visible(false)
                            .build()
                            .unwrap();
                        #[cfg(target_os = "windows")]
                        match icon::set_window_icons(&window) {
                            Ok(handles) => {
                                let state = app.state::<Mutex<AppState>>();
                                state.lock().unwrap().settings_window_icons = Some(handles);
                            }
                            Err(error) => {
                                eprintln!("[keyboo] failed to set settings window icons: {error}")
                            }
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit_to("main", "settings-window", true);
                    }
                    "restart" => {
                        // 重启前落盘:设置窗口的 store 自动保存是防抖的,
                        // 直接 restart 会丢弃防抖窗口内未写入的设置变更
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = app.store("keyboo.json") {
                            let _ = store.save();
                        }
                        #[cfg(debug_assertions)]
                        {
                            // dev 模式前端依赖 vite dev server:app.restart() 会先退出当前进程,
                            // tauri-cli 随之清理 vite,重启出的孤儿二进制连不上 localhost → 拒绝连接。
                            // dev 下改为重载所有窗口(代码变更的重启由 cargo watch 负责)
                            for window in app.webview_windows().values() {
                                let _ = window.eval("location.reload()");
                            }
                        }
                        #[cfg(not(debug_assertions))]
                        app.restart();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // 覆盖层主窗口:铺满虚拟屏幕(兼容双屏与远程桌面单屏)。
            // 点击穿透 + 置顶 + 尺寸在不可见时先配好;show 由前端首帧后触发
            // (show_main_window),避免 WebView 未渲染时的窗体闪烁。
            if let Some(window) = app.get_webview_window("main") {
                config_overlay_window(&window);
                let _ = fit_virtual_screen(app.handle());
            }

            // 便签窗口:按持久化开关恢复(懒创建;从未启用过就不付创建成本)。
            // 启动时 silent 恒为 false,无需静默判断
            let note_enabled = app.state::<Mutex<AppState>>().lock().unwrap().note_enabled;
            if note_enabled {
                if let Err(error) = create_note_window(app.handle()) {
                    eprintln!("[keyboo] failed to create note window: {error}");
                }
            }

            // 冷启动 CLI 写命令:应用本来没在运行时用户直接跑 CLI,本实例即常驻实例,
            // 把启动参数里的操作入队。此刻便签 webview 尚未挂载,keyboo-external-ops
            // 事件大概率丢失——这正是前端挂载时主动 take_external_ops 兜底的原因
            if let Some(op) = startup_cli_op {
                enqueue_external_op(app.handle(), op);
            }

            // 兜底:前端异常未能通知时,2s 后仍然显示(重复 show 无副作用)
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                    }
                });
            }

            // 显示器/RDP 分辨率变化监听:每 2s 检查虚拟屏幕尺寸,变化时按当前模式恢复——
            // 用户选过显示器 → 重新定位到该显示器;未选择 → 重铺虚拟屏幕。
            // last_w/h 用当前值初始化:否则首次迭代(0→实际值)必然触发重铺,
            // 会在启动 2s 后覆盖前端刚应用的显示器选择(双屏下键盘跑错屏的根因)。
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    #[cfg(target_os = "windows")]
                    {
                        use windows::Win32::UI::WindowsAndMessaging::{
                            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
                        };
                        let (mut last_w, mut last_h) = unsafe {
                            (
                                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                                GetSystemMetrics(SM_CYVIRTUALSCREEN),
                            )
                        };
                        loop {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            let (w, h) = unsafe {
                                (
                                    GetSystemMetrics(SM_CXVIRTUALSCREEN),
                                    GetSystemMetrics(SM_CYVIRTUALSCREEN),
                                )
                            };
                            if (w, h) != (last_w, last_h) {
                                last_w = w;
                                last_h = h;
                                let selected = {
                                    let state = app_handle.state::<Mutex<AppState>>();
                                    let guard = state.lock().unwrap();
                                    guard.selected_monitor.clone()
                                };
                                match selected.as_deref() {
                                    Some(name) => {
                                        let _ = apply_monitor_selection(&app_handle, Some(name));
                                    }
                                    None => {
                                        let _ = fit_virtual_screen(&app_handle);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match window.label() {
                // 便签窗口常驻:Alt+F4/系统关闭只隐藏不销毁(托盘应用范式,
                // 保住 webview 内存态,重新显示无闪烁)
                "note" => {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                // 设置窗口关闭时通知覆盖层
                "settings" => {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        #[cfg(target_os = "windows")]
                        {
                            icon::clear_window_icons(window);
                            let state = window.app_handle().state::<Mutex<AppState>>();
                            state.lock().unwrap().settings_window_icons.take();
                        }
                        let _ = window
                            .app_handle()
                            .emit_to("main", "settings-window", false);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_main_window_monitor,
            set_toggle_shortcut,
            show_main_window,
            import_companion_image,
            remove_companion_image,
            read_local_credential,
            set_note_enabled,
            get_note_enabled,
            set_note_pinned,
            get_note_pinned,
            show_note_window,
            save_note_position,
            resize_note_window,
            set_note_width,
            get_note_width,
            set_note_height,
            get_note_height,
            restore_note_height,
            take_external_ops
        ])
        .run(context)
        .expect("error while running Keyboo");
}
