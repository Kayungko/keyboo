// 打字伙伴覆盖层:黑白熊猫汤圆 + 等级称号 + 敲键冒 +1 + 点击气泡统计
// 交互:
//   - 左键点击(<4px):切换统计气泡
//   - 左键按住拖动:软体 Q 弹拉拽(按住的那一块局部拉伸,松手 overshoot 回弹,physics 开关控制)
//   - 右键按住拖动:移动位置(持久化)
//
// 关键架构:覆盖层窗口**始终**全屏点击穿透(set_ignore_cursor_events(true)),
// 伙伴交互不依赖窗口接收鼠标事件(那需要临时关闭穿透,远程桌面下会触发
// 窗口边框重绘、出现"非全屏范围框")。而是监听全局钩子经 Rust 转发来的
// 鼠标坐标 + 按键状态,在前端自行判定点击/拖拽/拉拽。
//
// 软体 Q 弹:拖动时切到 SoftBody(Canvas 网格纹理映射),对拖拽点附近顶点
// 施加高斯衰减位移,只让按住的那一块局部拉伸;松手 spring 回弹后切回 SVG。

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { levelOf, titleOf, useCompanionStore } from "@/stores/useCompanionStore";
import { SoftBody, type PullInfo } from "./SoftBody";

interface FloatOne {
  id: number;
}

type DragMode = "move" | "pull";

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  localX: number;
  localY: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 4;
// 松手后软体回弹稳定再切回 SVG 的延迟
const SETTLE_MS = 500;

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
  const [pull, setPull] = useState<PullInfo | null>(null);
  const [warping, setWarping] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const localPosRef = useRef<[number, number] | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const controls = useAnimationControls();
  const mountedRef = useRef(false);

  const setPos = (p: [number, number] | null) => {
    localPosRef.current = p;
    setLocalPos(p);
  };

  const pos = dragging && localPos ? localPos : config.pos;

  // 伙伴交互:监听全局钩子转发的鼠标坐标 + 按键状态,自行判定。
  useEffect(() => {
    const beginDrag = (button: string) => {
      const el = rootRef.current;
      if (!el) return;
      const m = useEventStore.getState().mouse;
      const dpr = window.devicePixelRatio || 1;
      const x = m.x / dpr;
      const y = m.y / dpr;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
      const physics = useCompanionStore.getState().config.physics;
      const mode: DragMode = button === "Right" || !physics ? "move" : "pull";
      const localX = r.width > 0 ? (x - r.left) / r.width : 0.5;
      const localY = r.height > 0 ? (y - r.top) / r.height : 0.5;
      dragRef.current = {
        mode,
        startX: x,
        startY: y,
        originLeft: r.left,
        originTop: r.top,
        localX,
        localY,
        moved: false,
      };
    };

    const endDrag = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setDragging(false);
      if (drag.mode === "move") {
        if (drag.moved) {
          const p = localPosRef.current;
          setPos(null);
          if (p) useCompanionStore.getState().setConfig({ pos: p });
        }
      } else {
        // 软体拉拽松手:回弹,稳定后切回 SVG
        setPull(null);
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => setWarping(false), SETTLE_MS);
        if (!drag.moved) setBubbleOpen((o) => !o);
      }
    };

    const unsubscribe = useEventStore.subscribe((state, prev) => {
      const dpr = window.devicePixelRatio || 1;

      // 1. 检测按下 / 松开
      const pressedNow = state.pressedMouseButtons.filter((b) => !prev.pressedMouseButtons.includes(b));
      const releasedNow = prev.pressedMouseButtons.filter((b) => !state.pressedMouseButtons.includes(b));
      if (pressedNow.length > 0 && !dragRef.current) {
        beginDrag(pressedNow[pressedNow.length - 1]);
      }
      if (releasedNow.length > 0 && dragRef.current) {
        endDrag();
      }

      // 2. 拖拽/拉拽跟随
      if (state.mouse.x === prev.mouse.x && state.mouse.y === prev.mouse.y) return;
      const drag = dragRef.current;
      if (!drag) return;
      const x = state.mouse.x / dpr;
      const y = state.mouse.y / dpr;
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
        if (drag.mode === "pull") {
          setWarping(true);
          if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
        }
      }
      if (drag.mode === "move") {
        const el = rootRef.current;
        setPos([
          clamp(drag.originLeft + dx, 0, window.innerWidth - (el?.offsetWidth ?? 0)),
          clamp(drag.originTop + dy, 0, window.innerHeight - (el?.offsetHeight ?? 0)),
        ]);
      } else {
        setPull({ localX: drag.localX, localY: drag.localY, offsetX: dx, offsetY: dy });
      }
    });

    const onBlur = () => {
      dragRef.current = null;
      setDragging(false);
      setPos(null);
      setPull(null);
      setWarping(false);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      unsubscribe();
      window.removeEventListener("blur", onBlur);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

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

  return (
    <div
      ref={rootRef}
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

        {/* 熊猫汤圆:阴影在容器(两套渲染共用),静止用 SVG(带眨眼),
            拖拽/回弹用 SoftBody 网格变形 */}
        <motion.div
          animate={controls}
          className="relative w-full"
          style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
        >
          <div style={{ opacity: warping ? 0 : 1, transition: "opacity 0.08s" }}>
            <BlobSvg />
          </div>
          <SoftBody size={config.size} pull={pull} visible={warping} />
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

// 黑白熊猫汤圆(用户提供的设计稿,去背景;眼斑保留眨眼动画)
function BlobSvg() {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className="block w-full"
      role="img"
      aria-label="键啵"
    >
      {/* 耳朵 */}
      <ellipse cx="329" cy="324" rx="83" ry="67" fill="#1D1D1D" transform="rotate(-22 329 324)" />
      <ellipse cx="684" cy="318" rx="83" ry="67" fill="#1D1D1D" transform="rotate(22 684 318)" />
      {/* 汤圆身体 */}
      <path
        d="M512 256 C672 256 785 374 785 531 C785 683 673 767 508 767 C347 767 239 680 239 531 C239 377 351 256 512 256Z"
        fill="#FFFDF7"
      />
      {/* 扁平高光 */}
      <path
        d="M340 402C385 313 484 286 568 305C468 318 390 360 340 443Z"
        fill="#FFFFFF"
        opacity=".85"
      />
      {/* 熊猫眼斑:外层 g 承担旋转,CSS 眨眼动画作用于内层椭圆避免 transform 覆盖 */}
      <g transform="rotate(25 407 490)">
        <ellipse className="companion-eye" cx="407" cy="490" rx="68" ry="91" fill="#1D1D1D" />
      </g>
      <g transform="rotate(-25 617 490)">
        <ellipse className="companion-eye" cx="617" cy="490" rx="68" ry="91" fill="#1D1D1D" />
      </g>
      {/* 嘴 */}
      <ellipse cx="512" cy="585" rx="39" ry="31" fill="#1D1D1D" transform="rotate(-8 512 585)" />
    </svg>
  );
}
