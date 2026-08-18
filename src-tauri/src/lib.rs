//! Keyboo 键啵 — 桌面按键可视化与打字伙伴
//! MIT License © 2026 Keyboo

use std::sync::Mutex;

use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindowBuilder,
};

mod input;
mod state;

use input::start_input_listener;
use state::AppState;

/// 把覆盖层主窗口移动到指定名称的显示器上
#[tauri::command]
fn set_main_window_monitor(app: tauri::AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("no monitors found".to_string());
    }
    let monitor = monitors
        .iter()
        .find(|m| m.name().map(|s| s.as_str()) == monitor_name.as_deref())
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

/// 覆盖层点击穿透开关:打字伙伴区域由前端判定(它实时持有鼠标坐标与自身矩形),
/// 鼠标在伙伴上时前端传 false 恢复接收点击,离开时传 true 恢复全屏穿透。
#[tauri::command]
fn set_cursor_passthrough(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    let should = {
        let state = app.state::<Mutex<AppState>>();
        let mut app_state = state.lock().unwrap();
        let should = ignore != app_state.cursor_ignored;
        if should {
            app_state.cursor_ignored = ignore;
        }
        should
    };
    if should {
        if let Some(window) = app.get_webview_window("main") {
            window
                .set_ignore_cursor_events(ignore)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, __, ___| {}))
        .plugin(tauri_plugin_prevent_default::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 全局状态
            app.manage(Mutex::new(AppState::new(&app_handle)));

            // 托盘菜单
            let toggle_item = MenuItem::with_id(app, "toggle", "暂停", true, None::<&str>)?;
            let silent_item = MenuItem::with_id(app, "silent", "进入静默模式", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            // 启动全局输入捕获(钩子线程 + 工作线程)
            start_input_listener(app_handle.clone(), toggle_item.clone());

            let menu = Menu::with_items(app, &[&toggle_item, &silent_item, &settings_item, &quit_item])?;
            let _ = TrayIconBuilder::with_id("keyboo-tray")
                .icon(Image::from(include_image!("icons/32x32.png")))
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
                            .build()
                            .unwrap();
                        let _ = window.set_focus();
                        let _ = app.emit_to("main", "settings-window", true);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // 覆盖层主窗口(默认铺满主显示器)。
            // 点击穿透 + 置顶 + 尺寸在不可见时先配好;show 由前端首帧后触发
            // (show_main_window),避免 WebView 未渲染时的窗体闪烁。
            if let Some(window) = app.get_webview_window("main") {
                config_overlay_window(&window);
                if let Ok(monitors) = tauri::WebviewWindow::available_monitors(&window) {
                    if let Some(monitor) = monitors.first() {
                        let _ = window.set_position(*monitor.position());
                        let _ = window.set_size(tauri::PhysicalSize::new(
                            monitor.size().width,
                            monitor.size().height,
                        ));
                        let state = app.state::<Mutex<AppState>>();
                        state.lock().unwrap().monitor_position =
                            (monitor.position().x, monitor.position().y);
                    }
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

            Ok(())
        })
        .on_window_event(|window, event| {
            // 设置窗口关闭时通知覆盖层
            if window.label() != "settings" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window
                    .app_handle()
                    .emit_to("main", "settings-window", false);
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_main_window_monitor,
            set_toggle_shortcut,
            set_cursor_passthrough,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Keyboo");
}
