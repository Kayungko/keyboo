import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { easeOutQuint } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MouseIndicator } from "./MouseIndicator";

// 鼠标反馈覆盖层:点击圆环、释放涟漪、按键状态指示器

const MIN_CLICK_DISPLAY_MS = 200;
const RIPPLE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface Ripple {
  id: number;
  button: string | null;
}

export function MouseOverlay() {
  const pressedButton = useEventStore((s) => s.pressedMouseButton);
  const wheel = useEventStore((s) => s.mouse.wheel);
  const style = useStyleStore((s) => s.mouse);
  const animationDuration = useStyleStore((s) => s.appearance.animationDuration);

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
      if (style.showClicks) {
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
  }, [pressedButton, show, style.showClicks]);

  // 订阅鼠标坐标,直写 DOM transform,避免高频 React 重渲染
  useEffect(() => {
    if (!positionRef.current) return;
    const unsubscribe = useEventStore.subscribe((state, prev) => {
      const el = positionRef.current;
      if (!el) return;
      if (state.mouse.x === prev.mouse.x && state.mouse.y === prev.mouse.y) return;
      const shouldFollow =
        style.keepHighlight || state.pressedMouseButton || style.showIndicator || style.keepIndicator;
      if (!shouldFollow) return;
      const dpr = window.devicePixelRatio || 1;
      el.style.transform = `translate3d(${state.mouse.x / dpr}px, ${state.mouse.y / dpr}px, 0) translate(-50%, -50%)`;
    });
    return () => unsubscribe();
  }, [style.keepHighlight, style.showIndicator]);

  const shouldRender = style.showClicks || style.keepHighlight || style.showIndicator;
  if (!shouldRender) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      <div
        ref={positionRef}
        className="absolute top-0 left-0 will-change-transform"
        style={{ width: style.size, height: style.size }}
      >
        {style.showClicks && (
          <>
            {/* 主圆环:按下快速咬合收缩,释放平滑回位;右键虚线区分 */}
            <motion.div
              className="w-full h-full"
              initial={false}
              animate={{
                opacity: show || style.keepHighlight ? 1 : 0,
                scale: show ? 0.55 : 1,
              }}
              style={{
                borderColor: style.color,
                borderStyle: pressedButton === "Right" ? "dashed" : "solid",
                borderWidth: style.size / 22,
                borderRadius: "50%",
              }}
              transition={
                show
                  ? { duration: 0.12, ease: easeOutQuint }
                  : { duration: animationDuration, ease: easeOutQuint }
              }
            />
            {/* 释放涟漪:从咬合尺寸向外扩散淡出 */}
            <AnimatePresence>
              {ripples.map((ripple) => (
                <motion.div
                  key={ripple.id}
                  className="absolute inset-0"
                  initial={{ scale: 0.55, opacity: 0.9, borderWidth: style.size / 22 }}
                  animate={{ scale: 1.3, opacity: 0, borderWidth: style.size / 44 }}
                  transition={{ duration: 0.35, ease: RIPPLE_EASE }}
                  onAnimationComplete={() => setRipples((rs) => rs.filter((r) => r.id !== ripple.id))}
                  style={{
                    borderColor: style.color,
                    borderStyle: ripple.button === "Right" ? "dashed" : "solid",
                    borderRadius: "50%",
                  }}
                />
              ))}
            </AnimatePresence>
          </>
        )}

        {style.showIndicator && (
          <motion.div
            className="absolute left-1/2 top-1/2"
            animate={{ opacity: show || style.keepIndicator || wheel !== 0 ? 1 : 0 }}
            transition={{ duration: animationDuration }}
          >
            <MouseIndicator />
          </motion.div>
        )}
      </div>
    </div>
  );
}
