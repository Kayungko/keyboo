//! 应用全局状态

use tauri::{menu::MenuItem, AppHandle, Emitter, Wry};
use tauri_plugin_store::StoreExt;

pub struct AppState {
    /// 是否监听并显示输入事件
    pub listening: bool,
    /// 静默模式:继续收集但前端不显示(输入敏感内容时使用)
    pub silent: bool,
    /// 显隐快捷键(键名序列,与前端 toggleShortcut 一致)
    pub toggle_shortcut: Vec<String>,
    /// 覆盖层所在显示器的原点(物理像素),用于鼠标坐标换算
    pub monitor_position: (i32, i32),
    /// 用户选定的显示器名(None = 铺满虚拟屏幕)。
    /// 分辨率变化时据此恢复窗口归属,避免重铺覆盖用户选择
    pub selected_monitor: Option<String>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Self {
        // 默认快捷键 Shift + F10;若 store 中有用户配置则优先。
        // 读 Rust 独占条目 keyboo-toggle-shortcut(数组),
        // 不碰前端的 keyboo-event-store(JSON 字符串,格式不同)。
        let mut toggle_shortcut = vec!["ShiftLeft".to_string(), "F10".to_string()];
        if let Ok(store) = app.store("keyboo.json") {
            if let Some(value) = store.get("keyboo-toggle-shortcut") {
                if let Ok(keys) = serde_json::from_value::<Vec<String>>(value) {
                    if !keys.is_empty() {
                        toggle_shortcut = keys;
                    }
                }
            }
        }

        Self {
            listening: true,
            silent: false,
            toggle_shortcut,
            monitor_position: (0, 0),
            selected_monitor: None,
        }
    }

    pub fn toggle_listening(&mut self, app: &AppHandle, toggle_item: &MenuItem<Wry>) {
        self.listening = !self.listening;
        // 托盘首项显示的是"下一步动作":监听中→可暂停,已暂停→可继续
        let _ = toggle_item.set_text(if self.listening { "暂停" } else { "继续" });
        let _ = app.emit_to("main", "listening-toggle", self.listening);
        println!(
            "[keyboo] listening {}",
            if self.listening { "enabled" } else { "disabled" }
        );
    }

    pub fn toggle_silent(&mut self, app: &AppHandle, silent_item: &MenuItem<Wry>) {
        self.silent = !self.silent;
        let _ = silent_item.set_text(if self.silent { "退出静默模式" } else { "进入静默模式" });
        let _ = app.emit_to("main", "silent-toggle", self.silent);
    }
}
