import { keymaps } from "@/lib/keymaps";
import { KeyEvent } from "@/lib/types";
import { useStyleStore } from "@/stores/useStyleStore";
import { alignmentForRow } from "@/stores/useStyleStore";

export const KeycapBase = ({ event }: { event: KeyEvent }) => {
  const text = useStyleStore((state) => state.text);
  const layout = useStyleStore((state) => state.layout);
  const modifier = useStyleStore((state) => state.modifier);
  const display = keymaps[event.name];

  const textColor = event.isModifier() && modifier.highlight ? modifier.textColor : text.color;
  const textStyle: React.CSSProperties = {
    color: textColor,
    lineHeight: 1.2,
    fontSize: text.size,
    textTransform: text.caps,
  };

  const label = text.variant === "text-short"
    ? display?.shortLabel ?? display?.label
    : display?.label;

  const flexAlignment = alignmentForRow[text.alignment];

  // ─── 带图标 ───
  if (layout.showIcon && display?.icon) {
    const Icon = display.icon;
    if (text.variant === "icon" || event.isArrow()) {
      return (
        <div
          className="w-full h-full flex"
          style={{ alignItems: flexAlignment.alignItems, justifyContent: flexAlignment.justifyContent }}
        >
          <Icon color={textColor} size={text.size * 0.8} />
        </div>
      );
    } else {
      const alignItems = event.isModifier()
        ? layout.iconAlignment
        // 纵向布局时翻转对齐
        : flexAlignment.justifyContent;
      return (
        <div
          className="w-full h-full flex flex-col justify-between"
          style={{ alignItems }}
        >
          <Icon color={textColor} size={text.size * 0.5} />
          <div style={{ ...textStyle, fontSize: text.size * 0.5 }}>
            {label}
          </div>
        </div>
      );
    }
  }
  // ─── 带符号 ───
  else if (layout.showSymbol && display?.symbol) {
    return (
      <div
        className="w-full h-full flex flex-col"
        style={{
          ...textStyle,
          lineHeight: 1.4,
          fontSize: text.size * 0.56,
          alignItems: flexAlignment.justifyContent,
          justifyContent: flexAlignment.alignItems,
        }}
      >
        <span>{display.symbol}</span>
        <span className="font-semibold">{display.label}</span>
      </div>
    );
  }
  // ─── 小键盘 ───
  else if (event.isNumpad()) {
    return (
      <div
        className="w-full h-full flex flex-col justify-between"
        style={{
          ...textStyle,
          fontSize: text.size * 0.5,
          alignItems: flexAlignment.alignItems,
          justifyContent: flexAlignment.justifyContent,
        }}
      >
        <div>{label}</div>
        {display?.symbol && <div>{display.symbol}</div>}
      </div>
    );
  }
  // ─── 纯文字 ───
  return (
    <div
      className="w-full h-full flex"
      style={{ ...textStyle, alignItems: flexAlignment.alignItems, justifyContent: flexAlignment.justifyContent }}
    >
      {label}
    </div>
  );
};
