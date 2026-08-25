// Keyboo 输入事件类型、键名常量与按键对象
// 键名采用 DOM 标准命名,与 Rust 侧 vk_to_name 输出对应

// ─── 事件载荷(Rust → 前端) ───

export interface RawKeyEvent {
  type: "KeyEvent";
  pressed: boolean;
  name: string;
}

export interface MouseButtonEvent {
  type: "MouseButtonEvent";
  pressed: boolean;
  button: MouseButton;
}

export interface MouseMoveEvent {
  type: "MouseMoveEvent";
  x: number;
  y: number;
}

export interface MouseWheelEvent {
  type: "MouseWheelEvent";
  delta_x: number;
  delta_y: number;
}

export type EventPayload = RawKeyEvent | MouseButtonEvent | MouseMoveEvent | MouseWheelEvent;

export type MouseButton = "Left" | "Right" | "Middle" | "Other";

// ─── 键名常量 ───

export const RawKey = {
  // 修饰键
  ShiftLeft: "ShiftLeft",
  ShiftRight: "ShiftRight",
  ControlLeft: "ControlLeft",
  ControlRight: "ControlRight",
  Alt: "Alt",
  AltRight: "AltRight",
  MetaLeft: "MetaLeft",
  MetaRight: "MetaRight",
  CapsLock: "CapsLock",

  // 导航
  UpArrow: "UpArrow",
  DownArrow: "DownArrow",
  LeftArrow: "LeftArrow",
  RightArrow: "RightArrow",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",

  // 编辑 / 控制
  Return: "Return",
  KpReturn: "KpReturn",
  Tab: "Tab",
  Backspace: "Backspace",
  Escape: "Escape",
  Space: "Space",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  NumLock: "NumLock",
  ContextMenu: "ContextMenu",

  // F 键
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",

  // 数字行
  Num1: "Num1", Num2: "Num2", Num3: "Num3", Num4: "Num4", Num5: "Num5",
  Num6: "Num6", Num7: "Num7", Num8: "Num8", Num9: "Num9", Num0: "Num0",

  // 字母
  KeyA: "KeyA", KeyB: "KeyB", KeyC: "KeyC", KeyD: "KeyD", KeyE: "KeyE",
  KeyF: "KeyF", KeyG: "KeyG", KeyH: "KeyH", KeyI: "KeyI", KeyJ: "KeyJ",
  KeyK: "KeyK", KeyL: "KeyL", KeyM: "KeyM", KeyN: "KeyN", KeyO: "KeyO",
  KeyP: "KeyP", KeyQ: "KeyQ", KeyR: "KeyR", KeyS: "KeyS", KeyT: "KeyT",
  KeyU: "KeyU", KeyV: "KeyV", KeyW: "KeyW", KeyX: "KeyX", KeyY: "KeyY",
  KeyZ: "KeyZ",

  // 符号(美式布局键位)
  BackQuote: "BackQuote",
  Minus: "Minus",
  Equal: "Equal",
  LeftBracket: "LeftBracket",
  RightBracket: "RightBracket",
  BackSlash: "BackSlash",
  SemiColon: "SemiColon",
  Quote: "Quote",
  Comma: "Comma",
  Dot: "Dot",
  Slash: "Slash",

  // 小键盘
  Kp0: "Kp0", Kp1: "Kp1", Kp2: "Kp2", Kp3: "Kp3", Kp4: "Kp4",
  Kp5: "Kp5", Kp6: "Kp6", Kp7: "Kp7", Kp8: "Kp8", Kp9: "Kp9",
  KpPlus: "KpPlus",
  KpMinus: "KpMinus",
  KpMultiply: "KpMultiply",
  KpDivide: "KpDivide",
  KpDecimal: "KpDecimal",
  KpEqual: "KpEqual",

  // 多媒体
  VolumeUp: "VolumeUp",
  VolumeDown: "VolumeDown",
  VolumeMute: "VolumeMute",
  MediaPlayPause: "MediaPlayPause",

  // 鼠标虚拟键
  Left: "Left",
  Middle: "Middle",
  Right: "Right",
  ScrollUp: "ScrollUp",
  ScrollDown: "ScrollDown",
  Drag: "Drag",
} as const;

export type RawKeyName = (typeof RawKey)[keyof typeof RawKey];

// ─── 修饰键集合 ───

export const MODIFIERS = new Set<string>([
  RawKey.ShiftLeft,
  RawKey.ShiftRight,
  RawKey.ControlLeft,
  RawKey.ControlRight,
  RawKey.Alt,
  RawKey.AltRight,
  RawKey.MetaLeft,
  RawKey.MetaRight,
]);

// ─── 按键对象(浮层中的一个键) ───

export class KeyEvent {
  name: string;
  pressedCount: number;
  lastPressedAt: number;

  constructor(name: string) {
    this.name = name;
    this.pressedCount = 1;
    this.lastPressedAt = Date.now();
  }

  /** 再次按下:计数加一、刷新时间 */
  press() {
    this.pressedCount += 1;
    this.lastPressedAt = Date.now();
  }

  /** 当前是否仍被按住 */
  in(pressedKeys: string[]) {
    return pressedKeys.includes(this.name);
  }

  isModifier(): boolean {
    return MODIFIERS.has(this.name);
  }

  isNumpad(): boolean {
    return this.name.startsWith("Kp") || this.name === RawKey.NumLock;
  }

  isArrow(): boolean {
    return this.name.endsWith("Arrow");
  }

  isMouseVirtual(): boolean {
    const virtualKeys: string[] = [RawKey.Left, RawKey.Middle, RawKey.Right, RawKey.ScrollUp, RawKey.ScrollDown, RawKey.Drag];
    return virtualKeys.includes(this.name);
  }
}

// 鼠标虚拟键全集(含侧键 Other):设备维度显示门控的唯一真源。
// KeyEvent.isMouseVirtual() 不含 "Other",直接复用会漏拦侧键
// (X1/X2 经后端 WM_XBUTTONDOWN 以 button:"Other" 进入显示链路)。
export const MOUSE_VIRTUAL_KEYS = new Set<string>([
  RawKey.Left,
  RawKey.Middle,
  RawKey.Right,
  RawKey.ScrollUp,
  RawKey.ScrollDown,
  RawKey.Drag,
  "Other",
]);

export function isMouseKey(name: string): boolean {
  return MOUSE_VIRTUAL_KEYS.has(name);
}

export interface KeyGroup {
  keys: KeyEvent[];
  createdAt: number;
}
