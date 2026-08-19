//! Keyboo 键啵 — 桌面按键可视化与打字伙伴
//! MIT License © 2026 Keyboo

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, __, ___| {}))
        .plugin(tauri_plugin_prevent_default::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 全局状态
            app.manage(Mutex::new(AppState::new(&app_handle)));

            // 托盘菜单
            let toggle_item = MenuItem::with_id(app, "toggle", "暂停", true, None::<&str>)?;
            let silent_item = MenuItem::with_id(app, "silent", "进入静默模式", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let restart_item = MenuItem::with_id(app, "restart", "重启", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            // 启动全局输入捕获(钩子线程 + 工作线程)
            start_input_listener(app_handle.clone(), toggle_item.clone());

            let menu = Menu::with_items(app, &[&toggle_item, &silent_item, &settings_item, &restart_item, &quit_item])?;
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
            // 设置窗口关闭时通知覆盖层
            if window.label() != "settings" {
                return;
            }
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
        })
        .invoke_handler(tauri::generate_handler![
            set_main_window_monitor,
            set_toggle_shortcut,
            show_main_window,
            import_companion_image,
            remove_companion_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running Keyboo");
}
