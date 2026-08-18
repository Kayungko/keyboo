// Keyboo 输入事件的类型定义与键位辅助函数

export interface KeyPayload {
  type: "KeyEvent";
  pressed: boolean;
  name: string;
}

export interface MouseButtonPayload {
  type: "MouseButtonEvent";
  pressed: boolean;
  button: "Left" | "Right" | "Middle" | "Other";
}

export interface MouseMovePayload {
  type: "MouseMoveEvent";
  x: number;
  y: number;
}

export interface MouseWheelPayload {
  type: "MouseWheelEvent";
  delta_y: number;
}

export type InputPayload =
  | KeyPayload
  | MouseButtonPayload
  | MouseMovePayload
  | MouseWheelPayload;

export const MODIFIERS = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "Alt",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

export const isModifierKey = (name: string) => MODIFIERS.has(name);

/** 鼠标虚拟键名(与 Rust 侧 MouseButton 序列化对应) */
export const MOUSE_VIRTUAL_KEYS = ["Left", "Middle", "Right", "ScrollUp", "ScrollDown", "Drag"];
