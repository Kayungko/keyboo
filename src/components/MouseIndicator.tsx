import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { easeOutQuint } from "@/lib/utils";
import { colord } from "colord";
import { AnimatePresence, motion } from "motion/react";

// 鼠标按键状态指示器(鼠标造型图标,按键/滚轮高亮)

function MouseSvg({ highlight, accent }: { highlight?: "left" | "right" | "middle"; accent: string }) {
  return (
    <svg className="w-full h-full" viewBox="0 0 33 43" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 9.5V1.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 41.5C28.5 41.5 31.5 32.48 31.5 21.5C31.5 10.52 28.5 1.5 16.5 1.5C4.49986 1.5 1.5 10.5199 1.5 21.5C1.5 32.48 4.49986 41.5 16.5 41.5Z" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="2.5" y1="13" x2="30.5" y2="13" stroke="white" strokeWidth="2.4" />
      <line x1="16.5" y1="1.5" x2="16.5" y2="13" stroke="white" strokeWidth="2.4" />
      {highlight === "left" && <path d="M15.5 2.6 L9.5 3 Q3.2 4.2 2.8 12 L15.5 12 Z" fill={accent} stroke="none" />}
      {highlight === "right" && <path d="M17.5 2.6 L23.5 3 Q29.8 4.2 30.2 12 L17.5 12 Z" fill={accent} stroke="none" />}
      {highlight === "middle" && <rect x="13.5" y="15" width="6" height="9" rx="3" fill={accent} stroke="none" />}
    </svg>
  );
}

function WheelSvg({ direction, accent }: { direction: "up" | "down"; accent: string }) {
  return (
    <svg className="w-full h-full" viewBox="0 0 33 43" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 41.5C28.5 41.5 31.5 32.48 31.5 21.5C31.5 10.52 28.5 1.5 16.5 1.5C4.49986 1.5 1.5 10.5199 1.5 21.5C1.5 32.48 4.49986 41.5 16.5 41.5Z" stroke="white" strokeWidth="3" />
      <path d="M16.4766 11.1772V21.0173" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      {direction === "up" ? (
        <path d="M12.4922 13.2172C14.4602 11.1772 15.6602 9.37719 16.5722 9.50657C17.3402 9.50019 18.0602 10.6972 20.5082 13.2172" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M20.5082 19.7812C18.5402 21.8212 17.3402 23.6212 16.4282 23.4918C15.6602 23.4982 14.9402 22.3012 12.4922 19.7812" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

export const MouseIndicator = () => {
  const pressedButton = useEventStore((state) => state.pressedMouseButton);
  const wheel = useEventStore((state) => state.mouse.wheel);
  const style = useStyleStore((state) => state.mouse);

  let icon = "default";
  if (pressedButton === "Left") icon = "left";
  else if (pressedButton === "Right") icon = "right";
  else if (pressedButton === "Middle") icon = "middle";
  else if (wheel > 0) icon = "scrollUp";
  else if (wheel < 0) icon = "scrollDown";

  // 强调色由鼠标主题色派生,与整体配色统一
  const accent = colord(style.color).lighten(0.25).toHex();

  const renderIcon = () => {
    switch (icon) {
      case "left": return <MouseSvg highlight="left" accent={accent} />;
      case "right": return <MouseSvg highlight="right" accent={accent} />;
      case "middle": return <MouseSvg highlight="middle" accent={accent} />;
      case "scrollUp": return <WheelSvg direction="up" accent={accent} />;
      case "scrollDown": return <WheelSvg direction="down" accent={accent} />;
      default: return <MouseSvg accent={accent} />;
    }
  };

  // 滚轮方向位移:滚动时图标沿滚动方向轻推一下
  const scrollNudge = wheel > 0 ? -3 : wheel < 0 ? 3 : 0;

  return (
    <div
      className="bg-black/50"
      style={{
        width: style.indicatorSize * 0.92,
        height: style.indicatorSize,
        marginTop: style.indicatorOffsetY,
        marginLeft: style.indicatorOffsetX,
        borderRadius: "45%",
        padding: style.indicatorSize * 0.2,
      }}
    >
      {/* 图标状态切换:退出下移淡出、进入自上落位 */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={icon}
          className="w-full h-full"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: scrollNudge }}
          exit={{ opacity: 0, y: 4 }}
          transition={{
            opacity: { duration: 0.12, ease: easeOutQuint },
            y: { type: "spring", stiffness: 600, damping: 28 },
          }}
        >
          {renderIcon()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
