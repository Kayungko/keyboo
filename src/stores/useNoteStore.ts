// 便签数据 store:待办条目。唯一写者是便签窗口(storage 门控见 persist.ts noteStorage)。
// 在便签输入框打字计入伙伴 XP:全局低级钩子与窗口焦点无关,无需在此处理。

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
}

interface NoteState {
  todos: TodoItem[];
}

interface NoteActions {
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
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

      addTodo: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => ({
          todos: [...state.todos, { id: newId(), text: trimmed, done: false, createdAt: Date.now() }],
        }));
      },

      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
        })),

      removeTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),
    }),
    {
      name: NOTE_STORE_NAME,
      storage: noteStorage,
      version: 1,
    },
  ),
);
