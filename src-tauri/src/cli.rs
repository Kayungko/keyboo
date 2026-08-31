//! CLI 子命令与外部写入路由(AI 创建待办的第一阶段)
//!
//! 形态:
//!   keyboo todo add [--project <主题名>] <条目文本>
//!   keyboo project new <主题名>
//!   keyboo todo list
//!   keyboo project list
//!
//! 写操作(add/new):第二实例在启动早期(Builder 之前)校验参数并打印结果,
//! 随后由 single-instance 插件把 argv 转发给常驻实例;常驻实例解析后存入
//! Rust 侧内存队列并通知便签窗口前端消费——便签窗口是 keyboo-note-store
//! 的唯一写者,外部写入必须路由经它,Rust 绝不直接落盘该键。
//! 读操作(list):第二实例直接只读 keyboo.json 的 keyboo-note-store 键,
//! 打印后退出,不启动应用也不转发(读不违反唯一写者)。
//!
//! 冷启动兜底:应用未运行时用户直接跑 CLI 写命令,本进程照常启动成为常驻实例,
//! setup 阶段把启动参数里的操作同样入队;便签 webview 挂载时主动调用
//! take_external_ops 取走队列,事件丢失也不漏单。

use serde::{Deserialize, Serialize};

/// 条目文本/主题名的长度上限(字符数,与前端输入框 maxlength 同源;
/// 前端 TodoItem.text / Topic.title 注释同为 1..42)
const CLI_TEXT_MAX_CHARS: usize = 42;

/// 外部写入操作。前端按 type 判别联合消费(camelCase 字段,TS 可直接对齐):
/// - {"type":"addTodo","text":"买牛奶","project":null}
/// - {"type":"addTodo","text":"买牛奶","project":"购物"}
/// - {"type":"addProject","title":"购物"}
///
/// project 传主题标题(不是 topicId):外部调用方只知道标题,解析为
/// topicId / 不存在时自建主题由前端唯一写者完成
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ExternalOp {
    AddTodo {
        text: String,
        project: Option<String>,
    },
    AddProject {
        title: String,
    },
}

/// CLI 子命令(解析产物)
pub enum CliCommand {
    ListTodos,
    ListProjects,
    Write(ExternalOp),
}

/// argv 解析结果
pub enum CliParse {
    /// 无 CLI 子命令:正常启动/转发路径外,保持原行为
    None,
    Command(CliCommand),
    /// 参数校验失败:调用方向 stderr 输出错误并以非零退出码退出
    Invalid(String),
}

fn usage() -> String {
    "用法:\n  keyboo todo add [--project <主题名>] <条目文本>\n  keyboo project new <主题名>\n  keyboo todo list\n  keyboo project list".to_string()
}

/// 解析 argv(含 argv[0] 程序路径)。只认 todo/project 两个子命令,
/// 其余参数一律视为正常启动(保持 deep-link 等既有参数的兼容)
pub fn parse_cli(args: &[String]) -> CliParse {
    if args.len() < 2 {
        return CliParse::None;
    }
    let rest = &args[1..];
    match rest[0].as_str() {
        "todo" => match rest.get(1).map(|s| s.as_str()) {
            Some("add") => parse_todo_add(&rest[2..]),
            Some("list") => CliParse::Command(CliCommand::ListTodos),
            _ => CliParse::Invalid(usage()),
        },
        "project" => match rest.get(1).map(|s| s.as_str()) {
            Some("new") => parse_project_new(&rest[2..]),
            Some("list") => CliParse::Command(CliCommand::ListProjects),
            _ => CliParse::Invalid(usage()),
        },
        _ => CliParse::None,
    }
}

/// `todo add [--project <主题名>] <条目文本>`:
/// Windows argv 已由系统按引号切分(引号内空格保留在单个参数中),
/// 这里把散装的多余参数以空格拼接为一条文本,--project 可出现在任意位置
fn parse_todo_add(rest: &[String]) -> CliParse {
    let mut project: Option<String> = None;
    let mut text_parts: Vec<&str> = Vec::new();
    let mut i = 0;
    while i < rest.len() {
        if rest[i] == "--project" {
            match rest.get(i + 1) {
                Some(name) => {
                    project = Some(name.clone());
                    i += 2;
                }
                None => return CliParse::Invalid("--project 缺少主题名参数".to_string()),
            }
        } else {
            text_parts.push(rest[i].as_str());
            i += 1;
        }
    }
    let text = validate_text(&text_parts.join(" "), "条目文本");
    let text = match text {
        Ok(t) => t,
        Err(e) => return CliParse::Invalid(e),
    };
    let project = match project {
        Some(p) => match validate_text(&p, "主题名") {
            Ok(p) => Some(p),
            Err(e) => return CliParse::Invalid(e),
        },
        None => None,
    };
    CliParse::Command(CliCommand::Write(ExternalOp::AddTodo { text, project }))
}

/// `project new <主题名>`:同理允许多余参数拼接
fn parse_project_new(rest: &[String]) -> CliParse {
    let title = match validate_text(&rest.join(" "), "主题名") {
        Ok(t) => t,
        Err(e) => return CliParse::Invalid(e),
    };
    CliParse::Command(CliCommand::Write(ExternalOp::AddProject { title }))
}

/// trim 后非空且 ≤42 字符(与前端校验同源)
fn validate_text(raw: &str, label: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if trimmed.chars().count() > CLI_TEXT_MAX_CHARS {
        return Err(format!("{label}超过 {CLI_TEXT_MAX_CHARS} 字符上限"));
    }
    Ok(trimmed.to_string())
}

/// GUI 子系统(windows_subsystem="windows")进程不继承父终端控制台,
/// CLI 输出前需挂接到父进程控制台;已带控制台的场合(如 dev 构建)会失败,静默忽略
pub fn attach_parent_console() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
        unsafe {
            let _ = AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
}

// ---------------------------------------------------------------------------
// 只读 list:直接解析 keyboo.json(不启动 Tauri,无需 AppHandle)
// ---------------------------------------------------------------------------

/// 便签持久化快照(zustand persist 的 state 部分,只取 CLI 展示所需字段;
/// 字段名 camelCase,与前端 TodoItem / Topic 接口对齐)。
/// 仅模块内可见字段,打印逻辑也收在本模块
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteStoreSnapshot {
    #[serde(default)]
    todos: Vec<TodoSnapshot>,
    #[serde(default)]
    topics: Vec<TopicSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TodoSnapshot {
    text: String,
    done: bool,
    #[serde(default)]
    topic_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopicSnapshot {
    id: String,
    title: String,
    #[serde(default)]
    done_at: Option<f64>,
}

/// 只读解析 keyboo.json 的 keyboo-note-store 键。
/// 注意:该键的值是 JSON 字符串(zustand persist 双重编码),必须先取字符串
/// 再二次 JSON 解析;且 persist 的真实形状是 {state: {...}, version} 信封,
/// todos/topics 嵌在 state 里——直接按顶层解析会被 serde(default) 静默吞成
/// 空列表(实测踩过的坑)。按对象索引会 panic(见 lib.rs set_toggle_shortcut
/// 处记录过的同类坑)。读不违反唯一写者,所以 list 无须经便签窗口路由
pub fn read_note_store_snapshot(identifier: &str) -> Result<NoteStoreSnapshot, String> {
    // 与 tauri-plugin-store 的路径解析规则一致:
    // Windows 下 app_data_dir = %APPDATA%/<identifier>,store 相对路径基于它
    let base = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 目录".to_string())?;
    let path = std::path::Path::new(&base).join(identifier).join("keyboo.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|_| format!("未找到便签数据文件:{}", path.display()))?;
    let root: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("解析 keyboo.json 失败:{e}"))?;
    let payload = root
        .get("keyboo-note-store")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "keyboo-note-store 条目缺失或格式异常".to_string())?;
    parse_note_store_payload(payload)
}

/// 解析 keyboo-note-store 键的字符串值(zustand persist 信封)。
/// 信封真实形状是 {state: {...}, version}——todos/topics 嵌在 state 里;
/// 直接按顶层解析会被 serde(default) 静默吞成空列表(实测踩过的坑),
/// 所以独立成函数并用真实形状的测试锁定
fn parse_note_store_payload(payload: &str) -> Result<NoteStoreSnapshot, String> {
    #[derive(Deserialize)]
    struct PersistEnvelope {
        state: NoteStoreSnapshot,
    }
    let envelope: PersistEnvelope =
        serde_json::from_str(payload).map_err(|e| format!("解析便签数据失败:{e}"))?;
    Ok(envelope.state)
}

/// 输出末尾的固定注释:便签端 store 有 ≤1s 的 autoSave 防抖延迟,
/// 最近完成的操作可能尚未落盘(设计如此,不做等待处理)
const AUTOSAVE_NOTE: &str = "# 注:便签存在 ≤1s 的自动保存延迟,最近的变更可能尚未落盘";

/// 打印全部待办:先按主题分组(含进度),再列平铺待办
pub fn print_todo_list(snapshot: &NoteStoreSnapshot) {
    let has_topic = !snapshot.topics.is_empty();
    for topic in &snapshot.topics {
        let children: Vec<&TodoSnapshot> = snapshot
            .todos
            .iter()
            .filter(|t| t.topic_id.as_deref() == Some(topic.id.as_str()))
            .collect();
        let done = children.iter().filter(|t| t.done).count();
        println!(
            "# {} ({}/{}){}",
            topic.title,
            done,
            children.len(),
            if topic.done_at.is_some() { " [已完成]" } else { "" }
        );
        for todo in children {
            println!("  [{}] {}", if todo.done { "x" } else { " " }, todo.text);
        }
    }
    let flat: Vec<&TodoSnapshot> = snapshot
        .todos
        .iter()
        .filter(|t| t.topic_id.is_none())
        .collect();
    if !flat.is_empty() {
        if has_topic {
            println!("— 平铺 —");
        }
        for todo in &flat {
            println!("[{}] {}", if todo.done { "x" } else { " " }, todo.text);
        }
    }
    if snapshot.topics.is_empty() && flat.is_empty() {
        println!("暂无待办");
    }
    println!("{AUTOSAVE_NOTE}");
}

/// 打印主题列表(含整体完成态)
pub fn print_project_list(snapshot: &NoteStoreSnapshot) {
    if snapshot.topics.is_empty() {
        println!("暂无主题");
    }
    for topic in &snapshot.topics {
        let children: Vec<&TodoSnapshot> = snapshot
            .todos
            .iter()
            .filter(|t| t.topic_id.as_deref() == Some(topic.id.as_str()))
            .collect();
        let done = children.iter().filter(|t| t.done).count();
        println!(
            "{} ({}/{}){}",
            topic.title,
            done,
            children.len(),
            if topic.done_at.is_some() { " [已完成]" } else { "" }
        );
    }
    println!("{AUTOSAVE_NOTE}");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    /// ExternalOp 的 JSON 形状是与前端的接口契约,这里逐字锁定
    #[test]
    fn external_op_json_shape() {
        let op = ExternalOp::AddTodo {
            text: "买牛奶".into(),
            project: None,
        };
        assert_eq!(
            serde_json::to_string(&op).unwrap(),
            r#"{"type":"addTodo","text":"买牛奶","project":null}"#
        );
        let op = ExternalOp::AddTodo {
            text: "买牛奶".into(),
            project: Some("购物".into()),
        };
        assert_eq!(
            serde_json::to_string(&op).unwrap(),
            r#"{"type":"addTodo","text":"买牛奶","project":"购物"}"#
        );
        let op = ExternalOp::AddProject { title: "购物".into() };
        assert_eq!(
            serde_json::to_string(&op).unwrap(),
            r#"{"type":"addProject","title":"购物"}"#
        );
    }

    #[test]
    fn parse_todo_add_joins_and_validates() {
        // 散装参数拼接为一条文本;--project 可在任意位置
        let parsed = parse_cli(&args(&["keyboo", "todo", "add", "买", "牛奶"]));
        match parsed {
            CliParse::Command(CliCommand::Write(ExternalOp::AddTodo { text, project })) => {
                assert_eq!(text, "买 牛奶");
                assert!(project.is_none());
            }
            _ => panic!("expected Write(AddTodo)"),
        }

        let parsed = parse_cli(&args(&[
            "keyboo",
            "todo",
            "add",
            "--project",
            "购物",
            "买牛奶",
        ]));
        match parsed {
            CliParse::Command(CliCommand::Write(ExternalOp::AddTodo { text, project })) => {
                assert_eq!(text, "买牛奶");
                assert_eq!(project.as_deref(), Some("购物"));
            }
            _ => panic!("expected Write(AddTodo)"),
        }

        // 校验:空文本 / 超长 / --project 缺参
        assert!(matches!(
            parse_cli(&args(&["keyboo", "todo", "add", "   "])),
            CliParse::Invalid(_)
        ));
        let long = "字".repeat(CLI_TEXT_MAX_CHARS + 1);
        assert!(matches!(
            parse_cli(&args(&["keyboo", "todo", "add", &long])),
            CliParse::Invalid(_)
        ));
        assert!(matches!(
            parse_cli(&args(&["keyboo", "todo", "add", "--project"])),
            CliParse::Invalid(_)
        ));
    }

    #[test]
    fn parse_project_and_list() {
        assert!(matches!(
            parse_cli(&args(&["keyboo", "project", "new", "购物"])),
            CliParse::Command(CliCommand::Write(ExternalOp::AddProject { .. }))
        ));
        assert!(matches!(
            parse_cli(&args(&["keyboo", "todo", "list"])),
            CliParse::Command(CliCommand::ListTodos)
        ));
        assert!(matches!(
            parse_cli(&args(&["keyboo", "project", "list"])),
            CliParse::Command(CliCommand::ListProjects)
        ));
        // 无参数 / 未知子命令:正常启动,不进 CLI 路径
        assert!(matches!(parse_cli(&args(&["keyboo"])), CliParse::None));
        assert!(matches!(
            parse_cli(&args(&["keyboo", "todo"])),
            CliParse::Invalid(_)
        ));
        assert!(matches!(
            parse_cli(&args(&["keyboo", "https://example.com"])),
            CliParse::None
        ));
    }

    /// list 的只读解析:keyboo-note-store 的值是 JSON 字符串(双重编码),
    /// 且外层是 zustand persist 信封 {state, version}——两者缺一都会被
    /// serde(default) 静默吞成空列表。用真实形状锁定解析路径。
    #[test]
    fn snapshot_parses_double_encoded_store() {
        let state = r#"{"todos":[{"id":"a","text":"买牛奶","done":false,"createdAt":1,"topicId":"t1"},{"id":"b","text":"取快递","done":true,"createdAt":2,"doneAt":3}],"topics":[{"id":"t1","title":"购物","createdAt":4}],"collapsed":false}"#;
        // persist 真实落盘形状:值是「state 信封的 JSON 字符串」
        let inner = format!(r#"{{"state":{state},"version":3}}"#);
        let root = serde_json::json!({ "keyboo-note-store": inner });
        // raw 等价于 keyboo.json 文件原文
        let raw = serde_json::to_string(&root).unwrap();
        // 走与 read_note_store_snapshot 相同的两段解析路径:
        // 先解析出根对象,再取 keyboo-note-store 的字符串值二次解析
        let root_value = serde_json::from_str::<serde_json::Value>(&raw).unwrap();
        let payload = root_value
            .get("keyboo-note-store")
            .and_then(|v| v.as_str())
            .unwrap();
        let snapshot = parse_note_store_payload(payload).unwrap();
        assert_eq!(snapshot.topics.len(), 1);
        assert_eq!(snapshot.topics[0].title, "购物");
        assert_eq!(snapshot.todos.len(), 2);
        assert_eq!(snapshot.todos[0].topic_id.as_deref(), Some("t1"));
        assert!(snapshot.todos[1].done);
    }
}
