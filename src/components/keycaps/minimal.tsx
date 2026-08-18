import { keymaps } from "@/lib/keymaps";
import { useStyleStore } from "@/stores/useStyleStore";
import { motion } from "motion/react";
import type { KeycapProps } from ".";

// 修饰键结构性层级:与配色无关,始终略小略淡,突出主键
const MODIFIER_SCALE = 0.88;
const MODIFIER_OPACITY = 0.8;

export const MinimalKeycap = ({ event, isPressed, lastest }: KeycapProps) => {
  const text = useStyleStore((state) => state.text);
  const modifier = useStyleStore((state) => state.modifier);
  const layout = useStyleStore((state) => state.layout);

  const display = keymaps[event.name];
  const color = event.isModifier() && modifier.highlight ? modifier.textColor : text.color;
  const textStyle: React.CSSProperties = {
    color,
    lineHeight: 1.2,
    fontSize: text.size,
    textTransform: text.caps,
    gap: ".1em",
  };

  const label = display?.shortLabel ?? display?.label;
  let child = <>{label}</>;

  if (event.isModifier() && layout.showIcon && display?.icon) {
    const Icon = display.icon;
    if (text.variant === "icon" || event.isArrow()) {
      child = <Icon color={color} size={text.size} />;
    } else {
      child = (
        <>
          <Icon color={color} size={text.size} />
          <div style={{ ...textStyle }}>
            {text.variant === "text" ? display.label : label}
          </div>
        </>
      );
    }
  }

  const showCount = lastest && layout.showPressCount && event.pressedCount > 1;

  return (
    <motion.div
      animate={{
        scale: (isPressed ? 0.92 : 1) * (event.isModifier() ? MODIFIER_SCALE : 1),
        opacity: (isPressed ? 0.85 : 1) * (event.isModifier() ? MODIFIER_OPACITY : 1),
      }}
      transition={isPressed
        // 按下:即时响应、软着陆
        ? { duration: 0.09, ease: [0.32, 0.72, 0, 1] }
        // 抬起:轻微回弹,模拟键帽弹起
        : { type: "spring", stiffness: 500, damping: 28 }}
      className="flex items-center h-full"
      style={textStyle}
    >
      {child}
      {showCount && (
        <span style={{ fontSize: text.size * 0.45, opacity: 0.7 }}>
          {event.pressedCount}
        </span>
      )}
    </motion.div>
  );
};
