// 打字伙伴覆盖层:黑白小团子 + 等级称号 + 敲键冒 +1 + 点击气泡统计 + 拖拽
//
// 交互前提:覆盖层默认全屏点击穿透(set_ignore_cursor_events(true)),
// 鼠标悬停伙伴时前端调用 set_cursor_passthrough(false) 局部恢复点击;
// 拖拽进行中强制保持恢复(光标可能移出伙伴矩形),释放后按光标位置重新判定。
// 拖拽中高频位置只存本地 state,释放时才写 store(持久化 + 双窗口同步)。

import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { levelOf, titleOf, useCompanionStore } from "@/stores/useCompanionStore";

interface FloatOne {
  id: number;
}

interface DragState {
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function CompanionLayer() {
  const config = useCompanionStore((s) => s.config);
  const stats = useCompanionStore((s) => s.stats);
  const charPulse = useCompanionStore((s) => s.charPulse);
  const levelUpPulse = useCompanionStore((s) => s.levelUpPulse);

  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [floats, setFloats] = useState<FloatOne[]>([]);
  const [dragging, setDragging] = useState(false);
  const [localPos, setLocalPos] = useState<[number, number] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const localPosRef = useRef<[number, number] | null>(null);
  const controls = useAnimationControls();
  const mountedRef = useRef(false);

  const setPos = (p: [number, number] | null) => {
    localPosRef.current = p;
    setLocalPos(p);
  };

  const pos = dragging && localPos ? localPos : config.pos;

  // 点击穿透翻转 + 拖拽跟随:覆盖层实时收到鼠标坐标(钩子事件不受穿透影响)
  useEffect(() => {
    if (!config.enabled) {
      void invoke("set_cursor_passthrough", { ignore: true });
      return;
    }
    let ignored = true;
    const setIgnore = (value: boolean) => {
      if (value === ignored) return;
      ignored = value;
      void invoke("set_cursor_passthrough", { ignore: value });
    };

    const unsubscribe = useEventStore.subscribe((state, prev) => {
      if (state.mouse.x === prev.mouse.x && state.mouse.y === prev.mouse.y) return;
      const dpr = window.devicePixelRatio || 1;
      const x = state.mouse.x / dpr;
      const y = state.mouse.y / dpr;

      // 拖拽中:跟随光标,且强制保持可点击(不恢复穿透)
      const drag = dragRef.current;
      if (drag) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!drag.moved) {
          drag.moved = true;
          setDragging(true);
        }
        const el = rootRef.current;
        setPos([
          clamp(drag.originLeft + dx, 0, window.innerWidth - (el?.offsetWidth ?? 0)),
          clamp(drag.originTop + dy, 0, window.innerHeight - (el?.offsetHeight ?? 0)),
        ]);
        setIgnore(false);
        return;
      }

      // 常规翻转:进入伙伴矩形恢复点击,离开恢复全屏穿透
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setIgnore(!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));
    });

    // 释放:拖拽过则提交位置(持久化+同步),否则视为点击弹气泡
    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setDragging(false);
      if (drag.moved) {
        const p = localPosRef.current;
        setPos(null);
        if (p) useCompanionStore.getState().setConfig({ pos: p });
      } else {
        setBubbleOpen((o) => !o);
      }
    };

    // 失焦兜底:mouseup 可能丢失(如 Alt+Tab),放弃本次拖拽
    const onBlur = () => {
      dragRef.current = null;
      setDragging(false);
      setPos(null);
      setIgnore(true);
    };

    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    return () => {
      unsubscribe();
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      void invoke("set_cursor_passthrough", { ignore: true });
    };
  }, [config.enabled]);

  // 敲键:压缩弹跳 + 冒 +1(首帧跳过;池上限 5 防堆积)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (charPulse === 0) return;
    void controls.start({
      scale: [1, 0.88, 1.06, 1],
      transition: { duration: 0.22, ease: "easeOut" },
    });
    setFloats((fs) => [...fs.slice(-4), { id: charPulse }]);
  }, [charPulse, controls]);

  // 升级:大弹跳 + 摇摆
  useEffect(() => {
    if (levelUpPulse === 0) return;
    void controls.start({
      scale: [1, 1.25, 0.92, 1.08, 1],
      rotate: [0, -5, 5, 0],
      transition: { duration: 0.7, ease: "easeOut" },
    });
  }, [levelUpPulse, controls]);

  // 点击气泡:4s 自动关闭 + 点外部关闭
  useEffect(() => {
    if (!bubbleOpen) return;
    const timer = window.setTimeout(() => setBubbleOpen(false), 4000);
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setBubbleOpen(false);
      }
    };
    window.addEventListener("click", onClickOutside);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", onClickOutside);
    };
  }, [bubbleOpen]);

  if (!config.enabled) return null;

  const level = levelOf(stats.totalChars);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = useEventStore.getState().mouse;
    const dpr = window.devicePixelRatio || 1;
    dragRef.current = {
      startX: m.x / dpr,
      startY: m.y / dpr,
      originLeft: r.left,
      originTop: r.top,
      moved: false,
    };
  };

  return (
    <div
      ref={rootRef}
      onMouseDown={onMouseDown}
      className={cn(
        "absolute flex flex-col items-center select-none",
        !pos && "bottom-8 right-8",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ width: config.size, ...(pos ? { left: pos[0], top: pos[1] } : {}) }}
    >
      {/* 等级称号 */}
      {config.showLevel && (
        <div
          className="mb-1 whitespace-nowrap text-xs font-medium text-white"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
        >
          Lv.{level} {titleOf(level)}
        </div>
      )}

      <div className="relative w-full">
        {/* +1 气泡 */}
        <div className="pointer-events-none absolute -top-3 left-1/2 z-10 h-0">
          <AnimatePresence>
            {floats.map((f) => (
              <motion.div
                key={f.id}
                className="absolute left-0 text-sm font-bold text-white"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
                initial={{ opacity: 0, y: 0, x: "-50%", scale: 0.7 }}
                animate={{ opacity: [0, 1, 0], y: -36, x: "-50%", scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => setFloats((fs) => fs.filter((x) => x.id !== f.id))}
              >
                +1
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 黑白小团子 */}
        <motion.div animate={controls}>
          <BlobSvg />
        </motion.div>

        {/* 点击气泡:统计 */}
        <AnimatePresence>
          {bubbleOpen && (
            <motion.div
              className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-xl bg-black/80 p-3 text-white backdrop-blur-sm"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <div className="mb-2 text-xs font-semibold text-white/70">
                Lv.{level} {titleOf(level)}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/70">今日按键</span>
                  <span className="font-mono">{stats.todayKeys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">今日字数</span>
                  <span className="font-mono">{stats.todayChars}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">总按键</span>
                  <span className="font-mono">{stats.totalKeys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">总字数</span>
                  <span className="font-mono">{stats.totalChars}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// 黑白小团子:白色圆身 + 黑点眼睛(CSS 眨眼) + 微笑
function BlobSvg() {
  return (
    <svg
      viewBox="0 0 100 96"
      className="block w-full"
      style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
    >
      <path
        d="M50 4 C76 4 94 26 94 54 C94 80 75 92 50 92 C25 92 6 80 6 54 C6 26 24 4 50 4 Z"
        fill="#fafafa"
      />
      <circle className="companion-eye" cx="36" cy="50" r="5.5" fill="#141414" />
      <circle className="companion-eye" cx="64" cy="50" r="5.5" fill="#141414" />
      <path
        d="M42 66 Q50 73 58 66"
        stroke="#141414"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
