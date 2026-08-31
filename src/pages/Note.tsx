// 便签窗口主页面:键帽便签——主题/待办两级、头部拖动、高度自适应。
// 配置(accentColor)从设置窗口单向同步;todos/topics 由本窗口独占持久化(noteStorage)。
// 在输入框打字计入伙伴 XP:全局低级钩子与窗口焦点无关,无需额外处理。
// 层级:主题(长期项目)= 空格键行,点进子视图;子待办 = 常规字键行。
// 收纳语义:平铺待办完成即飞收纳盒;主题内子待办完成只是进度(爪印+划线,不飞),
// 全部完成时整颗空格键飞收纳盒(战利品入柜)。
// 过渡:翻页/视图切换/进出主题共用方向感知滑动(旧页快照离场 + 新页滑入)。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { listenSync } from "@/stores/sync";
import { NOTE_CONFIG_STORE_NAME, useNoteConfigStore } from "@/stores/useNoteConfigStore";
import { useNoteStore, type TodoItem, type Topic } from "@/stores/useNoteStore";

const MAX_TEXT = 42;
/** 行距 pitch:行高 36 + 列表 gap 2;容量换算与拖高键盘步进(±1 行)共用 */
const ROW_PITCH = 38;
/** 列表区上下 padding 合计(.todo-list 的 padding 8px 0),容量换算前扣除 */
const LIST_PADDING_Y = 16;
/** 便签窗口总高钳制(逻辑像素):高度语义 = 窗口总高,列表区用 flex 吃剩余空间;
 *  与 Rust 侧 NOTE_HEIGHT_* 镜像,两边常量必须同步改 */
const NOTE_HEIGHT_MIN = 280;
const NOTE_HEIGHT_MAX = 860;
/** 无持久值时的默认窗口总高(Rust 侧 get_note_height 同值兜底) */
const NOTE_HEIGHT_DEFAULT = 320;
/** 容量初值:仅为 ResizeObserver 首次回调前的首帧估算,观察器一挂上即被实测值覆盖 */
const CAPACITY_BOOTSTRAP = 8;
/** 条幅态窗口总高:头部 52 + 卡片上下边框 2(展开↔条幅切换由 Rust 动画) */
const BANNER_HEIGHT = 54;
/** 条幅态打开更多菜单时的扩窗高度:菜单弹层需要透明承载区,防原生窗口裁切 */
const BANNER_MENU_HEIGHT = 156;
/** 便签宽度钳制(逻辑像素):下限=原始设计宽,上限与 Rust 侧 NOTE_WIDTH_* 一致 */
const NOTE_WIDTH_MIN = 292;
const NOTE_WIDTH_MAX = 560;
const NOTE_WIDTH_DEFAULT = 292;

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

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 14 5-5 5 5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
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

/** Rust 外部操作队列的单条指令(AI/CLI 创建待办入口);字段名与 Rust 侧 serde camelCase 对齐 */
type ExternalOp =
  | { type: "addTodo"; text: string; project?: string | null }
  | { type: "addProject"; title: string };

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
  const collapsed = useNoteStore((s) => s.collapsed);
  const setCollapsed = useNoteStore((s) => s.setCollapsed);
  const listTitle = useNoteStore((s) => s.listTitle);
  const setListTitle = useNoteStore((s) => s.setListTitle);
  const accentColor = useNoteConfigStore((s) => s.accentColor);

  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const projectEntryRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [projectComposer, setProjectComposer] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [windowMotion, setWindowMotion] = useState<"" | "is-hiding" | "is-restoring">("");
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [pinned, setPinned] = useState(true);
  /** 便签宽度(逻辑像素):事实源在 Rust,启动拉取,拖右缘热区实时推送 */
  const [noteWidth, setNoteWidth] = useState(NOTE_WIDTH_DEFAULT);
  /** 便签窗口总高(逻辑像素):事实源在 Rust,启动拉取;拖底缘热区实时推送。
   *  卡片本身 height:100vh 逐帧跟随窗口,这里的 state 只做钳制基准与拖拽起点 */
  const [noteHeight, setNoteHeight] = useState(NOTE_HEIGHT_DEFAULT);
  /** 每页容量:由列表区实测高度派生(ResizeObserver),不再用固定常量 */
  const [capacity, setCapacity] = useState(CAPACITY_BOOTSTRAP);
  /** 拖高进行中:显示「每页 N 条」徽标,并让容量实时重算(跳过去抖) */
  const [heightDragging, setHeightDragging] = useState(false);
  /** 外部操作应用后的轻量提示文案(1.5s 自动消失) */
  const [opToast, setOpToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  /** 行内编辑输入框(待办/标题共用 editing 状态,同一时刻最多渲染一个) */
  const editInputRef = useRef<HTMLInputElement>(null);
  // 光标定位只在进入编辑时执行一次。不能用 inline ref:每次重渲染都会重新调用,
  // 每敲一个字就 setSelectionRange 到末尾,光标在开头/中间打字会被强制推到最后
  useEffect(() => {
    const el = editInputRef.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [editing?.id]);
  const [view, setView] = useState<NoteView>("active");
  const [page, setPage] = useState(1);
  /** 进入中的主题 id;null = 主列表 */
  const [topicId, setTopicId] = useState<string | null>(null);
  // 离场快照:翻页/视图切换时旧列表的静态影子(无交互),动画结束即卸载
  const [leaving, setLeaving] = useState<{
    node: React.ReactNode;
    dir: 1 | -1;
    key: string;
  } | null>(null);

  const archiveBtnRef = useRef<HTMLButtonElement>(null);
  /** 拖宽会话:pointerId + 起始屏幕 x + 起始宽度;rAF 合并高频 pointermove */
  const widthDragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const widthRafRef = useRef(0);
  /** 拖高会话:pointerId + 起始屏幕 y + 起始窗口总高;rAF 合并高频 pointermove */
  const heightDragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const heightRafRef = useRef(0);
  /** 容量的同步镜像:ResizeObserver 回调里读 state 会拿到旧值,判重走 ref */
  const capacityRef = useRef(CAPACITY_BOOTSTRAP);
  /** 锚定迁移用:容量变化前的旧值 */
  const prevCapacityRef = useRef(CAPACITY_BOOTSTRAP);
  /** 外部操作提示的定时器句柄 */
  const opToastTimerRef = useRef<number | null>(null);

  // 恢复钉住态(Rust 独占条目 keyboo-note-pinned,默认 true);
  // 同窗口生命周期内不再变化:钉住切换只发生在本窗口按钮上
  useEffect(() => {
    invoke<boolean>("get_note_pinned")
      .then((value) => setPinned(value))
      .catch(() => {});
    invoke<number>("get_note_width")
      .then((value) => setNoteWidth(value))
      .catch(() => {});
    // 用户高度:条幅↔展开切换时 Rust 侧自行掌握基准,这里拉一份
    // 作为拖高/键盘微调的钳制起点
    invoke<number>("get_note_height")
      .then((value) => setNoteHeight(value))
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

  // 从托盘恢复:Rust 显示窗口后通知前端,只播放一次短促的右下→原位回场。
  useEffect(() => {
    const unlisten = listen("note-window-restored", () => {
      if (reducedMotion) {
        setWindowMotion("");
        return;
      }
      setWindowMotion("is-restoring");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWindowMotion(""));
      });
    });
    return () => {
      void unlisten.then((un) => un());
    };
  }, [reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!projectComposer) return;
    const raf = requestAnimationFrame(() => projectInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [projectComposer]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (moreMenuRef.current?.contains(target) || moreButtonRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  // ── 窗口高度模式切换(高度语义 = 窗口总高,因果已反转) ──
  // 展开态高度由用户设定(拖底缘热区/键盘微调走 set_note_height),本 effect 不插手;
  // 只有条幅态仍走 resize_note_window:条幅 = 头部高度,条幅开菜单 = 扩窗防裁切弹层。
  // 从条幅/菜单状态回到展开态时调 restore_note_height,由 Rust 动画恢复到用户高度。
  // 首次挂载(prev=null)也会对展开态发一次 restore:Rust 侧幂等,当前已是用户高度则无动作。
  const prevWindowModeRef = useRef<"expanded" | "banner" | "banner-menu" | null>(null);
  useEffect(() => {
    const mode: "expanded" | "banner" | "banner-menu" = collapsed
      ? moreOpen
        ? "banner-menu"
        : "banner"
      : "expanded";
    const prev = prevWindowModeRef.current;
    prevWindowModeRef.current = mode;
    if (prev === mode) return;
    if (mode === "expanded") {
      invoke("restore_note_height").catch(() => {});
    } else {
      invoke("resize_note_window", {
        height: mode === "banner-menu" ? BANNER_MENU_HEIGHT : BANNER_HEIGHT,
        animate: !reducedMotion,
      }).catch(() => {});
    }
  }, [collapsed, moreOpen, reducedMotion]);

  // ── 容量派生:ResizeObserver 量列表区实测高度 → 每页条数 ──
  // 因果反转:窗口总高是用户设的,列表区高度由 flex 布局决定,观察者只负责量出
  // 列表区多高,按 pitch=38 换算容量(替代原固定每页 8 条)。
  // 拖高期间实时重算(跨行边界立即改页);非拖动来源的高度变化(条幅↔展开动画
  // 中途的中间高度)做 120ms 去抖只落最终值,避免动画期间页码反复跳动。
  // 条幅态直接断开观察:列表区高度为 0,冻结容量防页码塌缩。
  useEffect(() => {
    if (collapsed) return;
    const wrap = listWrapRef.current;
    if (!wrap) return;
    let settleTimer: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const height =
        entries[0]?.borderBoxSize?.[0]?.blockSize ?? wrap.getBoundingClientRect().height;
      const next = Math.max(1, Math.floor((height - LIST_PADDING_Y) / ROW_PITCH));
      if (next === capacityRef.current) return;
      if (heightDragRef.current) {
        // 拖高中:跟手立即重算
        capacityRef.current = next;
        setCapacity(next);
        return;
      }
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (next === capacityRef.current) return;
        capacityRef.current = next;
        setCapacity(next);
      }, 120);
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [collapsed]);

  // 容量变化时锚定当前页首行:按旧容量算出首行的全局索引 anchor,
  // 新页码 = floor(anchor / 新容量)+1——眼睛盯着的条目留在原位,不因换页跳走
  // (pageSafe 的越界钳制仍在下游兜底)
  useEffect(() => {
    const prev = prevCapacityRef.current;
    if (prev === capacity) return;
    prevCapacityRef.current = capacity;
    const anchor = Math.min(Math.max(0, (page - 1) * prev), Math.max(0, viewRows.length - 1));
    setPage(Math.floor(anchor / capacity) + 1);
    // page/viewRows 读的是容量变化当帧的值,刻意不进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity]);

  // 外部操作消费(AI 创建待办入口):挂载先 take 一次兜底冷启动
  // (窗口拉起前积压的通知事件已丢失),再监听通知,收到即再取队列。
  // 事件无 payload,纯「有货了」信号,数据一律以 take_external_ops 拉取为准。
  useEffect(() => {
    const take = () => {
      invoke<ExternalOp[]>("take_external_ops")
        .then((ops) => {
          if (ops?.length) applyExternalOps(ops);
        })
        .catch(() => {});
    };
    take();
    const unlisten = listen("keyboo-external-ops", take);
    return () => {
      void unlisten.then((un) => un());
      if (opToastTimerRef.current) {
        clearTimeout(opToastTimerRef.current);
        opToastTimerRef.current = null;
      }
    };
    // applyExternalOps 只依赖稳定的 store actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 按住头部拖动(排除按钮/可编辑标题);Windows 上模态移动循环结束后返回,
  // 落盘由 onMoved 防抖兜底,这里不重复保存
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, .is-editable, input")) return;
    void getCurrentWindow().startDragging().catch(() => {});
  };

  // ── 拖宽便签:卡片左缘热区,向左拖 = 变宽 ──
  // 便签落位屏幕右上角,向左生长右缘不动、不出屏;位置补偿由 Rust 侧完成。
  // 拖拽中 save=false 只推内存实时 set_size 跟手(rAF 合并高频 pointermove),
  // 松手 save=true 落盘 keyboo-note-width,重启恢复
  const onResizeHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    widthDragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startWidth: noteWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = widthDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // 屏幕坐标算增量:窗口自身在鼠标底下移动不会改变 screenX,
    // 断掉「窗口左移 → clientX 自变 → 重算宽度」的反馈抖动回路
    const next = Math.round(
      Math.max(
        NOTE_WIDTH_MIN,
        Math.min(NOTE_WIDTH_MAX, drag.startWidth + drag.startX - event.screenX),
      ),
    );
    if (next === noteWidth) return;
    setNoteWidth(next);
    cancelAnimationFrame(widthRafRef.current);
    widthRafRef.current = requestAnimationFrame(() => {
      invoke("set_note_width", { width: next, save: false }).catch(() => {});
    });
  };

  const onResizeHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = widthDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    widthDragRef.current = null;
    cancelAnimationFrame(widthRafRef.current);
    invoke("set_note_width", { width: noteWidth, save: true }).catch(() => {});
  };

  // 键盘可达:← 左缘外推变宽,→ 收窄(与拖拽同一落盘路径)
  const onResizeHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.max(NOTE_WIDTH_MIN, Math.min(NOTE_WIDTH_MAX, noteWidth + step));
    if (next === noteWidth) return;
    setNoteWidth(next);
    invoke("set_note_width", { width: next, save: true }).catch(() => {});
  };

  // ── 拖高便签:卡片底缘通条热区,顶部锚定向下生长 ──
  // 与拖宽同一套手法:屏幕坐标算增量断反馈回路,rAF 合并高频 pointermove,
  // 拖动中 save=false 只推内存实时跟手,松手 save=true 落盘(重启恢复)。
  // 容量随拖动实时重算,手柄上方常驻「每页 N 条」徽标
  const onHeightHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    heightDragRef.current = {
      pointerId: event.pointerId,
      startY: event.screenY,
      startHeight: noteHeight,
    };
    setHeightDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHeightHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = heightDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // 窗口上缘锚定不动:screenY 增量 = 高度增量,与 clientY 无反馈回路
    const next = Math.round(
      Math.max(
        NOTE_HEIGHT_MIN,
        Math.min(NOTE_HEIGHT_MAX, drag.startHeight + event.screenY - drag.startY),
      ),
    );
    if (next === noteHeight) return;
    setNoteHeight(next);
    cancelAnimationFrame(heightRafRef.current);
    heightRafRef.current = requestAnimationFrame(() => {
      invoke("set_note_height", { height: next, save: false }).catch(() => {});
    });
  };

  const onHeightHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = heightDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    heightDragRef.current = null;
    setHeightDragging(false);
    cancelAnimationFrame(heightRafRef.current);
    invoke("set_note_height", { height: noteHeight, save: true }).catch(() => {});
  };

  // 键盘可达:↑ 增高一行,↓ 缩一行(行语义步进,与宽度的 16px 像素步进刻意不同)
  const onHeightHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowUp" ? ROW_PITCH : event.key === "ArrowDown" ? -ROW_PITCH : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.max(NOTE_HEIGHT_MIN, Math.min(NOTE_HEIGHT_MAX, noteHeight + step));
    if (next === noteHeight) return;
    setNoteHeight(next);
    invoke("set_note_height", { height: next, save: true }).catch(() => {});
  };

  // ── 外部操作应用:Rust 队列里的指令逐条依序落库 ──
  // project 匹配按标题大小写不敏感,只认进行中主题(已完结主题不复活);
  // 未命中先建项目再挂待办。文本 trim + 空值静默防御(Rust 已限 42 字)。
  // 多条 op 用 useNoteStore.getState() 取最新状态,避免闭包旧值串档
  const showOpToast = (message: string) => {
    setOpToast(message);
    if (opToastTimerRef.current) clearTimeout(opToastTimerRef.current);
    opToastTimerRef.current = window.setTimeout(() => {
      setOpToast(null);
      opToastTimerRef.current = null;
    }, 1500);
  };

  const applyExternalOps = (ops: ExternalOp[]) => {
    let todoCount = 0;
    let projectCount = 0;
    let lastLabel = "";
    for (const op of ops) {
      if (op.type === "addProject") {
        const title = op.title?.trim();
        if (!title) continue;
        addTopic(title);
        projectCount++;
        lastLabel = title;
        continue;
      }
      const text = op.text?.trim();
      if (!text) continue;
      const projectName = op.project?.trim();
      if (projectName) {
        const key = projectName.toLowerCase();
        const topic = useNoteStore
          .getState()
          .topics.find((t) => !t.doneAt && t.title.toLowerCase() === key);
        const topicId = topic ? topic.id : addTopic(projectName);
        addTodo(text, topicId);
      } else {
        addTodo(text);
      }
      todoCount++;
      lastLabel = text;
    }
    const total = todoCount + projectCount;
    if (!total) return;
    if (total > 1) {
      showOpToast(`已添加 ${total} 条`);
    } else if (projectCount) {
      showOpToast(`已添加项目：${lastLabel}`);
    } else {
      showOpToast(`已添加：${lastLabel}`);
    }
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
  // 容量 = 列表区实测高度派生(ResizeObserver 链路),分页/跳页/拖动换算统一用这一份
  const pageCount = Math.max(1, Math.ceil(viewRows.length / capacity));
  // 删除/取消完成后页码可能越界,派生安全页码兜底
  const pageSafe = Math.min(page, pageCount);
  const pageRows = viewRows.slice((pageSafe - 1) * capacity, pageSafe * capacity);
  const pageOffset = (pageSafe - 1) * capacity;

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
    addTodo(draft);
    setDraft("");
    // 新事项落在进行中列表末尾:跳到它所在页(容量动态,按当前值换算)
    goList(Math.ceil((activeTodos.length + 1) / capacity), "active", null, 1);
  };

  const submitProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectDraft.trim()) return;
    const id = addTopic(projectDraft);
    setProjectDraft("");
    setProjectComposer(false);
    goList(1, "active", id, 1);
  };

  const closeProjectComposer = () => {
    setProjectComposer(false);
    setProjectDraft("");
    requestAnimationFrame(() => projectEntryRef.current?.focus());
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

  const togglePinFromMenu = () => {
    togglePin();
    setMoreOpen(false);
    requestAnimationFrame(() => moreButtonRef.current?.focus());
  };

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    setMoreOpen(false);
  };

  const hideToTray = () => {
    setMoreOpen(false);
    if (reducedMotion) {
      getCurrentWindow().hide().catch(() => {});
      return;
    }
    setWindowMotion("is-hiding");
    window.setTimeout(() => {
      getCurrentWindow()
        .hide()
        .catch(() => setWindowMotion(""));
    }, 125);
  };

  const closeMenuAndMoveFocus = (backward: boolean) => {
    setMoreOpen(false);
    requestAnimationFrame(() => {
      const trigger = moreButtonRef.current;
      if (!trigger) return;
      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter(
        (element) =>
          element.offsetParent !== null &&
          !element.closest("[inert]") &&
          !element.closest("[aria-hidden='true']"),
      );
      const index = focusables.indexOf(trigger);
      if (index < 0 || focusables.length < 2) {
        trigger.focus();
        return;
      }
      const nextIndex = (index + (backward ? -1 : 1) + focusables.length) % focusables.length;
      focusables[nextIndex]?.focus();
    });
  };

  const onMoreMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      moreMenuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemcheckbox'], [role='menuitem']") ?? [],
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusItem = (nextIndex: number) => {
      items.forEach((item, itemIndex) => {
        item.tabIndex = itemIndex === nextIndex ? 0 : -1;
      });
      items[nextIndex]?.focus();
    };
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem((index + 1 + items.length) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem((index - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      closeMenuAndMoveFocus(event.shiftKey);
    }
  };

  // 收纳盒按钮 = 视图切换:进行中 ↔ 已完成(收纳表)
  const switchView = () => {
    setProjectComposer(false);
    setProjectDraft("");
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
    // 主题名/待办文本/主列表标题共用 editing 状态;id 前缀区分落盘目标
    if (editing.id === "header:") {
      // trim 后为空 = 清空自定义,回退默认「今日待办」
      setListTitle(editing.text);
    } else if (editing.id.startsWith("topic:")) {
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

  // ── 拖动排序:序号键帽即把手,FLIP 让位(平铺待办行与主题子视图步骤行) ──
  // 拖动中不触发 React 重渲染,平移与序号变号直接改 DOM;
  // 松手时先关让位过渡再清 transform,让重排与清场同帧落地(无回弹);
  // 落盘统一走 reorderTodo:store 侧按目标归属(平铺/某主题子序列)各自重排

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
              ref={editInputRef}
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
  const headerTitle = topicId
    ? currentTopic?.title ?? ""
    : view === "active"
      ? listTitle || "今日待办"
      : "已完成";
  // 主列表标题可自定义:点标题进入编辑(主题页/已完成页标题是固定语义,不可改)
  const titleEditable = !topicId && view === "active" && !collapsed;
  const headerProgress = topicId
    ? `${currentChildren.filter((c) => c.done).length} / ${currentChildren.length}`
    : `${doneCount} / ${todos.length}`;
  const cardClassName = [
    "note-card",
    collapsed ? "is-collapsed" : "",
    pinned ? "is-pinned" : "",
    moreOpen ? "has-menu-open" : "",
    windowMotion,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClassName}
      ref={cardRef}
      style={
        {
          "--note-accent": accentColor,
          "--note-width": `${noteWidth}px`,
        } as React.CSSProperties
      }
    >
      <header className="note-head" onPointerDown={startDrag}>
        <div className="note-head-text">
          {topicId && (
            <button
              type="button"
              className="note-back"
              aria-label="返回待办列表"
              title="返回待办列表"
              onClick={() => goList(1, "active", null, -1)}
            >
              <BackIcon />
            </button>
          )}
          <div className="note-title-line note-swap" key={`${view}-${topicId ?? "main"}`}>
            {editing?.id === "header:" ? (
              <input
                className="note-title-edit"
                type="text"
                value={editing.text}
                maxLength={MAX_TEXT}
                autoComplete="off"
                aria-label="编辑列表标题"
                autoFocus
                ref={editInputRef}
                onChange={(event) => setEditing({ id: "header:", text: event.target.value })}
                onKeyDown={onEditKeyDown}
                onBlur={commitEdit}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : (
              <h3
                className={titleEditable ? "note-title is-editable" : "note-title"}
                title={titleEditable ? "点击自定义标题" : undefined}
                onClick={titleEditable ? () => setEditing({ id: "header:", text: listTitle }) : undefined}
              >
                {headerTitle}
              </h3>
            )}
            <span className="note-pin-state" aria-label={pinned ? "保持在最前" : undefined} />
          </div>
        </div>
        <div className="note-head-actions">
          <span className="note-progress">{headerProgress}</span>
          {!collapsed && (
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
          )}
          <button
            type="button"
            className="note-window-action note-collapse"
            aria-label={collapsed ? "展开便签" : "收起为条幅"}
            title={collapsed ? "展开便签" : "收起为条幅"}
            onClick={toggleCollapsed}
          >
            <CollapseIcon />
          </button>
          <button
            type="button"
            ref={moreButtonRef}
            className="note-window-action"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="更多窗口操作"
            title="更多窗口操作"
            onClick={() => {
              const next = !moreOpen;
              setMoreOpen(next);
              if (next) requestAnimationFrame(() => moreMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
            }}
          >
            <MoreIcon />
          </button>
        </div>
      </header>

      <div className="note-body" aria-hidden={collapsed} inert={collapsed ? true : undefined}>
        <div className="note-body-inner">
          <div className="note-content">
            <div className="todo-list-wrap" ref={listWrapRef}>
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
                <span className="todo-pager-num">{pageSafe} / {pageCount}</span>
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

            {view === "active" && (
              projectComposer && !topicId ? (
                <div className="note-project-composer">
                  <div className="note-project-label">
                    <span>新建项目</span>
                    <button
                      type="button"
                      onClick={closeProjectComposer}
                    >
                      取消
                    </button>
                  </div>
                  <form className="note-project-form" onSubmit={submitProject}>
                    <input
                      ref={projectInputRef}
                      className="todo-input"
                      type="text"
                      value={projectDraft}
                      maxLength={MAX_TEXT}
                      autoComplete="off"
                      placeholder="项目名称"
                      aria-label="项目名称"
                      onChange={(event) => setProjectDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          closeProjectComposer();
                        } else if (event.key === "Enter" && event.nativeEvent.isComposing) {
                          event.preventDefault();
                        }
                      }}
                    />
                    <button className="todo-add" type="submit" disabled={!projectDraft.trim()}>
                      创建并拆解
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <form className="todo-form" onSubmit={submit}>
                    <input
                      className="todo-input"
                      type="text"
                      value={draft}
                      maxLength={MAX_TEXT}
                      autoComplete="off"
                      placeholder={topicId ? "添加步骤，按 Enter" : "添加待办，按 Enter"}
                      aria-label={topicId ? "添加步骤" : "添加待办"}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onInputKeyDown}
                    />
                    <button className="todo-add" type="submit" disabled={!draft.trim()}>
                      添加
                    </button>
                  </form>
                  {!topicId && (
                    <button
                      type="button"
                      ref={projectEntryRef}
                      className="note-project-entry"
                      onClick={() => setProjectComposer(true)}
                    >
                      新建项目
                    </button>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </div>

      {/* 拖宽热区:卡片左缘窄条(右上角锚定,向左生长),层级低于弹出菜单 */}
      <div
        className="note-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整便签宽度(左右方向键微调)"
        title="拖动调整宽度"
        tabIndex={0}
        onPointerDown={onResizeHandlePointerDown}
        onPointerMove={onResizeHandlePointerMove}
        onPointerUp={onResizeHandlePointerUp}
        onPointerCancel={onResizeHandlePointerUp}
        onKeyDown={onResizeHandleKeyDown}
      />

      {/* 拖高热区:卡片底缘通条(顶部锚定,向下生长),条幅态不渲染;
          拖动期间手柄上方常驻容量徽标,松手即隐 */}
      {!collapsed && (
        <div
          className="note-height-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整便签高度(上下方向键按行微调)"
          title="拖动调整高度"
          tabIndex={0}
          onPointerDown={onHeightHandlePointerDown}
          onPointerMove={onHeightHandlePointerMove}
          onPointerUp={onHeightHandlePointerUp}
          onPointerCancel={onHeightHandlePointerUp}
          onKeyDown={onHeightHandleKeyDown}
        />
      )}
      {heightDragging && (
        <div className="note-height-badge" aria-hidden="true">
          每页 {capacity} 条
        </div>
      )}

      {/* 外部操作反馈:卡片内浮层(窗口无边框,通用 toast 会被窗口边界裁切),1.5s 自隐 */}
      {opToast && (
        <div className="note-op-toast" role="status">
          {opToast}
        </div>
      )}

      {moreOpen && (
        <div
          className="note-more-menu"
          ref={moreMenuRef}
          role="menu"
          aria-label="窗口操作"
          onKeyDown={onMoreMenuKeyDown}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={pinned}
            className="note-menu-item"
            autoFocus
            tabIndex={0}
            onClick={togglePinFromMenu}
          >
            <PinIcon />
            <span>保持在最前</span>
            <span className="note-menu-switch" aria-hidden="true" />
          </button>
          <div className="note-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="note-menu-item is-danger"
            tabIndex={-1}
            onClick={hideToTray}
          >
            <HideIcon />
            <span>隐藏到托盘</span>
            <span />
          </button>
        </div>
      )}
    </div>
  );
}

export default Note;
