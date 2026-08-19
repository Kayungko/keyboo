import { useEventStore } from "@/stores/useEventStore";
import { alignmentForColumn, alignmentForRow, useStyleStore } from "@/stores/useStyleStore";
import { easeInQuint, easeOutQuint } from "@/lib/utils";
import { AnimatePresence, motion, Variants } from "motion/react";
import { Fragment, useMemo } from "react";
import { Keycap } from "./keycaps";

// 连接符样式:字号约为主键一半、半透明,随键帽一起进出场
const separatorStyle = (textSize: number) => ({
  fontSize: textSize * 0.5,
});

const separatorVariants: Variants = {
  visible: { opacity: 0.55, transition: { duration: 0.15, ease: easeOutQuint } },
  hidden: { opacity: 0, transition: { duration: 0.1, ease: easeInQuint } },
};

export const KeyOverlay = () => {
  const pressedKeys = useEventStore((state) => state.pressedKeys);
  const groups = useEventStore((state) => state.groups);
  const showHistory = useEventStore((state) => state.showEventHistory);

  const appearance = useStyleStore((state) => state.appearance);
  const text = useStyleStore((state) => state.text);
  const border = useStyleStore((state) => state.border);
  const background = useStyleStore((state) => state.background);

  // column 主轴下 justifyContent/alignItems 角色互换,用对应的映射表
  const alignment =
    (appearance.flexDirection === "column" ? alignmentForColumn : alignmentForRow)[appearance.alignment];

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
    columnGap: appearance.style === "minimal" ? text.size * 0.15 : text.size * 0.3,
    ...(background.enabled && {
      paddingInline: text.size * 0.4,
      paddingBlock: appearance.style === "minimal" ? text.size * 0.25 : text.size * 0.4,
      background: background.color,
      borderRadius: border.radius * (text.size * 1.75),
    }),
  };

  // 组进出场:进入 easeOut 淡入,退出 easeIn 淡出且时长 ×0.7 更利落。
  // custom 参数为深度(0=最新组):旧组按深度衰减透明度/缩放,形成层次;
  // 组内子元素带轻微 stagger,连按有层叠节奏。
  const groupVariants = useMemo<Variants>(() => ({
    visible: (depth: number) => ({
      opacity: Math.max(0.4, 1 - depth * 0.18),
      scale: Math.max(0.94, 1 - depth * 0.02),
      transition: {
        duration: showHistory ? appearance.animationDuration : 0,
        ease: easeOutQuint,
        staggerChildren: 0.025,
      },
    }),
    hidden: () => ({
      opacity: 0,
      transition: { duration: showHistory ? appearance.animationDuration * 0.7 : 0, ease: easeInQuint },
    }),
  }), [showHistory, appearance.animationDuration]);

  // 键帽进出场:进入用 spring 带轻微回弹,退出用 easeIn 快速收尾。
  // zoom 起点 0.6 避免从零放大的闪烁。
  const keyVariants = useMemo<Variants>(() => {
    const enter = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.9 };
    const exit = { duration: appearance.animationDuration * 0.7, ease: easeInQuint };
    switch (appearance.animation) {
      case "none":
        return { visible: {}, hidden: {} };
      case "fade":
        return {
          visible: { opacity: 1, transition: { duration: appearance.animationDuration, ease: easeOutQuint } },
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

  const renderSeparator = (keyIndex: number, groupKeyCount: number) =>
    keyIndex > 0 && groupKeyCount > 1;

  const renderGroups = (animated: boolean) =>
    groups.map((group, groupIndex) => {
      const depth = groups.length - 1 - groupIndex;
      const content = group.keys.map((event, keyIndex) => (
        <Fragment key={event.name}>
          {renderSeparator(keyIndex, group.keys.length) && (
            animated ? (
              <motion.span
                className="self-center select-none"
                style={{ ...separatorStyle(text.size), color: text.color }}
                variants={separatorVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                +
              </motion.span>
            ) : (
              <span
                className="self-center select-none"
                style={{ ...separatorStyle(text.size), color: text.color, opacity: 0.55 }}
              >
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
              transition={{ layout: { duration: appearance.animationDuration / 3, ease: easeOutQuint } }}
            >
              <Keycap
                event={event}
                lastest={group.keys.length - 1 === keyIndex}
                isPressed={groups.length - 1 === groupIndex && event.in(pressedKeys)}
              />
            </motion.div>
          ) : (
            <Keycap
              event={event}
              lastest={group.keys.length - 1 === keyIndex}
              isPressed={groups.length - 1 === groupIndex && event.in(pressedKeys)}
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
};
