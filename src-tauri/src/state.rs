//! 应用全局状态

use tauri::{menu::MenuItem, AppHandle, Emitter, Wry};

pub struct AppState {
    /// 是否监听并显示输入事件
    pub listening: bool,
    /// 静默模式:继续收集但前端不显示(输入敏感内容时使用)
    pub silent: bool,
    /// 覆盖层所在显示器的原点(物理像素),用于鼠标坐标换算
    pub monitor_position: (i32, i32),
}

impl AppState {
    pub fn new() -> Self {
        Self {
            listening: true,
            silent: false,
            monitor_position: (0, 0),
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
