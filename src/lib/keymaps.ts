// Keyboo 键位元数据:逻辑键名 → 显示标签
// 屏幕键帽上保留英文键名(与物理键盘印字一致,中英键盘通用)

export interface KeyInfo {
  label: string;
  shortLabel?: string;
  glyph?: string;
}

const define = (entries: Record<string, KeyInfo | string>) => {
  const map: Record<string, KeyInfo> = {};
  for (const [name, info] of Object.entries(entries)) {
    map[name] = typeof info === "string" ? { label: info } : info;
  }
  return map;
};

export const KEYMAPS: Record<string, KeyInfo> = define({
  // ─── 修饰键 ───
  ShiftLeft: { label: "shift", shortLabel: "⇧" },
  ShiftRight: { label: "shift", shortLabel: "⇧" },
  ControlLeft: { label: "ctrl", shortLabel: "⌃" },
  ControlRight: { label: "ctrl", shortLabel: "⌃" },
  Alt: { label: "alt", shortLabel: "⌥" },
  AltRight: { label: "alt gr", shortLabel: "⌥" },
  MetaLeft: { label: "win", shortLabel: "⊞" },
  MetaRight: { label: "win", shortLabel: "⊞" },
  CapsLock: "caps",
  ContextMenu: "☰",

  // ─── 编辑与导航 ───
  Backspace: { label: "backspace", shortLabel: "⌫" },
  Tab: { label: "tab", shortLabel: "⇥" },
  Return: { label: "enter", shortLabel: "⏎" },
  KpReturn: { label: "enter", shortLabel: "⏎" },
  Escape: { label: "esc", shortLabel: "⎋" },
  Space: "space",
  Insert: { label: "ins", shortLabel: "ins" },
  Delete: { label: "del", shortLabel: "del" },
  Home: "home",
  End: "end",
  PageUp: { label: "page up", shortLabel: "pgup" },
  PageDown: { label: "page down", shortLabel: "pgdn" },
  PrintScreen: { label: "prtsc", shortLabel: "prtsc" },
  ScrollLock: "scrlock",
  Pause: "pause",

  // ─── 方向键 ───
  UpArrow: { label: "up", glyph: "↑" },
  DownArrow: { label: "down", glyph: "↓" },
  LeftArrow: { label: "left", glyph: "←" },
  RightArrow: { label: "right", glyph: "→" },

  // ─── 数字 / 字母 / F 键 ───
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`Num${i}`, `0123456789`[i]]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, String.fromCharCode(97 + i)]),
  ),
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`])),

  // ─── 小键盘 ───
  NumLock: "num",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Kp${i}`, `0123456789`[i]])),
  KpPlus: "+",
  KpMinus: "-",
  KpMultiply: "*",
  KpDivide: "/",
  KpDecimal: ".",

  // ─── 符号键(美式布局键位) ───
  BackQuote: "`",
  Minus: "-",
  Equal: "=",
  LeftBracket: "[",
  RightBracket: "]",
  BackSlash: "\\",
  SemiColon: ";",
  Quote: "'",
  Comma: ",",
  Dot: ".",
  Slash: "/",

  // ─── 多媒体 ───
  VolumeMute: { label: "mute", shortLabel: "🔇" },
  VolumeDown: { label: "vol-", shortLabel: "🔉" },
  VolumeUp: { label: "vol+", shortLabel: "🔊" },
  MediaPlayPause: { label: "play", shortLabel: "⏯" },

  // ─── 鼠标虚拟键 ───
  Left: { label: "左键", shortLabel: "左" },
  Right: { label: "右键", shortLabel: "右" },
  Middle: { label: "中键", shortLabel: "中" },
  ScrollUp: { label: "滚轮↑", glyph: "⇡" },
  ScrollDown: { label: "滚轮↓", glyph: "⇣" },
  Drag: { label: "拖拽", shortLabel: "拖" },
});

export const keyInfo = (name: string): KeyInfo => KEYMAPS[name] ?? { label: name };
