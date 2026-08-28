// 便签配置 store:强调色。唯一写者是设置窗口(走 keybooStorage,零改动);
// 便签窗口经 keyboo-sync 事件只读同步(listenSync,绝不 startSyncSender)。

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keybooStorage } from "./persist";

export const NOTE_CONFIG_STORE_NAME = "keyboo-note-config-store";

/** 7 色强调色(与形态原型 v2 的 palette 一致),默认大黄蜂=产品识别色 */
export const NOTE_ACCENTS = [
  { value: "#FDDB27", label: "大黄蜂" },
  { value: "#42EADD", label: "绿松石" },
  { value: "#00B1D2", label: "赛博" },
  { value: "#3D6FE6", label: "蓝色" },
  { value: "#F06292", label: "粉色" },
  { value: "#6551A6", label: "月食" },
  { value: "#F8F8F8", label: "银色" },
] as const;

interface NoteConfigState {
  accentColor: string;
}

interface NoteConfigActions {
  setAccentColor: (value: string) => void;
}

export type NoteConfigStore = NoteConfigState & NoteConfigActions;

export const useNoteConfigStore = create<NoteConfigStore>()(
  persist(
    (set) => ({
      accentColor: NOTE_ACCENTS[0].value,
      setAccentColor: (accentColor) => set({ accentColor }),
    }),
    {
      name: NOTE_CONFIG_STORE_NAME,
      storage: keybooStorage,
      version: 1,
    },
  ),
);
