import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import type { PersistStorage, StorageValue } from "zustand/middleware";

// 只允许设置窗口写入持久化;覆盖层窗口只读。
// 例外:便签窗口拥有自己独占的条目(todos),见 noteStorage。
export const isSenderWindow = getCurrentWindow().label === "settings";
export const isNoteWindow = getCurrentWindow().label === "note";

const store = await load("keyboo.json", {
  autoSave: isSenderWindow || isNoteWindow ? 1000 : false,
  defaults: {},
});

// 自定义 PersistStorage:写入方判断提前到序列化之前,
// 避免覆盖层窗口每次状态更新都做一次注定丢弃的 JSON.stringify
export const keybooStorage: PersistStorage<any> = {
  getItem: async (name) => {
    const raw = await store.get<string>(name);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StorageValue<any>;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    if (!isSenderWindow) return;
    await store.set(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    if (!isSenderWindow) return;
    await store.delete(name);
  },
};

// 便签窗口独占条目的 PersistStorage:keyboo-note-store 只允许便签窗口写入,
// 其余条目走 keybooStorage(设置窗口)。按 key 分配唯一写者,消除双窗口并发写的 lost-update。
export const noteStorage: PersistStorage<any> = {
  getItem: keybooStorage.getItem,
  setItem: async (name, value) => {
    if (!isNoteWindow) return;
    await store.set(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    if (!isNoteWindow) return;
    await store.delete(name);
  },
};

/** 立即落盘。更新安装前必须调用:Windows 上安装会直接退出进程,
 * autoSave 的 1s 防抖窗口内未写入的设置会丢(与托盘"重启"先落盘同理) */
export async function saveNow() {
  if (isSenderWindow || isNoteWindow) await store.save();
}
