import { keyInfo } from "@/lib/keymaps";
import { isModifierKey } from "@/lib/types";
import type { KeyPress } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { motion } from "motion/react";

// 修饰键结构性层级:略小略淡,突出主键
const MODIFIER_SCALE = 0.88;
const MODIFIER_OPACITY = 0.8;

export interface KeycapProps {
  keyPress: KeyPress;
  isPressed: boolean;
}

/** 键帽内容:短标签优先,支持方向键字符 */
function KeycapContent({ name }: { name: string }) {
  const text = useStyleStore((s) => s.text);
  const info = keyInfo(name);
  const label = text.variant === "text-short" ? info.shortLabel ?? info.label : info.label;

  if (info.glyph) {
    return <span className="font-medium">{info.glyph}</span>;
  }
  return <span>{label}</span>;
}

/** 极简样式:纯文字键帽 */
export function MinimalKeycap({ keyPress, isPressed }: KeycapProps) {
  const text = useStyleStore((s) => s.text);
  const isModifier = isModifierKey(keyPress.name);

  return (
    <motion.div
      animate={{
        scale: (isPressed ? 0.92 : 1) * (isModifier ? MODIFIER_SCALE : 1),
        opacity: (isPressed ? 0.85 : 1) * (isModifier ? MODIFIER_OPACITY : 1),
      }}
      transition={
        isPressed
          ? { duration: 0.09, ease: [0.32, 0.72, 0, 1] }
          : { type: "spring", stiffness: 500, damping: 28 }
      }
      className="flex items-center gap-1 leading-none select-none"
      style={{
        color: text.color,
        fontSize: text.size,
        textTransform: text.caps,
      }}
    >
      <KeycapContent name={keyPress.name} />
      {keyPress.count > 1 && (
        <span style={{ fontSize: text.size * 0.45, opacity: 0.7 }}>{keyPress.count}</span>
      )}
    </motion.div>
  );
}

/** 标准样式:圆角实体键帽,按下下沉 + 回弹 */
export function StandardKeycap({ keyPress, isPressed }: KeycapProps) {
  const text = useStyleStore((s) => s.text);
  const color = useStyleStore((s) => s.color);
  const border = useStyleStore((s) => s.border);
  const isModifier = isModifierKey(keyPress.name);

  return (
    <motion.div
      animate={{
        y: isPressed ? text.size * 0.14 : 0,
        scale: isModifier ? MODIFIER_SCALE : 1,
        opacity: isModifier ? MODIFIER_OPACITY : 1,
      }}
      transition={
        isPressed
          ? { duration: 0.09, ease: [0.32, 0.72, 0, 1] }
          : { type: "spring", stiffness: 500, damping: 28 }
      }
      className="relative flex items-center justify-center leading-none select-none"
      style={{
        height: text.size * 2.1,
        minWidth: text.size * 2.2,
        paddingInline: text.size * 0.55,
        fontSize: text.size,
        color: text.color,
        textTransform: text.caps,
        background: color.color,
        borderRadius: border.radius * (text.size * 1.4),
        boxShadow: [
          isPressed ? "inset 0 0.06em 0.2em rgba(0,0,0,0.35)" : "inset 0 -0.08em 0 rgba(0,0,0,0.25)",
          border.enabled ? `0 0 0 ${border.width}px ${border.color}` : "",
          isPressed ? "0 0.03em 0.06em rgba(0,0,0,0.4)" : "0 0.12em 0.2em rgba(0,0,0,0.45)",
        ].filter(Boolean).join(", "),
      }}
    >
      <KeycapContent name={keyPress.name} />
      {keyPress.count > 1 && (
        <span
          className="absolute flex items-center justify-center font-bold"
          style={{
            top: "4%",
            right: "4%",
            width: text.size * 0.7,
            height: text.size * 0.7,
            fontSize: text.size * 0.38,
            color: color.color,
            background: text.color,
            borderRadius: "50%",
          }}
        >
          {keyPress.count}
        </span>
      )}
    </motion.div>
  );
}

export function Keycap(props: KeycapProps) {
  const keyStyle = useStyleStore((s) => s.appearance.keyStyle);
  return keyStyle === "minimal" ? <MinimalKeycap {...props} /> : <StandardKeycap {...props} />;
}
