// 样式 store:覆盖层外观、键帽、颜色与鼠标反馈的全部配置

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keybooStorage } from "./persist";

export const STYLE_STORE_NAME = "keyboo-style-store";

export type Alignment =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type KeyStyle = "minimal" | "standard";
export type AnimationKind = "none" | "fade" | "zoom" | "float" | "slide";

export interface AppearanceSettings {
  monitor: string | null;
  flexDirection: "row" | "column";
  alignment: Alignment;
  marginX: number;
  marginY: number;
  animation: AnimationKind;
  animationDuration: number;
  keyStyle: KeyStyle;
}

export interface TextSettings {
  size: number;
  color: string;
  variant: "text" | "text-short";
  caps: "uppercase" | "capitalize" | "lowercase";
}

export interface ColorSettings {
  color: string;
  secondaryColor: string;
}

export interface BorderSettings {
  enabled: boolean;
  color: string;
  width: number;
  radius: number;
}

export interface BackgroundSettings {
  enabled: boolean;
  color: string;
}

export interface MouseVisualSettings {
  showClicks: boolean;
  size: number;
  color: string;
  keepHighlight: boolean;
  showIndicator: boolean;
  indicatorSize: number;
  offsetX: number;
  offsetY: number;
}

interface StyleActions {
  setAppearance: (partial: Partial<AppearanceSettings>) => void;
  setText: (partial: Partial<TextSettings>) => void;
  setColor: (partial: Partial<ColorSettings>) => void;
  setBorder: (partial: Partial<BorderSettings>) => void;
  setBackground: (partial: Partial<BackgroundSettings>) => void;
  setMouse: (partial: Partial<MouseVisualSettings>) => void;
}

export type StyleStore = {
  appearance: AppearanceSettings;
  text: TextSettings;
  color: ColorSettings;
  border: BorderSettings;
  background: BackgroundSettings;
  mouse: MouseVisualSettings;
} & StyleActions;

export const useStyleStore = create<StyleStore>()(
  persist(
    (set) => ({
      appearance: {
        monitor: null,
        flexDirection: "row",
        alignment: "bottom-center",
        marginX: 100,
        marginY: 100,
        animation: "float",
        animationDuration: 0.25,
        keyStyle: "standard",
      },
      text: {
        size: 28,
        color: "#ffffff",
        variant: "text-short",
        caps: "capitalize",
      },
      color: {
        color: "#ff6b6b",
        secondaryColor: "#2b2b33",
      },
      border: {
        enabled: false,
        color: "#ffffff",
        width: 2,
        radius: 0.35,
      },
      background: {
        enabled: true,
        color: "#1b1b22cc",
      },
      mouse: {
        showClicks: true,
        size: 120,
        color: "#ff6b6b",
        keepHighlight: false,
        showIndicator: true,
        indicatorSize: 44,
        offsetX: 28,
        offsetY: 28,
      },

      setAppearance: (partial) => set((s) => ({ appearance: { ...s.appearance, ...partial } })),
      setText: (partial) => set((s) => ({ text: { ...s.text, ...partial } })),
      setColor: (partial) => set((s) => ({ color: { ...s.color, ...partial } })),
      setBorder: (partial) => set((s) => ({ border: { ...s.border, ...partial } })),
      setBackground: (partial) => set((s) => ({ background: { ...s.background, ...partial } })),
      setMouse: (partial) => set((s) => ({ mouse: { ...s.mouse, ...partial } })),
    }),
    {
      name: STYLE_STORE_NAME,
      storage: keybooStorage,
    },
  ),
);

// ─── 对齐 → flex 属性映射 ───
const flexMap: Record<Alignment, Pick<React.CSSProperties, "justifyContent" | "alignItems">> = {
  "top-left": { justifyContent: "flex-start", alignItems: "flex-start" },
  "top-center": { justifyContent: "center", alignItems: "flex-start" },
  "top-right": { justifyContent: "flex-end", alignItems: "flex-start" },
  "center-left": { justifyContent: "flex-start", alignItems: "center" },
  center: { justifyContent: "center", alignItems: "center" },
  "center-right": { justifyContent: "flex-end", alignItems: "center" },
  "bottom-left": { justifyContent: "flex-start", alignItems: "flex-end" },
  "bottom-center": { justifyContent: "center", alignItems: "flex-end" },
  "bottom-right": { justifyContent: "flex-end", alignItems: "flex-end" },
};

export const alignmentFlex = (alignment: Alignment) => flexMap[alignment];
