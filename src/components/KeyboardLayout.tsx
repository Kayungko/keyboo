import { keymaps } from "@/lib/keymaps";
import { RawKey } from "@/lib/types";
import { useEventStore } from "@/stores/useEventStore";
import { alignmentForRow, useStyleStore } from "@/stores/useStyleStore";

// NohBoard 式整键盘布局:常驻渲染完整键位,按下的键实时高亮。
// 配色复用键帽设置:常态 = 副色,按下 = 主色,文字 = 文字颜色。

interface KeyDef {
  name: string;
  /** 相对基准键宽的倍数 */
  w?: number;
}

// 主键盘区(ANSI)
const MAIN_ROWS: KeyDef[][] = [
  [
    { name: RawKey.Escape },
    { name: RawKey.F1 }, { name: RawKey.F2 }, { name: RawKey.F3 }, { name: RawKey.F4 },
    { name: RawKey.F5 }, { name: RawKey.F6 }, { name: RawKey.F7 }, { name: RawKey.F8 },
    { name: RawKey.F9 }, { name: RawKey.F10 }, { name: RawKey.F11 }, { name: RawKey.F12 },
  ],
  [
    { name: RawKey.BackQuote },
    { name: RawKey.Num1 }, { name: RawKey.Num2 }, { name: RawKey.Num3 }, { name: RawKey.Num4 }, { name: RawKey.Num5 },
    { name: RawKey.Num6 }, { name: RawKey.Num7 }, { name: RawKey.Num8 }, { name: RawKey.Num9 }, { name: RawKey.Num0 },
    { name: RawKey.Minus }, { name: RawKey.Equal }, { name: RawKey.Backspace, w: 2 },
  ],
  [
    { name: RawKey.Tab, w: 1.5 },
    { name: RawKey.KeyQ }, { name: RawKey.KeyW }, { name: RawKey.KeyE }, { name: RawKey.KeyR }, { name: RawKey.KeyT },
    { name: RawKey.KeyY }, { name: RawKey.KeyU }, { name: RawKey.KeyI }, { name: RawKey.KeyO }, { name: RawKey.KeyP },
    { name: RawKey.LeftBracket }, { name: RawKey.RightBracket }, { name: RawKey.BackSlash, w: 1.5 },
  ],
  [
    { name: RawKey.CapsLock, w: 1.8 },
    { name: RawKey.KeyA }, { name: RawKey.KeyS }, { name: RawKey.KeyD }, { name: RawKey.KeyF }, { name: RawKey.KeyG },
    { name: RawKey.KeyH }, { name: RawKey.KeyJ }, { name: RawKey.KeyK }, { name: RawKey.KeyL },
    { name: RawKey.SemiColon }, { name: RawKey.Quote }, { name: RawKey.Return, w: 2.2 },
  ],
  [
    { name: RawKey.ShiftLeft, w: 2.4 },
    { name: RawKey.KeyZ }, { name: RawKey.KeyX }, { name: RawKey.KeyC }, { name: RawKey.KeyV }, { name: RawKey.KeyB },
    { name: RawKey.KeyN }, { name: RawKey.KeyM }, { name: RawKey.Comma }, { name: RawKey.Dot }, { name: RawKey.Slash },
    { name: RawKey.ShiftRight, w: 2.4 },
  ],
  [
    { name: RawKey.ControlLeft, w: 1.4 }, { name: RawKey.MetaLeft, w: 1.4 }, { name: RawKey.Alt, w: 1.4 },
    { name: RawKey.Space, w: 6 },
    { name: RawKey.ControlRight, w: 1.4 },
    { name: RawKey.LeftArrow }, { name: RawKey.UpArrow }, { name: RawKey.DownArrow }, { name: RawKey.RightArrow },
  ],
];

// 小键盘
const NUMPAD_ROWS: KeyDef[][] = [
  [{ name: RawKey.NumLock }, { name: RawKey.KpDivide }, { name: RawKey.KpMultiply }, { name: RawKey.KpMinus }],
  [{ name: RawKey.Kp7 }, { name: RawKey.Kp8 }, { name: RawKey.Kp9 }, { name: RawKey.KpPlus }],
  [{ name: RawKey.Kp4 }, { name: RawKey.Kp5 }, { name: RawKey.Kp6 }, { name: RawKey.KpReturn }],
  [{ name: RawKey.Kp1 }, { name: RawKey.Kp2 }, { name: RawKey.Kp3 }, { name: RawKey.KpDecimal }],
  [{ name: RawKey.Kp0, w: 2 }, { name: RawKey.KpEqual }],
];

// 鼠标列
const MOUSE_KEYS: KeyDef[] = [
  { name: RawKey.Left }, { name: RawKey.Middle }, { name: RawKey.Right },
  { name: RawKey.ScrollUp }, { name: RawKey.ScrollDown }, { name: RawKey.Drag },
];

const LayoutKey = ({ name, width, pressed, unit, fontSize, colors, textTransform, radius }: {
  name: string;
  width: number;
  pressed: boolean;
  unit: number;
  fontSize: number;
  colors: { base: string; active: string; text: string };
  textTransform: React.CSSProperties["textTransform"];
  radius: number;
}) => {
  const display = keymaps[name];
  const label = display?.glyph ?? display?.shortLabel ?? display?.label ?? name;

  return (
    <div
      style={{
        width: unit * width,
        height: unit,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        color: colors.text,
        textTransform,
        userSelect: "none",

        background: pressed ? colors.active : colors.base,
        borderRadius: radius * (unit * 0.4),
        transform: pressed ? "scale(0.96)" : undefined,
        boxShadow: pressed ? `0 0 ${unit * 0.3}px 0 ${colors.active}` : undefined,

        transition: "background-color 0.08s ease-out, transform 0.08s ease-out, box-shadow 0.12s ease-out",
      }}
    >
      {label}
    </div>
  );
};

export const KeyboardLayout = () => {
  const pressedKeys = useEventStore((state) => state.pressedKeys);
  const pressedMouseButtons = useEventStore((state) => state.pressedMouseButtons);
  const wheel = useEventStore((state) => state.mouse.wheel);
  const dragging = useEventStore((state) => state.mouse.dragging);

  const appearance = useStyleStore((state) => state.appearance);
  const text = useStyleStore((state) => state.text);
  const color = useStyleStore((state) => state.color);

  const unit = text.size * 1.25;
  const gap = text.size * 0.12;
  const fontSize = text.size * 0.38;

  const colors = {
    base: color.secondaryColor,
    active: color.color,
    text: text.color,
  };

  const alignment = alignmentForRow[appearance.alignment];

  const isKeyPressed = (name: string) => {
    if (pressedKeys.includes(name)) return true;
    // 鼠标虚拟键状态:拖拽中鼠标键已被 Drag 取代,不再重复高亮
    if (!dragging && pressedMouseButtons.includes(name)) return true;
    if (name === RawKey.ScrollUp && wheel > 0) return true;
    if (name === RawKey.ScrollDown && wheel < 0) return true;
    if (name === RawKey.Drag && dragging) return true;
    return false;
  };

  const renderRows = (rows: KeyDef[][]) =>
    rows.map((row, rowIndex) => (
      <div key={rowIndex} style={{ display: "flex", gap }}>
        {row.map((key) => (
          <LayoutKey
            key={key.name}
            name={key.name}
            width={key.w ?? 1}
            pressed={isKeyPressed(key.name)}
            unit={unit}
            fontSize={fontSize}
            colors={colors}
            textTransform={text.caps}
            radius={0.5}
          />
        ))}
      </div>
    ));

  return (
    <div
      className="w-full h-full flex"
      style={{
        paddingBlock: appearance.marginY,
        paddingInline: appearance.marginX,
        alignItems: alignment.alignItems,
        justifyContent: alignment.justifyContent,
      }}
    >
      <div style={{ display: "flex", gap: unit * 0.5 }}>
        {/* 主键盘区 */}
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {renderRows(MAIN_ROWS)}
        </div>
        {/* 小键盘 */}
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {renderRows(NUMPAD_ROWS)}
        </div>
        {/* 鼠标列 */}
        <div style={{ display: "flex", flexDirection: "column", gap, width: unit * 1.6 }}>
          {MOUSE_KEYS.map((key) => (
            <LayoutKey
              key={key.name}
              name={key.name}
              width={1.6}
              pressed={isKeyPressed(key.name)}
              unit={unit}
              fontSize={fontSize}
              colors={colors}
              textTransform={text.caps}
              radius={0.5}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
