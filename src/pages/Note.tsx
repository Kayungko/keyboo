// 便签窗口主页面:键帽便签——待办清单、头部拖动、高度自适应。
// 配置(accentColor)从设置窗口单向同步;todos 由本窗口独占持久化(noteStorage)。
// 在输入框打字计入伙伴 XP:全局低级钩子与窗口焦点无关,无需额外处理。

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { listenSync } from "@/stores/sync";
import { NOTE_CONFIG_STORE_NAME, useNoteConfigStore } from "@/stores/useNoteConfigStore";
import { useNoteStore } from "@/stores/useNoteStore";

const MAX_TEXT = 42;

/** 勾选完成的爪印标记(强调色填充,轻度伙伴元素) */
function PawMark() {
  return (
    <svg className="todo-paw" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="5.5" cy="7.5" rx="2" ry="2.8" />
      <ellipse cx="12" cy="5.8" rx="2" ry="2.8" />
      <ellipse cx="18.5" cy="7.5" rx="2" ry="2.8" />
      <path d="M12 10.5c-3.6 0-6.2 2.6-6.2 5.3 0 1.9 1.6 3.2 3.2 3.2.9 0 1.7-.4 3-.4s2.1.4 3 .4c1.6 0 3.2-1.3 3.2-3.2 0-2.7-2.6-5.3-6.2-5.3z" />
    </svg>
  );
}

/** 右上角图钉:直立=置顶,斜放=普通层级(会被其他应用遮挡) */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 3.5 20.5 9.5 17.9 10.3 16.7 11.5 16.2 15.5 8.5 7.8 12.5 7.3 13.7 6.1Z" />
      <path d="M11.4 12.6 4.9 19.1" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Note() {
  const todos = useNoteStore((s) => s.todos);
  const addTodo = useNoteStore((s) => s.addTodo);
  const toggleTodo = useNoteStore((s) => s.toggleTodo);
  const removeTodo = useNoteStore((s) => s.removeTodo);
  const accentColor = useNoteConfigStore((s) => s.accentColor);

  const cardRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(true);

  // 恢复钉住态(Rust 独占条目 keyboo-note-pinned,默认 true);
  // 同窗口生命周期内不再变化:钉住切换只发生在本窗口按钮上
  useEffect(() => {
    invoke<boolean>("get_note_pinned")
      .then((value) => setPinned(value))
      .catch(() => {});
  }, []);

  // 首帧渲染后显示窗口(Rust 侧有兜底逻辑);
  // 配置同步:便签窗口只收不发,与覆盖层窗口的消费侧角色一致
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      invoke("show_note_window").catch(() => {});
    });
    const unlisten = listenSync(NOTE_CONFIG_STORE_NAME, useNoteConfigStore.setState);
    return () => {
      cancelAnimationFrame(raf);
      void unlisten.then((un) => un());
    };
  }, []);

  // 窗口高度随内容自适应:观察卡片实际高度 → 防抖通知 Rust set_size(顶部锚定向下生长)
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let timer: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const height =
        entries[0]?.borderBoxSize?.[0]?.blockSize ?? card.getBoundingClientRect().height;
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        invoke("resize_note_window", { height }).catch(() => {});
      }, 100);
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 拖动落盘:窗口移动事件防抖保存(Rust 侧钳制到虚拟屏内,幂等)
  useEffect(() => {
    let timer: number | null = null;
    const unlisten = getCurrentWindow().onMoved(() => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        invoke("save_note_position").catch(() => {});
      }, 500);
    });
    return () => {
      void unlisten.then((un) => un());
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 按住头部拖动(排除按钮目标);Windows 上模态移动循环结束后返回,
  // 落盘由 onMoved 防抖兜底,这里不重复保存
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch(() => {});
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    addTodo(draft);
    setDraft("");
  };

  // 中文 IME 确认选词的 Enter 不触发表单提交
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  };

  // 图钉切换:乐观更新 UI,Rust 侧负责 set_always_on_top + 持久化
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    invoke("set_note_pinned", { pinned: next }).catch(() => setPinned(!next));
  };

  const doneCount = todos.filter((todo) => todo.done).length;

  return (
    <div
      className="note-card"
      ref={cardRef}
      style={{ "--note-accent": accentColor } as React.CSSProperties}
    >
      <header className="note-head" onPointerDown={startDrag}>
        <div className="note-head-text">
          <span className="note-kicker">TO-DO</span>
          <h3 className="note-title">今日待办</h3>
        </div>
        <div className="note-head-actions">
          <span className="note-progress">
            {doneCount} / {todos.length}
          </span>
          <button
            type="button"
            className={pinned ? "note-pin is-pinned" : "note-pin"}
            aria-pressed={pinned}
            aria-label={pinned ? "取消置顶" : "置顶便签"}
            title={pinned ? "取消置顶" : "置顶便签"}
            onClick={togglePin}
          >
            <PinIcon />
          </button>
        </div>
      </header>

      <ul className="todo-list">
        {todos.length === 0 && <li className="todo-empty">今天还没有要做的事哦</li>}
        {todos.map((todo) => (
          <li key={todo.id} className={todo.done ? "todo-row is-done" : "todo-row"}>
            <button
              type="button"
              className="todo-check"
              aria-pressed={todo.done}
              aria-label={todo.done ? "标记为未完成" : "标记为已完成"}
              onClick={() => toggleTodo(todo.id)}
            >
              {todo.done && <PawMark />}
            </button>
            <span className="todo-text" title={todo.text}>
              {todo.text}
            </span>
            <button
              type="button"
              className="todo-delete"
              onClick={() => removeTodo(todo.id)}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      <form className="todo-form" onSubmit={submit}>
        <input
          className="todo-input"
          type="text"
          value={draft}
          maxLength={MAX_TEXT}
          autoComplete="off"
          placeholder="添加待办，按 Enter"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <button className="todo-add" type="submit">
          添加
        </button>
      </form>
    </div>
  );
}

export default Note;
