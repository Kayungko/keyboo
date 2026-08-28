import { darken, lighten } from "@/lib/utils";
import { useStyleStore } from "@/stores/useStyleStore";
import { useReducedMotion } from "motion/react";
import type { KeycapProps } from ".";
import { KeycapBase } from "./base";
import { PressCount } from "./press-count";

// 修饰键结构性层级:与配色无关,始终略小略淡,突出主键
const MODIFIER_SCALE = 0.88;
const MODIFIER_OPACITY = 0.8;

export const LaptopKeycap = ({ event, lastest, isPressed }: KeycapProps) => {
  const color = useStyleStore((state) => state.color);
  const text = useStyleStore((state) => state.text);
  const border = useStyleStore((state) => state.border);
  const modifier = useStyleStore((state) => state.modifier);
  const showPressCount = useStyleStore((state) => state.layout.showPressCount);
  // 减弱动效:去按下位移与 transform 过渡,box-shadow 变色反馈保留
  const reduceMotion = useReducedMotion();

  const bgColor = event.isModifier() && modifier.highlight ? modifier.color : color.color;
  const textColor = event.isModifier() && modifier.highlight ? modifier.textColor : text.color;
  const borderColor = event.isModifier() && modifier.highlight ? modifier.borderColor : border.color;

  return (
    <div
      style={{
        position: "relative",
        height: text.size * 2.25,
        minWidth: text.size * (event.isModifier() ? 2.5 : 2.25),

        paddingInline: text.size * (border.radius < 0.75 ? 0.5 : 0.5 + border.radius - 0.75),
        paddingBlock: text.size * 0.4,

        fontSize: text.size,
        color: textColor,

        borderRadius: border.radius * (text.size * 1.25),

        background: color.useGradient
          ? `linear-gradient(oklch(from ${bgColor} clamp(0, calc(l + 0.1), 1) c h), ${bgColor})`
          : bgColor,

        boxShadow: [
          isPressed ? `inset 0 .05em .2em 0 ${darken(bgColor, 0.2)}` : `inset 0 .05em .1em 0 ${lighten(bgColor, 0.2)}`,
          border.enabled && `0 0 0 ${border.width}px ${borderColor}`,
          // 按下时键帽贴近表面,投影随之收小
          isPressed ? `0 .04em .05em 0 #00000060` : `0 .1em .1em 0 #00000080`,
        ].filter(Boolean).join(", "),

        // 按下:即时响应;抬起:back-out 曲线模拟轻微回弹
        transform: !reduceMotion && isPressed
          ? `translateY(${text.size * 0.06}px) scale(${event.isModifier() ? MODIFIER_SCALE : 1})`
          : `scale(${event.isModifier() ? MODIFIER_SCALE : 1})`,
        opacity: event.isModifier() ? MODIFIER_OPACITY : 1,
        transition: !reduceMotion
          ? isPressed
            ? "transform 0.09s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.08s ease-out"
            : "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease"
          : isPressed
            ? "box-shadow 0.08s ease-out"
            : "box-shadow 0.2s ease",
      }}
    >
      {showPressCount && lastest && event.pressedCount > 1 && <PressCount count={event.pressedCount} />}
      <KeycapBase event={event} />
    </div>
  );
};
