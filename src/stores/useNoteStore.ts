// 便签数据 store:主题(Topic)与待办条目。唯一写者是便签窗口(storage 门控见 persist.ts noteStorage)。
// 在便签输入框打字计入伙伴 XP:全局低级钩子与窗口焦点无关,无需在此处理。
// 主题 = 长期项目:子待办陆续完成只是进度,全部完成才整体收纳(doneAt 记在主题上);
// 平铺待办(无 topicId)完成即收纳(原行为)。

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { noteStorage } from "./persist";

export const NOTE_STORE_NAME = "keyboo-note-store";

export interface TodoItem {
  id: string;
  /** trim 后 1..42 字符(输入框 maxlength 同步限制) */
  text: string;
  done: boolean;
  /** 排序参考:新事项追加到列表尾部 */
  createdAt: number;
  /** 完成时间戳(平铺待办的收纳序;主题内子待办完成时间不对外展示);未完成为 undefined */
  doneAt?: number;
  /** 归属主题;平铺待办为 undefined */
  topicId?: string;
}

export interface Topic {
  id: string;
  /** trim 后 1..42 字符 */
  title: string;
  createdAt: number;
  /** 主题整体完成时间戳(全部子待办完成的时刻);未完成为 undefined */
  doneAt?: number;
}

interface NoteState {
  todos: TodoItem[];
  topics: Topic[];
  /** 窗口可见形态:展开(false) / 条幅(true);隐藏到托盘不改变本值 */
  collapsed: boolean;
  /** 主列表自定义标题;空串 = 回退默认「今日待办」 */
  listTitle: string;
}

interface NoteActions {
  addTodo: (text: string, topicId?: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  /** 行内编辑:trim 后为空时不变更(调用方视为取消) */
  updateTodo: (id: string, text: string) => void;
  /** 拖动排序:把 id 移动到 toIndex(越界时钳制);平铺待办按平铺序、主题子待办按所在主题子序各自重排 */
  reorderTodo: (id: string, toIndex: number) => void;
  addTopic: (title: string) => string;
  /** 主题改名:trim 后为空时不变更 */
  updateTopic: (id: string, title: string) => void;
  /** 删除主题 = 连带删除其全部子待办(调用方负责确认) */
  removeTopic: (id: string) => void;
  /** 拖动排序主题(仅主列表的平铺待办+主题行序列内有效) */
  reorderTopic: (id: string, toIndex: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  /** 自定义主列表标题:trim 后为空则清空(回退默认「今日待办」) */
  setListTitle: (title: string) => void;
}

export type NoteStore = NoteState & NoteActions;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useNoteStore = create<NoteStore>()(
  persist(
    (set) => ({
      todos: [],
      topics: [],
      collapsed: false,
      listTitle: "",

      addTodo: (text, topicId) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => ({
          todos: [
            ...state.todos,
            { id: newId(), text: trimmed, done: false, createdAt: Date.now(), topicId },
          ],
        }));
      },

      // 平铺待办完成:原位保留(收纳表按 doneAt 排序,数组位置无关);
      // 取消完成:回到进行中列表末尾(数组顺序即进行中顺序)。
      // 主题内子待办:完成仅改自身(进度),主题 doneAt 由 UI 层在全部完成时落笔;
      // 取消完成同时清掉主题 doneAt(主题回到进行中)。
      toggleTodo: (id) =>
        set((state) => {
          const target = state.todos.find((todo) => todo.id === id);
          if (!target) return state;
          const flipped: TodoItem = {
            ...target,
            done: !target.done,
            doneAt: target.done ? undefined : Date.now(),
          };
          if (target.topicId) {
            const todos = state.todos.map((todo) => (todo.id === id ? flipped : todo));
            const topic = state.topics.find((t) => t.id === target.topicId);
            if (!topic) return { todos };
            const children = todos.filter((t) => t.topicId === topic.id);
            const allDone = flipped.done && children.every((t) => t.done);
            return {
              todos,
              topics: allDone
                ? state.topics.map((t) => (t.id === topic.id ? { ...t, doneAt: Date.now() } : t))
                : state.topics.map((t) =>
                    t.id === topic.id && t.doneAt ? { ...t, doneAt: undefined } : t,
                  ),
            };
          }
          if (flipped.done) {
            return { todos: state.todos.map((todo) => (todo.id === id ? flipped : todo)) };
          }
          return { todos: [...state.todos.filter((todo) => todo.id !== id), flipped] };
        }),

      removeTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),

      updateTodo: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => ({
          todos: state.todos.map((todo) => (todo.id === id ? { ...todo, text: trimmed } : todo)),
        }));
      },

      reorderTodo: (id, toIndex) =>
        set((state) => {
          const target = state.todos.find((t) => t.id === id);
          if (!target) return state;
          // 主题子待办:在所在主题的子序列内重排;平铺待办与其它主题的相对顺序不变
          if (target.topicId) {
            const siblings = state.todos.filter((t) => t.topicId === target.topicId);
            const from = siblings.findIndex((t) => t.id === id);
            if (from < 0 || from === toIndex) return state;
            const next = siblings.slice();
            const [moved] = next.splice(from, 1);
            next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
            let cursor = 0;
            return {
              todos: state.todos.map((t) =>
                t.topicId === target.topicId ? next[cursor++] : t,
              ),
            };
          }
          // 平铺待办间排序
          const flat = state.todos.filter((t) => !t.topicId);
          const from = flat.findIndex((t) => t.id === id);
          if (from < 0 || from === toIndex) return state;
          const next = flat.slice();
          const [moved] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
          // 平铺段重排后按「平铺序在前、主题子待办在后」重组
          const flatIds = new Set(next.map((t) => t.id));
          return {
            todos: [
              ...next,
              ...state.todos.filter((t) => !flatIds.has(t.id)),
            ],
          };
        }),

      addTopic: (title) => {
        const trimmed = title.trim();
        const id = newId();
        if (!trimmed) return id;
        set((state) => ({ topics: [...state.topics, { id, title: trimmed, createdAt: Date.now() }] }));
        return id;
      },

      updateTopic: (id, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set((state) => ({
          topics: state.topics.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
        }));
      },

      removeTopic: (id) =>
        set((state) => ({
          topics: state.topics.filter((t) => t.id !== id),
          todos: state.todos.filter((t) => t.topicId !== id),
        })),

      reorderTopic: (id, toIndex) => {
        set((state) => {
          const active = state.topics.filter((t) => !t.doneAt);
          const from = active.findIndex((t) => t.id === id);
          if (from < 0 || from === toIndex) return state;
          const next = active.slice();
          const [moved] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
          const doneTopics = state.topics.filter((t) => t.doneAt);
          return { topics: [...next, ...doneTopics] };
        });
      },

      setCollapsed: (collapsed) => set({ collapsed }),

      setListTitle: (title) => set({ listTitle: title.trim() }),
    }),
    {
      name: NOTE_STORE_NAME,
      storage: noteStorage,
      version: 4,
      // v1/v2 → v3:保留旧 todos/topics,补窗口条幅状态
      // v3 → v4:补主列表自定义标题(缺省空串 = 默认「今日待办」)
      migrate: (persisted) => {
        const state = persisted as {
          todos?: TodoItem[];
          topics?: Topic[];
          collapsed?: boolean;
          listTitle?: string;
        };
        return {
          todos: state.todos ?? [],
          topics: state.topics ?? [],
          collapsed: state.collapsed ?? false,
          listTitle: state.listTitle ?? "",
        };
      },
    },
  ),
);
