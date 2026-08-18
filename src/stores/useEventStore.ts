// 事件 store:按键组生命周期、鼠标状态、过滤与快捷键配置
// 结构与逻辑对齐 Keyviz 的 KeyEventStore

import { EventPayload, KeyEvent, KeyGroup, MODIFIERS, MouseButtonEvent, MouseMoveEvent, MouseWheelEvent, RawKey, RawKeyEvent } from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keybooStorage } from "./persist";

export const EVENT_STORE_NAME = "keyboo-event-store";

// 按住超过此时长未释放视为卡键(切换到安全桌面时 release 永远收不到),自动补发释放
const STUCK_KEY_TIMEOUT_MS = 30_000;
// 滚轮指示的停留时长
const SCROLL_LINGER_MS = 300;

export interface MouseState {
  x: number;
  y: number;
  wheel: number;
  lastScrollAt?: number;
  dragStart?: { x: number; y: number };
  dragging: boolean;
}

export type FilterMode = "none" | "modifiers" | "custom";

interface EventConfig {
  dragThreshold: number;
  filter: FilterMode;
  allowedKeys: string[];
  showEventHistory: boolean;
  maxHistory: number;
  lingerDurationMs: number;
  toggleShortcut: string[];
}

interface EventRuntime {
  pressedKeys: string[];
  pressedKeyTimes: Record<string, number>;
  pressedMouseButton: string | null;
  mouse: MouseState;
  groups: KeyGroup[];
  settingsOpen: boolean;
}

interface EventActions {
  setDragThreshold: (value: number) => void;
  setFilter: (value: FilterMode) => void;
  setAllowedKeys: (keys: string[]) => void;
  setShowEventHistory: (value: boolean) => void;
  setMaxHistory: (value: number) => void;
  setLingerDurationMs: (value: number) => void;
  setToggleShortcut: (value: string[]) => void;
  onEvent: (event: EventPayload) => void;
  onKeyPress: (event: RawKeyEvent) => void;
  ignoreEvent: (pressedKeys: string[]) => boolean;
  onKeyRelease: (event: RawKeyEvent) => void;
  onMouseMove: (event: MouseMoveEvent) => void;
  onMouseButtonPress: (event: MouseButtonEvent) => void;
  onMouseButtonRelease: (event: MouseButtonEvent) => void;
  onMouseWheel: (event: MouseWheelEvent) => void;
  tick: () => void;
}

export type EventStore = EventConfig & EventRuntime & EventActions;

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
      // ─── 配置(持久化) ───
      dragThreshold: 50,
      filter: "modifiers",
      allowedKeys: [RawKey.ControlLeft, RawKey.MetaLeft, RawKey.Alt],
      showEventHistory: false,
      maxHistory: 5,
      lingerDurationMs: 5_000,
      toggleShortcut: [RawKey.ShiftLeft, RawKey.F10],

      // ─── 运行时 ───
      pressedKeys: [],
      pressedKeyTimes: {},
      pressedMouseButton: null,
      mouse: { x: 0, y: 0, wheel: 0, dragging: false },
      groups: [],
      settingsOpen: false,

      setDragThreshold: (dragThreshold) => set({ dragThreshold }),
      setFilter: (filter) => set({ filter }),
      setAllowedKeys: (allowedKeys) => set({ allowedKeys }),
      setShowEventHistory: (showEventHistory) => set({ showEventHistory }),
      setMaxHistory: (maxHistory) => set({ maxHistory }),
      setLingerDurationMs: (lingerDurationMs) => set({ lingerDurationMs }),
      setToggleShortcut: (toggleShortcut) => set({ toggleShortcut }),

      onEvent: (event) => {
        const state = get();
        switch (event.type) {
          case "KeyEvent":
            if (event.pressed) state.onKeyPress(event);
            else state.onKeyRelease(event);
            break;
          case "MouseMoveEvent":
            state.onMouseMove(event);
            break;
          case "MouseButtonEvent":
            if (event.pressed) state.onMouseButtonPress(event);
            else state.onMouseButtonRelease(event);
            break;
          case "MouseWheelEvent":
            state.onMouseWheel(event);
            break;
        }
      },

      onKeyPress: (event) => {
        const state = get();
        // 0. 记录物理状态
        const pressedKeys = [...state.pressedKeys];
        pressedKeys.push(event.name);
        const pressedKeyTimes = { ...state.pressedKeyTimes, [event.name]: Date.now() };

        // 1. 过滤
        if (state.filter !== "none" && state.ignoreEvent(pressedKeys)) {
          set({ pressedKeys, pressedKeyTimes });
          return;
        }

        let groups = [...state.groups];
        const last = groups.length - 1;
        const key = new KeyEvent(event.name);

        // 2. 重复按下(组合键内已有该键)
        const existingKey = last >= 0 ? groups[last].keys.find((k) => k.name === key.name) : undefined;
        if (existingKey) {
          if (state.showEventHistory && groups[last].keys.length > 1) {
            // 历史模式:把仍按住的键拆成新组
            const groupKeys: KeyEvent[] = [];
            groups[last].keys.forEach((k) => {
              if (k.in(pressedKeys)) groupKeys.push(new KeyEvent(k.name));
            });
            groups.push({ keys: groupKeys, createdAt: Date.now() });
          } else {
            // 替换模式:只保留仍按住的键,并刷新该键计数
            const groupKeys: KeyEvent[] = [];
            groups[last].keys.forEach((k) => {
              if (k.name === key.name) {
                existingKey.press();
                groupKeys.push(existingKey);
              } else if (k.in(pressedKeys)) {
                groupKeys.push(k);
              }
            });
            groups[last].keys = groupKeys;
          }
        }
        // 3. 新键入组
        else {
          const createdAt = Date.now();
          if (pressedKeys.length === 1 || last < 0) {
            // 单键:历史模式追加新组,替换模式重置
            if (state.showEventHistory) {
              groups.push({ keys: [key], createdAt });
            } else {
              groups = [{ keys: [key], createdAt }];
            }
          } else {
            // 组合键
            if (state.showEventHistory && groups[last].keys.some((k) => !k.in(pressedKeys))) {
              // 历史模式且上一组已有松开键:带仍按住的键开新组
              const groupKeys = groups[last].keys.filter((k) => k.in(pressedKeys));
              groupKeys.push(key);
              groups.push({ keys: groupKeys, createdAt });
            } else {
              groups[last].keys.push(key);
            }
          }
        }

        // 历史上限
        if (state.showEventHistory && groups.length > state.maxHistory) {
          groups = groups.slice(groups.length - state.maxHistory);
        }

        set({ pressedKeys, pressedKeyTimes, groups });
      },

      ignoreEvent: (pressedKeys) => {
        const state = get();
        if (state.filter === "modifiers") {
          return !MODIFIERS.has(pressedKeys[0]);
        } else if (state.filter === "custom") {
          return !state.allowedKeys.includes(pressedKeys[0]);
        }
        return false;
      },

      onKeyRelease: (event) => {
        const state = get();
        const pressedKeys = state.pressedKeys.filter((name) => name !== event.name);
        const pressedKeyTimes = { ...state.pressedKeyTimes };
        delete pressedKeyTimes[event.name];

        // 刷新组内该键的释放时刻(linger 从释放开始计时)
        const groups = [...state.groups];
        const last = groups.length - 1;
        const kIndex = last >= 0 ? groups[last].keys.findIndex((k) => k.name === event.name) : undefined;
        if (kIndex !== undefined && kIndex >= 0) {
          groups[last].keys[kIndex].lastPressedAt = Date.now();
          set({ pressedKeys, pressedKeyTimes, groups });
        } else {
          set({ pressedKeys, pressedKeyTimes });
        }
      },

      onMouseMove: (event) => {
        const state = get();
        const mouse = { ...state.mouse, x: event.x, y: event.y };

        // 拖拽判定:按住鼠标键且移动超过阈值 → 模拟 Drag 键
        if (mouse.dragStart && !mouse.dragging) {
          const dist = Math.hypot(mouse.x - mouse.dragStart.x, mouse.y - mouse.dragStart.y);
          if (dist > state.dragThreshold) {
            mouse.dragging = true;

            // 从按下键列表与最后一组中移除鼠标按键,换成 Drag
            const pressedKeys = state.pressedKeys.filter((name) => name !== state.pressedMouseButton);
            const groups = [...state.groups];
            const last = groups.length - 1;
            if (last >= 0) {
              groups[last].keys = groups[last].keys.filter((k) => k.name !== state.pressedMouseButton);
            }
            set({ pressedKeys, mouse, groups });

            const hasGroupKeys = last >= 0 && groups[last].keys.length > 0;
            const dragAllowed =
              state.filter !== "custom" ||
              (!!state.pressedMouseButton &&
                state.allowedKeys.includes(state.pressedMouseButton) &&
                state.allowedKeys.includes(RawKey.Drag));

            if (hasGroupKeys || dragAllowed) {
              state.onKeyPress({ type: "KeyEvent", name: RawKey.Drag, pressed: true });
            }
            return;
          }
        }
        set({ mouse });
      },

      onMouseButtonPress: (event) => {
        const state = get();
        const mouse = { ...state.mouse, dragStart: { x: state.mouse.x, y: state.mouse.y } };
        state.onKeyPress({ type: "KeyEvent", name: event.button, pressed: true });
        set({ pressedMouseButton: event.button, mouse });
      },

      onMouseButtonRelease: (event) => {
        const state = get();
        const mouse = { ...state.mouse, dragging: false, dragStart: undefined };
        if (state.mouse.dragging) {
          state.onKeyRelease({ type: "KeyEvent", name: RawKey.Drag, pressed: false });
        } else {
          state.onKeyRelease({ type: "KeyEvent", name: event.button, pressed: false });
        }
        set({ pressedMouseButton: null, mouse });
      },

      onMouseWheel: (event) => {
        const state = get();
        const wheel = Math.sign(event.delta_y);
        if (wheel === 0) return;

        const rawKey = wheel > 0 ? RawKey.ScrollUp : RawKey.ScrollDown;
        const prevRawKey = state.mouse.wheel > 0 ? RawKey.ScrollUp : RawKey.ScrollDown;
        if (state.mouse.wheel !== 0 && state.mouse.wheel !== wheel && state.pressedKeys.includes(prevRawKey)) {
          state.onKeyRelease({ type: "KeyEvent", name: prevRawKey, pressed: false });
        }

        const mouse = { ...state.mouse, wheel, lastScrollAt: Date.now() };
        if (!get().pressedKeys.includes(rawKey)) {
          state.onKeyPress({ type: "KeyEvent", name: rawKey, pressed: true });
        }
        set({ mouse });
      },

      tick: () => {
        const state = get();
        const now = Date.now();
        let notify = false;

        // 卡键清理:安全桌面等场景丢失 release 事件
        for (const name of [...state.pressedKeys]) {
          const pressedAt = state.pressedKeyTimes[name];
          if (pressedAt !== undefined && now - pressedAt > STUCK_KEY_TIMEOUT_MS) {
            state.onKeyRelease({ type: "KeyEvent", name, pressed: false });
          }
        }

        // 滚轮停留到期
        if (state.mouse.lastScrollAt && now - state.mouse.lastScrollAt > SCROLL_LINGER_MS) {
          if (state.pressedKeys.includes(RawKey.ScrollUp)) {
            state.onKeyRelease({ type: "KeyEvent", name: RawKey.ScrollUp, pressed: false });
          }
          if (state.pressedKeys.includes(RawKey.ScrollDown)) {
            state.onKeyRelease({ type: "KeyEvent", name: RawKey.ScrollDown, pressed: false });
          }
          set({ mouse: { ...get().mouse, wheel: 0, lastScrollAt: undefined } });
        }

        // 设置窗口打开时不移除键帽,方便预览
        if (state.settingsOpen) return;

        // linger 到期移除
        const groups: KeyGroup[] = [];
        for (const group of get().groups) {
          const kept = group.keys.filter(
            (key) =>
              state.pressedKeys.includes(key.name) ||
              now - key.lastPressedAt < state.lingerDurationMs,
          );
          if (kept.length !== group.keys.length) notify = true;
          if (kept.length > 0) groups.push({ keys: kept, createdAt: group.createdAt });
        }
        if (notify) set({ groups });
      },
    }),
    {
      name: EVENT_STORE_NAME,
      storage: keybooStorage,
      partialize: (state) => {
        const { pressedKeys, pressedKeyTimes, pressedMouseButton, mouse, groups, settingsOpen, ...persisted } = state;
        return persisted;
      },
    },
  ),
);
