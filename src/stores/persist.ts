import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import type { PersistStorage, StorageValue } from "zustand/middleware";

// 只允许设置窗口写入持久化;覆盖层窗口只读
export const isSenderWindow = getCurrentWindow().label === "settings";

const store = await load("keyboo.json", {
  autoSave: isSenderWindow ? 1000 : false,
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
