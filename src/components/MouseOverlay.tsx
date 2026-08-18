// 鼠标反馈覆盖层:点击圆环、释放涟漪、按键状态指示器

import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const MIN_CLICK_DISPLAY_MS = 180;

// ─── 指示器图标(鼠标造型,圆角矩形 + 按键分区) ───

function MouseIcon({ highlight, wheel }: { highlight?: "left" | "right" | "middle"; wheel?: "up" | "down" }) {
  const accent = "#7dff9b";
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 34" fill="none">
      <rect x="3.2" y="2.2" width="17.6" height="29.6" rx="8.8" stroke="white" strokeWidth="2.4" />
      <line x1="3.2" y1="13.5" x2="20.8" y2="13.5" stroke="white" strokeWidth="2.4" />
      <line x1="12" y1="2.2" x2="12" y2="13.5" stroke="white" strokeWidth="2.4" />
      {highlight === "left" && <path d="M11 3.4 L7.8 3.4 Q4.4 3.8 4.4 8.4 L4.4 12.3 L11 12.3 Z" fill={accent} />}
      {highlight === "right" && <path d="M13 3.4 L16.2 3.4 Q19.6 3.8 19.6 8.4 L19.6 12.3 L13 12.3 Z" fill={accent} />}
      {highlight === "middle" && <rect x="9.8" y="4.6" width="4.4" height="7" rx="2.2" fill={accent} />}
      {wheel === "up" && (
        <g stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20.5" x2="12" y2="27" />
          <polyline points="8.8,23.5 12,20.3 15.2,23.5" />
        </g>
      )}
      {wheel === "down" && (
        <g stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="26.5" />
          <polyline points="8.8,23.5 12,26.7 15.2,23.5" />
        </g>
      )}
    </svg>
  );
}

interface Ripple {
  id: number;
  button: string | null;
}

export function MouseOverlay() {
  const pressedButton = useEventStore((s) => s.mouse.pressedButton);
  const wheel = useEventStore((s) => s.mouse.wheel);
  const mouse = useStyleStore((s) => s.mouse);

  const [show, setShow] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const positionRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const pressAtRef = useRef<number | null>(null);
  const lastButtonRef = useRef<string | null>(null);

  // 按下立即显示;释放时补发涟漪,并保证圆环至少显示 MIN_CLICK_DISPLAY_MS
  useEffect(() => {
    if (pressedButton) {
      setShow(true);
      pressAtRef.current = Date.now();
      lastButtonRef.current = pressedButton;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (show && pressAtRef.current) {
      if (mouse.showClicks) {
        setRipples((rs) => [...rs, { id: Date.now() + Math.random(), button: lastButtonRef.current }]);
      }
      const elapsed = Date.now() - pressAtRef.current;
      if (elapsed >= MIN_CLICK_DISPLAY_MS) {
        setShow(false);
        pressAtRef.current = null;
      } else {
        timeoutRef.current = window.setTimeout(() => {
          setShow(false);
          pressAtRef.current = null;
          timeoutRef.current = null;
        }, MIN_CLICK_DISPLAY_MS - elapsed);
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pressedButton, show, mouse.showClicks]);

  // 订阅鼠标坐标,直写 DOM transform,避免高频 React 重渲染
  useEffect(() => {
    if (!positionRef.current) return;
    const unsubscribe = useEventStore.subscribe((state, prev) => {
      const el = positionRef.current;
      if (!el) return;
      if (state.mouse.x === prev.mouse.x && state.mouse.y === prev.mouse.y) return;
      const shouldFollow = mouse.keepHighlight || state.mouse.pressedButton || mouse.showIndicator;
      if (!shouldFollow) return;
      const dpr = window.devicePixelRatio || 1;
      el.style.transform = `translate3d(${state.mouse.x / dpr}px, ${state.mouse.y / dpr}px, 0) translate(-50%, -50%)`;
    });
    return () => unsubscribe();
  }, [mouse.keepHighlight, mouse.showIndicator]);

  const shouldRender = mouse.showClicks || mouse.keepHighlight || mouse.showIndicator;
  if (!shouldRender) return null;

  const iconState = pressedButton === "Left" ? "left"
    : pressedButton === "Right" ? "right"
      : pressedButton === "Middle" ? "middle"
        : wheel > 0 ? "scrollUp"
          : wheel < 0 ? "scrollDown"
            : "default";

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      <div
        ref={positionRef}
        className="absolute top-0 left-0 will-change-transform"
        style={{ width: mouse.size, height: mouse.size }}
      >
        {mouse.showClicks && (
          <>
            {/* 主圆环:按下快速咬合收缩,释放平滑回位;右键虚线区分 */}
            <motion.div
              className="w-full h-full"
              initial={false}
              animate={{
                opacity: show || mouse.keepHighlight ? 1 : 0,
                scale: show ? 0.55 : 1,
              }}
              style={{
                borderColor: mouse.color,
                borderStyle: pressedButton === "Right" ? "dashed" : "solid",
                borderWidth: mouse.size / 22,
                borderRadius: "50%",
              }}
              transition={{
                duration: show ? 0.12 : 0.25,
                ease: EASE_OUT,
              }}
            />
            {/* 释放涟漪:从咬合尺寸向外扩散淡出 */}
            <AnimatePresence>
              {ripples.map((ripple) => (
                <motion.div
                  key={ripple.id}
                  className="absolute inset-0"
                  initial={{ scale: 0.55, opacity: 0.9, borderWidth: mouse.size / 22 }}
                  animate={{ scale: 1.3, opacity: 0, borderWidth: mouse.size / 44 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  onAnimationComplete={() => setRipples((rs) => rs.filter((r) => r.id !== ripple.id))}
                  style={{
                    borderColor: mouse.color,
                    borderStyle: ripple.button === "Right" ? "dashed" : "solid",
                    borderRadius: "50%",
                  }}
                />
              ))}
            </AnimatePresence>
          </>
        )}

        {mouse.showIndicator && (
          <motion.div
            className="absolute"
            style={{ left: "50%", top: "50%", marginTop: mouse.offsetY, marginLeft: mouse.offsetX }}
            animate={{ opacity: show || wheel !== 0 ? 1 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="rounded-[45%] bg-black/55"
              style={{
                width: mouse.indicatorSize * 0.85,
                height: mouse.indicatorSize,
                padding: mouse.indicatorSize * 0.18,
              }}
            >
              {/* 图标状态切换:退出下移淡出、进入自上落位 */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={iconState}
                  className="w-full h-full"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: wheel !== 0 ? (wheel > 0 ? -3 : 3) : 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{
                    opacity: { duration: 0.12, ease: EASE_OUT },
                    y: { type: "spring", stiffness: 600, damping: 28 },
                  }}
                >
                  <MouseIcon
                    highlight={iconState === "left" || iconState === "right" || iconState === "middle" ? iconState : undefined}
                    wheel={iconState === "scrollUp" ? "up" : iconState === "scrollDown" ? "down" : undefined}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
