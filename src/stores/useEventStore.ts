// 事件 store:按键组生命周期、鼠标状态、过滤与快捷键配置
// 结构与逻辑对齐 Keyviz 的 KeyEventStore

import { EventPayload, isMouseKey, KeyEvent, KeyGroup, MODIFIERS, MouseButtonEvent, MouseMoveEvent, MouseWheelEvent, RawKey, RawKeyEvent } from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCompanionStore } from "./useCompanionStore";
import { keybooStorage } from "./persist";

export const EVENT_STORE_NAME = "keyboo-event-store";

// 按住超过此时长未释放视为卡键(切换到安全桌面时 release 永远收不到),自动补发释放。
// 后端每 10s 会对仍按住的键重发 press(保活),onKeyPress 对重复按下只刷新时间戳,
// 因此真实长按不会被误清,这里只兜底"release 彻底丢失"的极端场景。
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
  /** 设备维度显示开关:键盘按键是否进入键帽流/整键盘(独立于 filter 的内容过滤) */
  showKeyboardEvents: boolean;
  /** 设备维度显示开关:鼠标按键(含滚轮/拖拽/侧键)是否以键帽形式显示 */
  showMouseEvents: boolean;
  /** 设备维度显示开关:鼠标反馈(点击圆环/涟漪/指示器/移动拖尾)是否显示 */
  showMouseEffects: boolean;
}

interface EventRuntime {
  pressedKeys: string[];
  pressedKeyTimes: Record<string, number>;
  pressedMouseButtons: string[];
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
  setShowKeyboardEvents: (value: boolean) => void;
  setShowMouseEvents: (value: boolean) => void;
  setShowMouseEffects: (value: boolean) => void;
  onEvent: (event: EventPayload) => void;
  onKeyPress: (event: RawKeyEvent) => void;
  ignoreEvent: (pressedKeys: string[]) => boolean;
  onKeyRelease: (event: RawKeyEvent) => void;
  onMouseMove: (event: MouseMoveEvent) => void;
  onMouseButtonPress: (event: MouseButtonEvent) => void;
  onMouseButtonRelease: (event: MouseButtonEvent) => void;
  onMouseWheel: (event: MouseWheelEvent) => void;
  resetRuntime: () => void;
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
      showKeyboardEvents: true,
      showMouseEvents: true,
      showMouseEffects: true,

      // ─── 运行时 ───
      pressedKeys: [],
      pressedKeyTimes: {},
      pressedMouseButtons: [],
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
      setShowKeyboardEvents: (showKeyboardEvents) => set({ showKeyboardEvents }),
      setShowMouseEvents: (showMouseEvents) => set({ showMouseEvents }),
      setShowMouseEffects: (showMouseEffects) => set({ showMouseEffects }),

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
        // 0. 后端保活重发 / 重复按下:只刷新时间戳,不重复入组。
        //    这也是长按不被卡键清理误释放的关键。
        if (state.pressedKeys.includes(event.name)) {
          set({ pressedKeyTimes: { ...state.pressedKeyTimes, [event.name]: Date.now() } });
          return;
        }

        // 1. 记录物理状态
        const pressedKeys = [...state.pressedKeys, event.name];
        const pressedKeyTimes = { ...state.pressedKeyTimes, [event.name]: Date.now() };

        // 1.5 打字伙伴计数(信号解耦):真实新按下即计数,先于显示过滤——
        //     过滤只决定"哪些键显示",不再影响统计与伙伴成长(保活重发在步骤 0 已 return)
        useCompanionStore.getState().registerKey(event.name);

        // 1.6 设备维度门控(逐键判定,与 filter 的组语义正交):
        //     只决定"该键是否进入显示组";物理状态照常保留(滚轮去重/卡键清理/
        //     拖拽判定依赖 pressedKeys);registerKey 已在 1.5 完成,统计不受影响。
        //     不并入 ignoreEvent:那是"整组 pressedKeys.some 任一通过即整组放行"
        //     的组语义,并入后 filter=modifiers 下先按 Ctrl 再点左键,左键会借
        //     Ctrl 命中 MODIFIERS 入组显示为 [Ctrl+Left],违背"只要键盘画面"。
        //     已显示键帽的即时消失由渲染层过滤负责(KeyOverlay visibleGroups)。
        if ((isMouseKey(event.name) && !state.showMouseEvents) || (!isMouseKey(event.name) && !state.showKeyboardEvents)) {
          set({ pressedKeys, pressedKeyTimes });
          return;
        }

        // 2. 过滤(被过滤的键保留物理状态,但不进入任何显示组)
        if (state.filter !== "none" && state.ignoreEvent(pressedKeys)) {
          set({ pressedKeys, pressedKeyTimes });
          return;
        }

        let groups = [...state.groups];
        const last = groups.length - 1;
        const key = new KeyEvent(event.name);

        // 上一组中"仍按住"的键数。被过滤的键不在任何组里,
        // 因此不会把后续按键错误地吸入旧组(幽灵组合修复)。
        const lastGroup = last >= 0 ? groups[last] : undefined;
        const lastHeldCount = lastGroup
          ? lastGroup.keys.filter((k) => k.in(pressedKeys)).length
          : 0;

        // 3. 重复按下(组合键内已有该键,如 linger 期间再按)
        const existingKey = lastGroup?.keys.find((k) => k.name === key.name);
        if (existingKey) {
          if (state.showEventHistory && lastGroup!.keys.length > 1) {
            // 历史模式:把仍按住的键拆成新组
            const groupKeys: KeyEvent[] = [];
            lastGroup!.keys.forEach((k) => {
              if (k.in(pressedKeys)) groupKeys.push(new KeyEvent(k.name));
            });
            groups.push({ keys: groupKeys, createdAt: Date.now() });
          } else {
            // 替换模式:只保留仍按住的键,并刷新该键计数
            const groupKeys: KeyEvent[] = [];
            lastGroup!.keys.forEach((k) => {
              if (k.name === key.name) {
                existingKey.press();
                groupKeys.push(existingKey);
              } else if (k.in(pressedKeys)) {
                groupKeys.push(k);
              }
            });
            lastGroup!.keys = groupKeys;
          }
        }
        // 4. 新键入组
        else {
          const createdAt = Date.now();
          if (!lastGroup || lastHeldCount === 0) {
            // 新组合起点:历史模式追加新组,替换模式重置
            if (state.showEventHistory) {
              groups.push({ keys: [key], createdAt });
            } else {
              groups = [{ keys: [key], createdAt }];
            }
          } else {
            // 组合键延续
            if (state.showEventHistory && lastGroup.keys.some((k) => !k.in(pressedKeys))) {
              // 历史模式且上一组已有松开键:带仍按住的键开新组
              const groupKeys = lastGroup.keys.filter((k) => k.in(pressedKeys));
              groupKeys.push(key);
              groups.push({ keys: groupKeys, createdAt });
            } else {
              lastGroup.keys.push(key);
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
        // 语义:只要当前按住的键里有任何一个通过过滤,就不忽略。
        // 例如 modifiers 模式先按字母再按 Ctrl,Ctrl 仍会显示;
        // 而单按字母(无修饰键)依旧被过滤。
        if (state.filter === "modifiers") {
          return !pressedKeys.some((k) => MODIFIERS.has(k));
        } else if (state.filter === "custom") {
          return !pressedKeys.some((k) => state.allowedKeys.includes(k));
        }
        return false;
      },

      onKeyRelease: (event) => {
        const state = get();
        const pressedKeys = state.pressedKeys.filter((name) => name !== event.name);
        const pressedKeyTimes = { ...state.pressedKeyTimes };
        delete pressedKeyTimes[event.name];

        // 刷新组内该键的释放时刻(linger 从释放开始计时)。
        // 历史模式下同名键可能出现在较早的组,从后往前找第一个命中组。
        const groups = [...state.groups];
        let updated = false;
        for (let i = groups.length - 1; i >= 0; i--) {
          const kIndex = groups[i].keys.findIndex((k) => k.name === event.name);
          if (kIndex >= 0) {
            groups[i].keys[kIndex].lastPressedAt = Date.now();
            updated = true;
            break;
          }
        }
        if (updated) {
          set({ pressedKeys, pressedKeyTimes, groups });
        } else {
          set({ pressedKeys, pressedKeyTimes });
        }
      },

      onMouseMove: (event) => {
        const state = get();
        const mouse = { ...state.mouse, x: event.x, y: event.y };

        // 拖拽判定:按住任一鼠标键且移动超过阈值 → 模拟 Drag 键
        if (mouse.dragStart && !mouse.dragging && state.pressedMouseButtons.length > 0) {
          const dist = Math.hypot(mouse.x - mouse.dragStart.x, mouse.y - mouse.dragStart.y);
          if (dist > state.dragThreshold) {
            mouse.dragging = true;

            // 从按下键列表与最后一组中移除所有鼠标按键,换成 Drag
            const mouseButtons = new Set(state.pressedMouseButtons);
            const pressedKeys = state.pressedKeys.filter((name) => !mouseButtons.has(name));
            const groups = [...state.groups];
            const last = groups.length - 1;
            if (last >= 0) {
              groups[last].keys = groups[last].keys.filter((k) => !mouseButtons.has(k.name));
            }
            set({ pressedKeys, mouse, groups });

            const hasGroupKeys = last >= 0 && groups[last].keys.length > 0;
            const dragAllowed =
              state.filter !== "custom" ||
              (state.pressedMouseButtons.some((b) => state.allowedKeys.includes(b)) &&
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
        const pressedMouseButtons = state.pressedMouseButtons.includes(event.button)
          ? state.pressedMouseButtons
          : [...state.pressedMouseButtons, event.button];
        const mouse = { ...state.mouse };
        if (!mouse.dragging) {
          mouse.dragStart = { x: state.mouse.x, y: state.mouse.y };
        }
        state.onKeyPress({ type: "KeyEvent", name: event.button, pressed: true });
        set({ pressedMouseButtons, mouse });
      },

      onMouseButtonRelease: (event) => {
        const state = get();
        const pressedMouseButtons = state.pressedMouseButtons.filter((b) => b !== event.button);
        const mouse = { ...state.mouse };
        if (state.mouse.dragging) {
          // 全部鼠标键松开才结束拖拽;仍有按键则继续拖
          if (pressedMouseButtons.length === 0) {
            mouse.dragging = false;
            mouse.dragStart = undefined;
            state.onKeyRelease({ type: "KeyEvent", name: RawKey.Drag, pressed: false });
          }
        } else {
          mouse.dragStart = pressedMouseButtons.length > 0 ? mouse.dragStart : undefined;
          state.onKeyRelease({ type: "KeyEvent", name: event.button, pressed: false });
        }
        set({ pressedMouseButtons, mouse });
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

      // 暂停/静默时清空运行时状态,避免键帽、圆环、拖拽残留
      resetRuntime: () => {
        set({
          pressedKeys: [],
          pressedKeyTimes: {},
          pressedMouseButtons: [],
          mouse: { x: 0, y: 0, wheel: 0, dragging: false },
          groups: [],
        });
      },

      tick: () => {
        const now = Date.now();

        // 卡键清理:安全桌面等场景丢失 release 事件。
        // 每步都取最新快照,避免清理过程中状态变化导致新旧混用。
        for (const name of [...get().pressedKeys]) {
          const pressedAt = get().pressedKeyTimes[name];
          if (pressedAt !== undefined && now - pressedAt > STUCK_KEY_TIMEOUT_MS) {
            get().onKeyRelease({ type: "KeyEvent", name, pressed: false });
          }
        }

        // 滚轮停留到期
        const mouseNow = get().mouse;
        if (mouseNow.lastScrollAt && now - mouseNow.lastScrollAt > SCROLL_LINGER_MS) {
          if (get().pressedKeys.includes(RawKey.ScrollUp)) {
            get().onKeyRelease({ type: "KeyEvent", name: RawKey.ScrollUp, pressed: false });
          }
          if (get().pressedKeys.includes(RawKey.ScrollDown)) {
            get().onKeyRelease({ type: "KeyEvent", name: RawKey.ScrollDown, pressed: false });
          }
          set({ mouse: { ...get().mouse, wheel: 0, lastScrollAt: undefined } });
        }

        // 设置窗口打开时不移除键帽,方便预览
        if (get().settingsOpen) return;

        // linger 到期移除
        const state = get();
        let notify = false;
        const groups: KeyGroup[] = [];
        for (const group of state.groups) {
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
        const { pressedKeys, pressedKeyTimes, pressedMouseButtons, mouse, groups, settingsOpen, ...persisted } = state;
        return persisted;
      },
    },
  ),
);
