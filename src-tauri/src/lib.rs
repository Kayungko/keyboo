//! Keyboo 键啵 — 桌面按键可视化与打字伙伴
//! MIT License © 2026 Keyboo

use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindowBuilder,
};

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
    let win_w = (292.0 * scale) as i32;
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
        .inner_size(292.0, 320.0)
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
#[derive(Default)]
struct NoteResizeState {
    generation: u64,
    current_height: Option<f64>,
}

/// 便签内容高度变化时由前端调用自适应窗口高度。
/// set_size 固定左上角原点,顶部锚定的便签向下生长,语义正确。
/// 高度插值动画(约 180ms 三次 ease-out):窗口边框跟着内容平滑生长/收缩,
/// 消除「内容先跳、100ms 后窗口底边再跳」的双跳观感。
#[tauri::command]
fn resize_note_window(app: tauri::AppHandle, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("note")
        .ok_or_else(|| "note window not found".to_string())?;
    let target = height.clamp(200.0, 800.0);

    let state = app.state::<Mutex<NoteResizeState>>();
    let (generation, start) = {
        let mut s = state.lock().unwrap();
        // 首次调用(无记录)直接落位:开窗首跳与旧行为一致,不额外放大动画
        if s.current_height.is_none() {
            window
                .set_size(tauri::LogicalSize::new(292.0, target))
                .map_err(|e| e.to_string())?;
            s.current_height = Some(target);
            return Ok(());
        }
        let start = s.current_height.unwrap_or(target);
        s.generation += 1;
        (s.generation, start)
    };

    // 帧循环:约 16ms 一帧,总时长 180ms,三次 ease-out(与前端强 ease-out 曲线同族)
    let duration_ms: f64 = 180.0;
    let step_ms: u64 = 16;
    std::thread::spawn(move || {
        let mut elapsed_ms: f64 = 0.0;
        loop {
            let h = {
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
                h
            };
            let Some(w) = app.get_webview_window("note") else {
                return;
            };
            let _ = w.set_size(tauri::LogicalSize::new(292.0, h));
            if elapsed_ms >= duration_ms {
                // 收尾精确落位,消除帧间舍入残差
                let _ = w.set_size(tauri::LogicalSize::new(292.0, target));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, __, ___| {}))
        .plugin(tauri_plugin_prevent_default::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 全局状态
            app.manage(Mutex::new(AppState::new(&app_handle)));
            // 便签高度动画状态(见 resize_note_window)
            app.manage(Mutex::new(NoteResizeState::default()));

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
            resize_note_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Keyboo");
}
