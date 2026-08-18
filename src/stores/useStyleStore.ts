// 样式 store:覆盖层外观、键帽、颜色与鼠标反馈的全部配置
// 结构与交互对齐 Keyviz 的 KeyStyleState

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { keybooStorage } from "./persist";

export const STYLE_STORE_NAME = "keyboo-style-store";

export type Alignment =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type KeycapStyle = "minimal" | "laptop" | "lowprofile" | "pbt";
export type AnimationKind = "none" | "fade" | "zoom" | "float" | "slide";
export type ChromaKey = "none" | "magenta" | "green";
export type DisplayMode = "floating" | "keyboard";

export interface AppearanceSettings {
  monitor: string | null;
  flexDirection: "row" | "column";
  alignment: Alignment;
  marginX: number;
  marginY: number;
  animation: AnimationKind;
  animationDuration: number;
  style: KeycapStyle;
  chromaKey: ChromaKey;
  displayMode: DisplayMode;
}

export interface LayoutSettings {
  showIcon: boolean;
  showSymbol: boolean;
  showPressCount: boolean;
  iconAlignment: "flex-start" | "center" | "flex-end";
}

export interface ColorSettings {
  color: string;
  secondaryColor: string;
  useGradient: boolean;
}

export interface ModifierSettings {
  highlight: boolean;
  color: string;
  secondaryColor: string;
  textColor: string;
  borderColor: string;
}

export interface TextSettings {
  size: number;
  color: string;
  caps: "uppercase" | "capitalize" | "lowercase";
  variant: "icon" | "text" | "text-short";
  alignment: Alignment;
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

export interface MouseSettings {
  showClicks: boolean;
  size: number;
  color: string;
  keepHighlight: boolean;
  showIndicator: boolean;
  keepIndicator: boolean;
  indicatorSize: number;
  indicatorOffsetX: number;
  indicatorOffsetY: number;
  showTrail: boolean;
  trailWidth: number;
  trailFadeMs: number;
}

export interface StyleState {
  appearance: AppearanceSettings;
  layout: LayoutSettings;
  color: ColorSettings;
  modifier: ModifierSettings;
  text: TextSettings;
  border: BorderSettings;
  background: BackgroundSettings;
  mouse: MouseSettings;
}

interface StyleActions {
  setAppearance: (appearance: Partial<AppearanceSettings>) => void;
  setLayout: (layout: Partial<LayoutSettings>) => void;
  setColor: (color: Partial<ColorSettings>) => void;
  setModifier: (modifier: Partial<ModifierSettings>) => void;
  setText: (text: Partial<TextSettings>) => void;
  setBorder: (border: Partial<BorderSettings>) => void;
  setBackground: (background: Partial<BackgroundSettings>) => void;
  setMouse: (mouse: Partial<MouseSettings>) => void;
  importStyle: () => Promise<void>;
  exportStyle: () => Promise<void>;
}

export type StyleStore = StyleState & StyleActions;

export const useStyleStore = create<StyleStore>()(
  persist(
    (set, get) => ({
      appearance: {
        monitor: null,
        flexDirection: "row",
        alignment: "bottom-center",
        marginX: 100,
        marginY: 100,
        animation: "float",
        animationDuration: 0.25,
        style: "lowprofile",
        chromaKey: "none",
        displayMode: "floating",
      },
      layout: {
        showIcon: true,
        showSymbol: true,
        showPressCount: true,
        iconAlignment: "flex-end",
      },
      color: {
        color: "#f8f8f8",
        secondaryColor: "#dcdcdc",
        useGradient: false,
      },
      modifier: {
        highlight: false,
        color: "#e5e5e5",
        secondaryColor: "#232329",
        textColor: "#ffffff",
        borderColor: "#e5e5e5",
      },
      text: {
        size: 28,
        color: "#000000",
        caps: "capitalize",
        variant: "text-short",
        alignment: "center",
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
        color: "#ffffff",
        keepHighlight: false,
        showIndicator: true,
        keepIndicator: true,
        indicatorSize: 44,
        indicatorOffsetX: 28,
        indicatorOffsetY: 28,
        showTrail: false,
        trailWidth: 6,
        trailFadeMs: 600,
      },

      setAppearance: (appearance) => set((s) => ({ appearance: { ...s.appearance, ...appearance } })),
      setLayout: (layout) => set((s) => ({ layout: { ...s.layout, ...layout } })),
      setColor: (color) => set((s) => ({ color: { ...s.color, ...color } })),
      setModifier: (modifier) => set((s) => ({ modifier: { ...s.modifier, ...modifier } })),
      setText: (text) => set((s) => ({ text: { ...s.text, ...text } })),
      setBorder: (border) => set((s) => ({ border: { ...s.border, ...border } })),
      setBackground: (background) => set((s) => ({ background: { ...s.background, ...background } })),
      setMouse: (mouse) => set((s) => ({ mouse: { ...s.mouse, ...mouse } })),

      // 样式导入/导出(JSON 文件)
      importStyle: async () => {
        try {
          const filePath = await open({
            multiple: false,
            filters: [{ name: "JSON 文件", extensions: ["json"] }],
          });
          if (!filePath || typeof filePath !== "string") return;
          const content = await readTextFile(filePath);
          const parsed: Partial<StyleState> = JSON.parse(content);
          if (
            !parsed.appearance || !parsed.layout || !parsed.color || !parsed.modifier ||
            !parsed.text || !parsed.border || !parsed.background || !parsed.mouse
          ) {
            toast.warning("文件格式无效", { description: filePath });
            return;
          }
          // 与当前配置浅合并:旧版本导出的文件缺少新增字段(如轨迹参数)时,
          // 缺失字段保留当前值,而不是变成 undefined 引发渲染错误
          const state = get();
          set({
            appearance: { ...state.appearance, ...parsed.appearance },
            layout: { ...state.layout, ...parsed.layout },
            color: { ...state.color, ...parsed.color },
            modifier: { ...state.modifier, ...parsed.modifier },
            text: { ...state.text, ...parsed.text },
            border: { ...state.border, ...parsed.border },
            background: { ...state.background, ...parsed.background },
            mouse: { ...state.mouse, ...parsed.mouse },
          });
          toast.success("导入成功", { description: filePath });
        } catch (err) {
          toast.error("导入文件出错", { description: err instanceof Error ? err.message : String(err) });
        }
      },
      exportStyle: async () => {
        const state = get();
        const data: StyleState = {
          appearance: state.appearance,
          layout: state.layout,
          color: state.color,
          modifier: state.modifier,
          text: state.text,
          border: state.border,
          background: state.background,
          mouse: state.mouse,
        };
        try {
          const filePath = await save({
            defaultPath: "keyboo_style.json",
            filters: [{ name: "JSON 文件", extensions: ["json"] }],
          });
          if (!filePath) return;
          await writeTextFile(filePath, JSON.stringify(data, null, 2));
          toast.success("导出成功", { description: filePath });
        } catch (err) {
          toast.error("导出文件出错", { description: err instanceof Error ? err.message : String(err) });
        }
      },
    }),
    {
      name: STYLE_STORE_NAME,
      storage: keybooStorage,
      // v1:整体黑白化——存量(0.2.x 珊瑚色)配置迁移到黑白简约主题
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<StyleState>;
        if (version === 0) {
          state.color = { color: "#f8f8f8", secondaryColor: "#dcdcdc", useGradient: false };
          if (state.text) state.text = { ...state.text, color: "#000000" };
          if (state.mouse) state.mouse = { ...state.mouse, color: "#ffffff" };
          if (state.modifier) {
            state.modifier = { ...state.modifier, color: "#e5e5e5", borderColor: "#e5e5e5" };
          }
        }
        return state as StyleState;
      },
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

export const alignmentForRow = flexMap;
export const alignmentForColumn = flexMap;
