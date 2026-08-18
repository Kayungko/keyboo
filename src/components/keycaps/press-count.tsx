import { useStyleStore } from "@/stores/useStyleStore";
import { motion } from "motion/react";

// 徽标放在键帽内侧角落,避免背景开启 + 大圆角时被 overflow-hidden 裁剪
export const PressCount = ({ count }: { count: number }) => {
  const text = useStyleStore((state) => state.text);
  const color = useStyleStore((state) => state.color.color);
  const borderRadius = useStyleStore((state) => state.border.radius);
  const appearance = useStyleStore((state) => state.appearance);

  const style = {
    top: "5%",
    right: "5%",
    width: text.size * 0.75,
    height: text.size * 0.75,
    color: color,
    backgroundColor: text.color,
    fontSize: text.size * 0.4,
    borderRadius: `${borderRadius * 100}%`,
  };

  if (appearance.animation === "none") {
    return (
      <div className="absolute z-10 flex items-center justify-center font-bold" style={style}>
        {count}
      </div>
    );
  }

  return (
    <motion.div
      key={count}
      className="absolute z-10 flex items-center justify-center font-bold"
      style={style}
      initial={{ scale: 1.3 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 700, damping: 22 }}
    >
      {count}
    </motion.div>
  );
};
