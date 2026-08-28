import { useStyleStore } from "@/stores/useStyleStore";
import { motion, useReducedMotion } from "motion/react";
import type { KeycapProps } from ".";
import { KeycapBase } from "./base";
import { PressCount } from "./press-count";

// 修饰键结构性层级:与配色无关,始终略小略淡,突出主键
const MODIFIER_SCALE = 0.88;
const MODIFIER_OPACITY = 0.8;

export const LowProfileKeycap = ({ event, isPressed, lastest }: KeycapProps) => {
  const color = useStyleStore((state) => state.color);
  const text = useStyleStore((state) => state.text);
  const border = useStyleStore((state) => state.border);
  const modifier = useStyleStore((state) => state.modifier);
  const showPressCount = useStyleStore((state) => state.layout.showPressCount);
  // 减弱动效:去键帽按下位移(按下样式反馈保留)
  const reduceMotion = useReducedMotion();

  const bgColor = event.isModifier() && modifier.highlight ? modifier.color : color.color;
  const secondaryColor = event.isModifier() && modifier.highlight ? modifier.secondaryColor : color.secondaryColor;
  const textColor = event.isModifier() && modifier.highlight ? modifier.textColor : text.color;
  const borderColor = event.isModifier() && modifier.highlight ? modifier.borderColor : border.color;

  return (
    <div
      style={{
        position: "relative",
        height: text.size * 2.5,
        minWidth: text.size * (event.isModifier() ? 2.5 : 2.25),
        transform: event.isModifier() ? `scale(${MODIFIER_SCALE})` : undefined,
        opacity: event.isModifier() ? MODIFIER_OPACITY : 1,
      }}
    >
      {lastest && showPressCount && event.pressedCount > 1 && <PressCount count={event.pressedCount} />}
      <motion.div
        animate={{ transform: !reduceMotion && isPressed ? `translateY(${text.size * 0.25}px)` : "translateY(0px)" }}
        transition={isPressed
          // 按下:即时响应、软着陆
          ? { duration: 0.09, ease: [0.32, 0.72, 0, 1] }
          // 抬起:轻微回弹,模拟键帽弹起
          : { type: "spring", stiffness: 500, damping: 28 }}
        style={{
          zIndex: 2,
          position: "relative",
          height: text.size * 2.25,

          paddingInline: text.size * (border.radius < 0.75 ? 0.5 : 0.5 + border.radius - 0.75),
          paddingBlock: text.size * 0.4,

          fontSize: text.size,
          color: textColor,

          borderStyle: "solid",
          borderWidth: border.enabled ? border.width : 0,
          borderColor: borderColor,
          borderRadius: border.radius * (text.size * 1.25),

          background: bgColor,
        }}
      >
        <KeycapBase event={event} />
      </motion.div>
      <div
        style={{
          position: "absolute",
          height: text.size * 2.25,
          width: "100%",
          bottom: 0,
          zIndex: 1,
          borderStyle: "solid",
          borderWidth: border.enabled ? border.width : 0,
          borderColor: borderColor,
          borderRadius: border.radius * (text.size * 1.25),

          background: secondaryColor,
        }}
      />
    </div>
  );
};
