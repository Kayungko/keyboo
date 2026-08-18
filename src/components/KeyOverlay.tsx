import { useEventStore } from "@/stores/useEventStore";
import { alignmentFlex, useStyleStore } from "@/stores/useStyleStore";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Fragment, useMemo } from "react";
import { Keycap } from "./Keycap";

// 组级淡入淡出的缓动
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_IN: [number, number, number, number] = [0.76, 0.05, 0.86, 0.06];

/** 连接符进出场 */
const separatorVariants: Variants = {
  visible: { opacity: 0.55, transition: { duration: 0.15, ease: EASE_OUT } },
  hidden: { opacity: 0, transition: { duration: 0.1, ease: EASE_IN } },
};

export function KeyOverlay() {
  const groups = useEventStore((s) => s.groups);
  const pressedKeys = useEventStore((s) => s.pressedKeys);
  const showHistory = useEventStore((s) => s.showHistory);

  const appearance = useStyleStore((s) => s.appearance);
  const text = useStyleStore((s) => s.text);
  const background = useStyleStore((s) => s.background);
  const border = useStyleStore((s) => s.border);

  const alignment = alignmentFlex(appearance.alignment);

  const containerStyle: React.CSSProperties = {
    flexDirection: appearance.flexDirection,
    paddingBlock: appearance.marginY,
    paddingInline: appearance.marginX,
    alignItems: alignment.alignItems,
    justifyContent: alignment.justifyContent,
    gap: text.size * 0.5,
  };

  const groupStyle: React.CSSProperties = {
    display: "flex",
    columnGap: appearance.keyStyle === "minimal" ? text.size * 0.18 : text.size * 0.3,
    ...(background.enabled && {
      paddingInline: text.size * 0.45,
      paddingBlock: appearance.keyStyle === "minimal" ? text.size * 0.3 : text.size * 0.4,
      background: background.color,
      borderRadius: border.radius * (text.size * 1.75),
    }),
  };

  // 组进出场:进入 easeOut 淡入 + 缩放回位,退出 easeIn 淡出且时长 ×0.7 更利落。
  // custom 参数为深度(0=最新组):旧组按深度衰减透明度/缩放,形成层次;
  // 组内子元素带轻微 stagger,连按有层叠节奏。
  const groupVariants = useMemo<Variants>(() => ({
    visible: (depth: number) => ({
      opacity: Math.max(0.4, 1 - depth * 0.18),
      scale: Math.max(0.94, 1 - depth * 0.02),
      transition: {
        duration: showHistory ? appearance.animationDuration : 0,
        ease: EASE_OUT,
        staggerChildren: 0.025,
      },
    }),
    hidden: () => ({
      opacity: 0,
      transition: { duration: showHistory ? appearance.animationDuration * 0.7 : 0, ease: EASE_IN },
    }),
  }), [showHistory, appearance.animationDuration]);

  // 键帽进出场:进入用 spring 带轻微回弹,退出用 easeIn 快速收尾。
  // zoom 起点 0.6 避免从零放大的闪烁。
  const keyVariants = useMemo<Variants>(() => {
    const enter = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.9 };
    const exit = { duration: appearance.animationDuration * 0.7, ease: EASE_IN };
    switch (appearance.animation) {
      case "none":
        return { visible: {}, hidden: {} };
      case "fade":
        return {
          visible: { opacity: 1, transition: { duration: appearance.animationDuration, ease: EASE_OUT } },
          hidden: { opacity: 0, transition: exit },
        };
      case "zoom":
        return {
          visible: { scale: 1, opacity: 1, transition: enter },
          hidden: { scale: 0.6, opacity: 0, transition: exit },
        };
      case "float":
        return {
          visible: { opacity: 1, y: 0, transition: enter },
          hidden: { opacity: 0, y: text.size, transition: exit },
        };
      case "slide":
        return {
          visible: { opacity: 1, x: 0, transition: enter },
          hidden: { opacity: 0, x: text.size, transition: exit },
        };
    }
  }, [appearance.animation, appearance.animationDuration, text.size]);

  const noAnimation = appearance.animation === "none";

  const renderGroups = (animated: boolean) =>
    groups.map((group, groupIndex) => {
      const depth = groups.length - 1 - groupIndex;
      const content = group.keys.map((keyPress, keyIndex) => (
        <Fragment key={keyPress.name}>
          {keyIndex > 0 && group.keys.length > 1 && (
            animated ? (
              <motion.span
                className="self-center select-none"
                style={{ fontSize: text.size * 0.5, color: text.color }}
                variants={separatorVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                +
              </motion.span>
            ) : (
              <span className="self-center select-none" style={{ fontSize: text.size * 0.5, color: text.color, opacity: 0.55 }}>
                +
              </span>
            )
          )}
          {animated ? (
            <motion.div
              layout="position"
              variants={keyVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ layout: { duration: appearance.animationDuration / 3, ease: EASE_OUT } }}
            >
              <Keycap
                keyPress={keyPress}
                isPressed={groups.length - 1 === groupIndex && pressedKeys.includes(keyPress.name)}
              />
            </motion.div>
          ) : (
            <Keycap
              keyPress={keyPress}
              isPressed={groups.length - 1 === groupIndex && pressedKeys.includes(keyPress.name)}
            />
          )}
        </Fragment>
      ));

      if (!animated) {
        return (
          <div key={group.createdAt} style={groupStyle} className={background.enabled ? "overflow-hidden" : ""}>
            {content}
          </div>
        );
      }
      return (
        <motion.div
          key={group.createdAt}
          layout={showHistory ? "position" : false}
          custom={depth}
          variants={groupVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          style={groupStyle}
          className={background.enabled ? "overflow-hidden" : ""}
        >
          <AnimatePresence>{content}</AnimatePresence>
        </motion.div>
      );
    });

  return (
    <div className="w-full h-full flex" style={containerStyle}>
      {noAnimation ? renderGroups(false) : <AnimatePresence>{renderGroups(true)}</AnimatePresence>}
    </div>
  );
}
