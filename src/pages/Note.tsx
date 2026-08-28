// 便签窗口主页面:键帽便签——主题/待办两级、头部拖动、高度自适应。
// 配置(accentColor)从设置窗口单向同步;todos/topics 由本窗口独占持久化(noteStorage)。
// 在输入框打字计入伙伴 XP:全局低级钩子与窗口焦点无关,无需额外处理。
// 层级:主题(长期项目)= 空格键行,点进子视图;子待办 = 常规字键行。
// 收纳语义:平铺待办完成即飞收纳盒;主题内子待办完成只是进度(爪印+划线,不飞),
// 全部完成时整颗空格键飞收纳盒(战利品入柜)。
// 过渡:翻页/视图切换/进出主题共用方向感知滑动(旧页快照离场 + 新页滑入)。

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { listenSync } from "@/stores/sync";
import { NOTE_CONFIG_STORE_NAME, useNoteConfigStore } from "@/stores/useNoteConfigStore";
import { useNoteStore, type TodoItem, type Topic } from "@/stores/useNoteStore";

const MAX_TEXT = 42;
/** 每页条数:列表区 max-height 320px,每行 36px+2px 间距,8 条=302px 恰好放下 */
const PAGE_SIZE = 8;

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

/** 收纳盒入口:收纳箱(archive box)造型,开口朝上——收进来的都在里面 */
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20V9Z" />
      <path
        d="M9 13.5h6"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="icon-stroke"
      />
      <path
        d="M3 4.5h18v3.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5Z"
        className="icon-stroke"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** 收纳表行的完成时间:今天显示 HH:MM,更早显示 M/D,缺失(旧数据)显示占位符 */
function formatDoneAt(ts?: number) {
  if (!ts) return "–";
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 拖动排序会话快照(坐标一律取内容坐标,兼容列表滚动) */
interface DragSession {
  pointerId: number;
  id: string;
  from: number;
  current: number;
  /** 各行顶部相对列表内容的偏移(含已滚动距离) */
  tops: number[];
  /** 相邻两行的间距(行高 + 列表 gap),即 FLIP 让位的平移步长 */
  spacing: number;
  height: number;
  /** 当前页首行在完整数组中的偏移(分页下的全局索引换算) */
  offset: number;
  /** 拖动对象是主题行还是待办行(落盘走不同 store action) */
  isTopic: boolean;
}

type NoteView = "active" | "done";

/** 主列表行:平铺待办或主题(渲染层统一项,带类型标记) */
type MainRow =
  | { kind: "todo"; item: TodoItem }
  | { kind: "topic"; item: Topic; total: number; done: number };

export function Note() {
  const todos = useNoteStore((s) => s.todos);
  const topics = useNoteStore((s) => s.topics);
  const addTodo = useNoteStore((s) => s.addTodo);
  const toggleTodo = useNoteStore((s) => s.toggleTodo);
  const removeTodo = useNoteStore((s) => s.removeTodo);
  const updateTodo = useNoteStore((s) => s.updateTodo);
  const reorderTodo = useNoteStore((s) => s.reorderTodo);
  const addTopic = useNoteStore((s) => s.addTopic);
  const updateTopic = useNoteStore((s) => s.updateTopic);
  const removeTopic = useNoteStore((s) => s.removeTopic);
  const accentColor = useNoteConfigStore((s) => s.accentColor);

  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(true);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [view, setView] = useState<NoteView>("active");
  const [page, setPage] = useState(1);
  /** 进入中的主题 id;null = 主列表 */
  const [topicId, setTopicId] = useState<string | null>(null);
  /** 输入框目标类型:主列表下决定 Enter 建的是待办还是主题 */
  const [composeAsTopic, setComposeAsTopic] = useState(false);
  // 离场快照:翻页/视图切换时旧列表的静态影子(无交互),动画结束即卸载
  const [leaving, setLeaving] = useState<{
    node: React.ReactNode;
    dir: 1 | -1;
    key: string;
  } | null>(null);

  const archiveBtnRef = useRef<HTMLButtonElement>(null);

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

  // 离场快照的寿命:略长于动画(200ms),兜底清理(快速连点时被新快照顶替)
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), 260);
    return () => clearTimeout(timer);
  }, [leaving]);

  // 按住头部拖动(排除按钮目标);Windows 上模态移动循环结束后返回,
  // 落盘由 onMoved 防抖兜底,这里不重复保存
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch(() => {});
  };

  // ── 视图与分页 ──

  // 主列表:平铺进行中待办(数组序)+ 进行中主题(建好的空主题也显示,可拆解)
  const activeTodos = todos.filter((todo) => !todo.done && !todo.topicId);
  const activeTopics = topics.filter((t) => !t.doneAt);
  const mainRows: MainRow[] = [
    ...activeTodos.map((item): MainRow => ({ kind: "todo", item })),
    ...activeTopics.map((item): MainRow => {
      const children = todos.filter((t) => t.topicId === item.id);
      return { kind: "topic", item, total: children.length, done: children.filter((c) => c.done).length };
    }),
  ];
  // 当前主题子待办(创建序);主题完成瞬间整体离场,子视图自动回主列表
  const currentTopic = topicId ? topics.find((t) => t.id === topicId) : undefined;
  const currentChildren = topicId ? todos.filter((t) => t.topicId === topicId) : [];
  // 收纳表:已完成平铺待办 + 已完结主题,完成时间倒序(最新在最上)
  const archiveRows: MainRow[] = [
    ...todos
      .filter((todo) => todo.done && !todo.topicId)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .map((item): MainRow => ({ kind: "todo", item })),
    ...topics
      .filter((t) => t.doneAt)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .map((item): MainRow => {
        const children = todos.filter((t) => t.topicId === item.id);
        return { kind: "topic", item, total: children.length, done: children.filter((c) => c.done).length };
      }),
  ].sort((a, b) => (b.item.doneAt ?? 0) - (a.item.doneAt ?? 0));

  const viewRows = view === "active" ? (topicId ? currentChildren.map((item): MainRow => ({ kind: "todo", item })) : mainRows) : archiveRows;
  const pageCount = Math.max(1, Math.ceil(viewRows.length / PAGE_SIZE));
  // 删除/取消完成后页码可能越界,派生安全页码兜底
  const pageSafe = Math.min(page, pageCount);
  const pageRows = viewRows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const pageOffset = (pageSafe - 1) * PAGE_SIZE;

  // 主题完成瞬间(最后一个子待办勾掉)自动退出子视图回主列表:
  // 主题行离开进行中列表,回主列表能看到收纳飞行动画的落点语境
  const justArchived = topicId && currentTopic?.doneAt;
  useEffect(() => {
    if (justArchived) {
      const flyEl = document.querySelector<HTMLElement>(`.topic-row[data-topic-id="${topicId}"] .todo-topic-keycap`);
      setTopicId(null);
      if (flyEl) flySpacebar(flyEl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justArchived]);

  // 列表跳转统一入口(翻页/视图切换/进出主题共用):
  // 先把当前页快照进离场层,再切状态;dir=1 内容左移(下一页/进收纳/进主题),dir=-1 反向
  const goList = (nextPage: number, nextView: NoteView, nextTopicId: string | null, dir: 1 | -1) => {
    setLeaving({ node: renderRows(pageRows, true), dir, key: `${view}-${topicId ?? "main"}-${pageSafe}` });
    setView(nextView);
    setPage(nextPage);
    setTopicId(nextTopicId);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    if (topicId) {
      // 子视图内:一律加子待办
      addTodo(draft, topicId);
      setDraft("");
      return;
    }
    if (composeAsTopic) {
      // 主列表:建主题并直接进它的子视图开始拆解
      const id = addTopic(draft);
      setDraft("");
      goList(1, "active", id, 1);
      return;
    }
    addTodo(draft);
    setDraft("");
    // 新事项落在进行中列表末尾:跳到它所在页
    goList(Math.ceil((activeTodos.length + 1) / PAGE_SIZE), "active", null, 1);
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

  // 收纳盒按钮 = 视图切换:进行中 ↔ 已完成(收纳表)
  const switchView = () => {
    goList(1, view === "active" ? "done" : "active", null, view === "active" ? 1 : -1);
  };

  // ── 收纳飞行:克隆体飞向头部收纳盒 ──
  // 状态立即更新(行离开进行中列表),幽灵承担「东西去哪了」的指向;
  // 克隆体挂在卡片内以继承 --note-* 变量,position: fixed 相对视口定位

  const gulpArchive = () => {
    const btn = archiveBtnRef.current;
    if (!btn) return;
    btn.classList.add("is-gulp");
    window.setTimeout(() => btn.classList.remove("is-gulp"), 240);
  };

  /** 平铺待办:键帽克隆体飞行(340ms);主题完成:整颗空格键飞行,更重的一级 */
  const flyToArchive = (el: HTMLElement, wide: boolean) => {
    const btn = archiveBtnRef.current;
    const card = cardRef.current;
    if (!btn || !card) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gulpArchive();
      return;
    }
    const from = el.getBoundingClientRect();
    const to = btn.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("todo-fly-ghost");
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    card.appendChild(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const anim = ghost.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        // 前段以位移为主,尾段缩没——像被盒子吸进去
        {
          transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(0.8)`,
          opacity: 0.95,
          offset: 0.7,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
      ],
      { duration: wide ? 460 : 340, easing: "cubic-bezier(0.77, 0, 0.175, 1)" },
    );
    anim.onfinish = () => ghost.remove();
    anim.oncancel = () => ghost.remove();
    // 吞咽脉冲对齐到达时刻(飞行的尾段)
    window.setTimeout(gulpArchive, wide ? 400 : 290);
  };

  /** 主题完成:空格键飞行。在 justArchived effect 里调用(此时行还在/或刚离场) */
  const flySpacebar = (el: HTMLElement) => flyToArchive(el, true);

  // ── 行内编辑:点文本进入,Enter/失焦保存,Esc 取消 ──
  // 保存时 trim 为空则不变更(想删有删除按钮,不做"空即删"的隐式行为)

  const commitEdit = () => {
    if (!editing) return;
    // 主题名与待办文本共用 editing 状态;id 前缀区分落盘目标
    if (editing.id.startsWith("topic:")) {
      updateTopic(editing.id.slice(6), editing.text);
    } else {
      updateTodo(editing.id, editing.text);
    }
    setEditing(null);
  };

  const onEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commitEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    }
  };

  // ── 拖动排序:序号键帽即把手,FLIP 让位(仅主列表平铺待办行) ──
  // 拖动中不触发 React 重渲染,平移与序号变号直接改 DOM;
  // 松手时先关让位过渡再清 transform,让重排与清场同帧落地(无回弹)

  const rowsOf = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>(".todo-row") ?? []);

  const onHandlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
    id: string,
  ) => {
    if (event.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = rowsOf();
    if (rows.length < 2 || !rows[index]) return;
    const listRect = list.getBoundingClientRect();
    const tops = rows.map(
      (row) => row.getBoundingClientRect().top - listRect.top + list.scrollTop,
    );
    const spacing = tops.length > 1 ? tops[1] - tops[0] : rows[0].offsetHeight;
    dragRef.current = {
      pointerId: event.pointerId,
      id,
      from: index,
      current: index,
      tops,
      spacing,
      height: rows[index].offsetHeight,
      offset: pageOffset,
      isTopic: false,
    };
    list.classList.add("is-reordering");
    rows[index].classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const list = listRef.current;
    if (!drag || !list || event.pointerId !== drag.pointerId) return;

    const listRect = list.getBoundingClientRect();
    const contentY = event.clientY - listRect.top + list.scrollTop;

    // 抓点在键帽中心 ≈ 行中心,行中心跟随指针
    const rows = rowsOf();
    const dy = contentY - drag.tops[drag.from] - drag.height / 2;
    rows[drag.from].style.transform = `translateY(${dy}px) scale(1.02)`;

    const target = Math.max(
      0,
      Math.min(rows.length - 1, Math.floor((contentY - drag.tops[0]) / drag.spacing)),
    );
    if (target === drag.current) return;
    drag.current = target;

    // FLIP 让位:区间内各行平移一格,序号实时变号(全局序号 = 页偏移 + 页内序号)
    const down = target > drag.from;
    rows.forEach((row, i) => {
      const label = row.querySelector<HTMLElement>(".todo-keycap");
      if (i === drag.from) {
        if (label) label.textContent = String(drag.offset + target + 1);
        return;
      }
      let shift = 0;
      if (down && i > drag.from && i <= target) shift = -1;
      else if (!down && i < drag.from && i >= target) shift = 1;
      row.style.transform = shift ? `translateY(${shift * drag.spacing}px)` : "";
      if (label) label.textContent = String(drag.offset + i + shift + 1);
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const list = listRef.current;
    if (list) {
      // 先摘除 is-reordering(关闭让位过渡)再清 transform,避免松手回弹
      list.classList.remove("is-reordering");
      rowsOf().forEach((row, i) => {
        row.classList.remove("is-dragging");
        row.style.transform = "";
        // 中止拖动没有重排,序号回到自然顺序(有重排时 React 重渲染会覆盖)
        if (!commit) {
          const label = row.querySelector<HTMLElement>(".todo-keycap");
          if (label) label.textContent = String(drag.offset + i + 1);
        }
      });
    }
    if (commit && drag.current !== drag.from) {
      reorderTodo(drag.id, drag.offset + drag.current);
    }
  };

  // 进度徽章口径:所有叶子待办的完成数/总数
  const doneCount = todos.filter((todo) => todo.done).length;

  // ── 行渲染(活动列表 / 收纳表 / 离场快照共用) ──
  // snapshot=true 时输出无交互纯展示行(离场影子);否则输出完整交互行

  function renderCheck(row: MainRow, snapshot: boolean) {
    const todo = row.kind === "todo" ? row.item : undefined;
    const done = row.kind === "topic" ? row.done === row.total && row.total > 0 : todo?.done;
    if (snapshot) {
      return <span className="todo-check">{done && <PawMark />}</span>;
    }
    if (row.kind === "topic") {
      // 主题行不设勾选框(完成由子待办驱动);主列表给空占位保持网格对齐
      return <span className="todo-check" aria-hidden="true" />;
    }
    return (
      <button
        type="button"
        className="todo-check"
        aria-pressed={todo!.done}
        aria-label={todo!.done ? "标记为未完成" : "标记为已完成"}
        onClick={(event) => {
          // 先量几何再改状态:完成瞬间行即离列,幽灵键帽接管指向。
          // 主题内子待办完成不飞(只是进度);平铺待办完成才飞
          if (!todo!.done) {
            const row = event.currentTarget.closest<HTMLElement>(".todo-row");
            const keycap = row?.querySelector<HTMLElement>(".todo-keycap");
            if (row && keycap && !todo!.topicId) flyToArchive(keycap, false);
          }
          toggleTodo(todo!.id);
        }}
      >
        {todo!.done && <PawMark />}
      </button>
    );
  }

  function renderTopicRow(row: Extract<MainRow, { kind: "topic" }>, snapshot: boolean) {
    const t = row.item;
    const inArchive = view === "done";
    return (
      <li
        key={t.id}
        className={inArchive ? "todo-row topic-row is-done" : "todo-row topic-row"}
        data-topic-id={t.id}
      >
        {renderCheck(row, snapshot)}
        {inArchive ? (
          <span className="todo-time" title="完成时间">
            {formatDoneAt(t.doneAt)}
          </span>
        ) : null}
        {snapshot ? (
          <span className="todo-topic-keycap">
            <span className="todo-topic-title">{t.title}</span>
            <span className="todo-topic-count">
              {row.done}/{row.total}
            </span>
          </span>
        ) : inArchive ? (
          // 收纳表中的主题:静态展示,点爪印区提示回进行中(在子待办处取消)
          <span className="todo-topic-keycap is-pressed">
            <span className="todo-topic-title">{t.title}</span>
            <span className="todo-topic-count">
              {row.done}/{row.total}
            </span>
          </span>
        ) : (
          // 主列表主题行:点进子视图;名可编辑;空格键即视觉主体
          <button
            type="button"
            className="todo-topic-keycap"
            title="点进主题拆解步骤"
            onClick={() => goList(1, "active", t.id, 1)}
          >
            <span className="todo-topic-title">{t.title}</span>
            <span className="todo-topic-count">
              {row.done}/{row.total}
            </span>
          </button>
        )}
        <button
          type="button"
          className="todo-delete"
          onClick={() => {
            if (window.confirm(`删除主题「${t.title}」及其全部 ${row.total} 条待办?`)) {
              removeTopic(t.id);
            }
          }}
        >
          删除
        </button>
      </li>
    );
  }

  function renderRows(rows: MainRow[], snapshot: boolean): React.ReactNode {
    return rows.map((row, index) => {
      if (row.kind === "topic") {
        return renderTopicRow(row, snapshot);
      }
      const todo = row.item;
      const showKeycap = view === "active" && !snapshot;
      const showArchiveTime = view === "done";
      return (
        <li key={todo.id} className={todo.done ? "todo-row is-done" : "todo-row"}>
          {renderCheck(row, snapshot)}
          {showArchiveTime ? (
            <span className="todo-time" title="完成时间">
              {formatDoneAt(todo.doneAt)}
            </span>
          ) : showKeycap ? (
            <button
              type="button"
              className="todo-keycap"
              title="拖动调整顺序"
              onPointerDown={(event) => onHandlePointerDown(event, index, todo.id)}
              onPointerMove={onHandlePointerMove}
              onPointerUp={(event) => endDrag(event, true)}
              onPointerCancel={(event) => endDrag(event, false)}
            >
              {pageOffset + index + 1}
            </button>
          ) : snapshot ? (
            <span className="todo-keycap">{leaving?.key.includes("topic") ? "" : pageOffset + index + 1}</span>
          ) : (
            <span className="todo-keycap">{pageOffset + index + 1}</span>
          )}
          {editing?.id === todo.id && !snapshot ? (
            <input
              className="todo-edit"
              type="text"
              value={editing.text}
              maxLength={MAX_TEXT}
              autoComplete="off"
              aria-label="编辑待办"
              autoFocus
              ref={(el) => {
                if (el) el.setSelectionRange(el.value.length, el.value.length);
              }}
              onChange={(event) => setEditing({ id: todo.id, text: event.target.value })}
              onKeyDown={onEditKeyDown}
              onBlur={commitEdit}
            />
          ) : (
            <span
              className="todo-text"
              title={todo.text}
              onClick={() => !snapshot && setEditing({ id: todo.id, text: todo.text })}
            >
              {todo.text}
            </span>
          )}
          <button
            type="button"
            className="todo-delete"
            onClick={() => removeTodo(todo.id)}
          >
            删除
          </button>
        </li>
      );
    });
  }

  // 离场快照的行渲染需要离开前的 view 语境——goList 在切换前渲染快照,
  // renderRows 闭包捕获当时的 view/topicId,这里只做透传
  const emptyText = topicId
    ? "这个主题还没有拆解出步骤"
    : view === "active"
      ? "今天还没有要做的事哦"
      : "完成的事项会收进这里";

  const listKey = `${view}-${topicId ?? "main"}-${pageSafe}`;
  const isArchiveList = view === "done";

  return (
    <div
      className="note-card"
      ref={cardRef}
      style={{ "--note-accent": accentColor } as React.CSSProperties}
    >
      <header className="note-head" onPointerDown={startDrag}>
        <div className="note-head-text">
          {/* key 随视图切换重挂:note-swap 淡入重放(180ms,与列表滑动同一节奏) */}
          {topicId ? (
            <>
              <button
                type="button"
                className="note-back"
                aria-label="返回待办列表"
                title="返回待办列表"
                onClick={() => goList(1, "active", null, -1)}
              >
                ‹
              </button>
              <span className="note-kicker note-swap" key={`k-topic`}>
                TOPIC
              </span>
              <h3 className="note-title note-swap" key={`t-${topicId}`}>
                {currentTopic?.title ?? ""}
              </h3>
              <span className="note-topic-progress">
                {currentChildren.filter((c) => c.done).length}/{currentChildren.length}
              </span>
            </>
          ) : (
            <>
              <span className="note-kicker note-swap" key={`k-${view}`}>
                {view === "active" ? "TO-DO" : "DONE"}
              </span>
              <h3 className="note-title note-swap" key={`t-${view}`}>
                {view === "active" ? "今日待办" : "已完成"}
              </h3>
            </>
          )}
        </div>
        <div className="note-head-actions">
          <span className="note-progress">
            {doneCount} / {todos.length}
          </span>
          <button
            type="button"
            ref={archiveBtnRef}
            className={view === "done" ? "note-archive is-active" : "note-archive"}
            aria-pressed={view === "done"}
            aria-label={view === "done" ? "返回进行中" : "查看已完成收纳盒"}
            title={view === "done" ? "返回进行中" : "已完成收纳盒"}
            onClick={switchView}
          >
            <ArchiveIcon />
          </button>
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

      <div className="todo-list-wrap">
        {/* 离场影子:旧页静态快照,绝对定位盖在新页上滑出,动画完由 leaving 寿命卸载 */}
        {leaving && (
          <ul
            className={
              leaving.key.includes("done") ? "todo-list is-archive is-leaving" : "todo-list is-leaving"
            }
            aria-hidden="true"
            style={{ "--page-dir": leaving.dir } as React.CSSProperties}
          >
            {leaving.node}
          </ul>
        )}
        {/* key 随页/视图/主题重挂:每次跳转重放 note-page-in 进入动画 */}
        <ul
          className={
            leaving
              ? isArchiveList
                ? "todo-list is-archive is-entering"
                : "todo-list is-entering"
              : isArchiveList
                ? "todo-list is-archive"
                : "todo-list"
          }
          key={listKey}
          ref={listRef}
          style={{ "--page-dir": (leaving?.dir ?? 1) as number } as React.CSSProperties}
        >
          {viewRows.length === 0 && <li className="todo-empty">{emptyText}</li>}
          {renderRows(pageRows, false)}
        </ul>
      </div>

      {pageCount > 1 && (
        <nav className="todo-pager" aria-label="待办分页">
          <button
            type="button"
            disabled={pageSafe === 1}
            aria-label="上一页"
            onClick={() => goList(Math.max(1, pageSafe - 1), view, topicId, -1)}
          >
            ‹
          </button>
          <span className="todo-pager-num">
            {pageSafe} / {pageCount}
          </span>
          <button
            type="button"
            disabled={pageSafe === pageCount}
            aria-label="下一页"
            onClick={() => goList(Math.min(pageCount, pageSafe + 1), view, topicId, 1)}
          >
            ›
          </button>
        </nav>
      )}

      <form className="todo-form" onSubmit={submit}>
        {!topicId && (
          <button
            type="button"
            className={composeAsTopic ? "todo-compose topic" : "todo-compose"}
            aria-pressed={composeAsTopic}
            aria-label={composeAsTopic ? "改为添加待办" : "改为添加主题"}
            title={composeAsTopic ? "输入框将新建主题" : "输入框将新建待办"}
            onClick={() => setComposeAsTopic((v) => !v)}
          >
            {composeAsTopic ? "主题" : "待办"}
          </button>
        )}
        <input
          className="todo-input"
          type="text"
          value={draft}
          maxLength={MAX_TEXT}
          autoComplete="off"
          placeholder={
            topicId
              ? "添加步骤，按 Enter"
              : composeAsTopic
                ? "添加主题，按 Enter"
                : "添加待办，按 Enter"
          }
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
