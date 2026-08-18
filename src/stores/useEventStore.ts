// 事件 store:维护按键组生命周期、鼠标状态与卡键清理

import { InputPayload, isModifierKey } from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keybooStorage } from "./persist";

export const EVENT_STORE_NAME = "keyboo-event-store";

// 按住超过此时长未释放视为卡键(切换到安全桌面时 release 永远收不到),自动补发释放
const STUCK_KEY_TIMEOUT_MS = 30_000;
// 滚轮指示的停留时长
const SCROLL_LINGER_MS = 400;

export interface KeyPress {
  name: string;
  count: number;
  /** 释放时刻;null 表示仍按住 */
  releasedAt: number | null;
  pressedAt: number;
}

export interface KeyGroup {
  keys: KeyPress[];
  createdAt: number;
}

export interface MouseState {
  x: number;
  y: number;
  wheel: number;
  lastScrollAt: number | null;
  pressedButton: "Left" | "Right" | "Middle" | "Other" | null;
  dragStart: { x: number; y: number } | null;
  dragging: boolean;
}

interface EventConfig {
  filter: "none" | "hotkeys";
  showHistory: boolean;
  maxHistory: number;
  lingerMs: number;
}

interface EventRuntime {
  pressedKeys: string[];
  pressedAt: Record<string, number>;
  groups: KeyGroup[];
  mouse: MouseState;
  settingsOpen: boolean;
  listening: boolean;
  silent: boolean;
}

interface EventActions {
  setFilter: (filter: EventConfig["filter"]) => void;
  setShowHistory: (value: boolean) => void;
  setMaxHistory: (value: number) => void;
  setLingerMs: (value: number) => void;
  onEvent: (event: InputPayload) => void;
  tick: () => void;
}

export type EventStore = EventConfig & EventRuntime & EventActions;

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
      // ─── 配置(持久化) ───
      filter: "hotkeys",
      showHistory: false,
      maxHistory: 5,
      lingerMs: 3000,

      // ─── 运行时 ───
      pressedKeys: [],
      pressedAt: {},
      groups: [],
      mouse: { x: 0, y: 0, wheel: 0, lastScrollAt: null, pressedButton: null, dragStart: null, dragging: false },
      settingsOpen: false,
      listening: true,
      silent: false,

      setFilter: (filter) => set({ filter }),
      setShowHistory: (showHistory) => set({ showHistory }),
      setMaxHistory: (maxHistory) => set({ maxHistory }),
      setLingerMs: (lingerMs) => set({ lingerMs }),

      onEvent: (event) => {
        const state = get();
        switch (event.type) {
          case "KeyEvent":
            if (event.pressed) pressKey(state, set, event.name);
            else releaseKey(state, set, event.name);
            break;
          case "MouseButtonEvent":
            if (event.pressed) {
              pressKey(state, set, event.button);
              set({
                mouse: {
                  ...get().mouse,
                  pressedButton: event.button,
                  dragStart: { x: get().mouse.x, y: get().mouse.y },
                },
              });
            } else {
              const wasDragging = get().mouse.dragging;
              releaseKey(state, set, wasDragging ? "Drag" : event.button);
              set({
                mouse: { ...get().mouse, pressedButton: null, dragStart: null, dragging: false },
              });
            }
            break;
          case "MouseMoveEvent": {
            const mouse = { ...get().mouse, x: event.x, y: event.y };
            // 拖拽判定:按住按键且移动超过阈值
            if (mouse.dragStart && !mouse.dragging && mouse.pressedButton) {
              const dist = Math.hypot(mouse.x - mouse.dragStart.x, mouse.y - mouse.dragStart.y);
              if (dist > 50) {
                mouse.dragging = true;
                pressKey(get(), set, "Drag");
              }
            }
            set({ mouse });
            break;
          }
          case "MouseWheelEvent": {
            const wheel = Math.sign(event.delta_y);
            if (wheel === 0) break;
            const name = wheel > 0 ? "ScrollUp" : "ScrollDown";
            const prevName = get().mouse.wheel > 0 ? "ScrollUp" : get().mouse.wheel < 0 ? "ScrollDown" : null;
            if (prevName && prevName !== name) releaseKey(get(), set, prevName);
            pressKey(get(), set, name);
            set({ mouse: { ...get().mouse, wheel, lastScrollAt: Date.now() } });
            break;
          }
        }
      },

      tick: () => {
        const state = get();
        const now = Date.now();

        // 卡键清理
        for (const name of [...state.pressedKeys]) {
          const pressedAt = state.pressedAt[name];
          if (pressedAt !== undefined && now - pressedAt > STUCK_KEY_TIMEOUT_MS) {
            releaseKey(get(), set, name);
          }
        }

        // 滚轮停留到期
        if (state.mouse.lastScrollAt && now - state.mouse.lastScrollAt > SCROLL_LINGER_MS) {
          if (state.mouse.wheel > 0) releaseKey(get(), set, "ScrollUp");
          if (state.mouse.wheel < 0) releaseKey(get(), set, "ScrollDown");
          set({ mouse: { ...get().mouse, wheel: 0, lastScrollAt: null } });
        }

        // 设置窗口打开时不移除键帽,方便预览
        if (state.settingsOpen) return;

        // linger 到期移除
        const groups: KeyGroup[] = [];
        let changed = false;
        for (const group of get().groups) {
          const kept = group.keys.filter(
            (key) =>
              key.releasedAt === null ||
              now - key.releasedAt < state.lingerMs,
          );
          if (kept.length !== group.keys.length) changed = true;
          if (kept.length > 0) groups.push({ keys: kept, createdAt: group.createdAt });
        }
        if (changed) set({ groups });
      },
    }),
    {
      name: EVENT_STORE_NAME,
      storage: keybooStorage,
      partialize: (state) => ({
        filter: state.filter,
        showHistory: state.showHistory,
        maxHistory: state.maxHistory,
        lingerMs: state.lingerMs,
      }),
    },
  ),
);

// ─────────────────────────── 内部逻辑 ───────────────────────────

type SetFn = (partial: Partial<EventStore>) => void;

function pressKey(state: EventStore, set: SetFn, name: string) {
  const pressedKeys = [...state.pressedKeys];
  const pressedAt = { ...state.pressedAt, [name]: Date.now() };
  if (pressedKeys.includes(name)) {
    // 键盘自动重复:只刷新时间戳
    set({ pressedAt });
    return;
  }
  pressedKeys.push(name);

  // 过滤:hotkeys 模式只显示修饰键开头的组合
  const visible =
    state.filter === "none" || isModifierKey(pressedKeys[0]);

  let groups = [...state.groups];
  if (visible) {
    const last = groups.length - 1;
    const lastGroup = last >= 0 ? groups[last] : null;
    // 上一组所有键都还按着 → 并入该组(组合键);否则开新组
    const comboContinues =
      lastGroup !== null && lastGroup.keys.every((k) => k.releasedAt === null);

    if (comboContinues && lastGroup) {
      const existing = lastGroup.keys.find((k) => k.name === name);
      if (existing) {
        existing.count += 1;
        existing.releasedAt = null;
        existing.pressedAt = Date.now();
      } else {
        lastGroup.keys.push({ name, count: 1, releasedAt: null, pressedAt: Date.now() });
      }
      groups[last] = { keys: [...lastGroup.keys], createdAt: lastGroup.createdAt };
    } else {
      groups.push({
        keys: [{ name, count: 1, releasedAt: null, pressedAt: Date.now() }],
        createdAt: Date.now(),
      });
    }
    // 历史上限
    if (state.showHistory && groups.length > state.maxHistory) {
      groups = groups.slice(groups.length - state.maxHistory);
    } else if (!state.showHistory) {
      // 非历史模式:只保留包含当前按住键的组
      groups = groups.filter((g) => g.keys.some((k) => k.releasedAt === null)).slice(-1);
      if (groups.length === 0) {
        groups = [{ keys: [{ name, count: 1, releasedAt: null, pressedAt: Date.now() }], createdAt: Date.now() }];
      }
    }
  }

  set({ pressedKeys, pressedAt, groups });
}

function releaseKey(state: EventStore, set: SetFn, name: string) {
  const pressedKeys = state.pressedKeys.filter((k) => k !== name);
  const pressedAt = { ...state.pressedAt };
  delete pressedAt[name];

  const groups = [...state.groups];
  const last = groups.length - 1;
  if (last >= 0) {
    const key = groups[last].keys.find((k) => k.name === name);
    if (key && key.releasedAt === null) {
      key.releasedAt = Date.now();
      groups[last] = { keys: [...groups[last].keys], createdAt: groups[last].createdAt };
    }
  }

  set({ pressedKeys, pressedAt, groups });
}
