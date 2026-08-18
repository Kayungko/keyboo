// 打字伙伴覆盖层:黑白熊猫汤圆 + 等级称号 + 敲键冒 +1 + 点击气泡统计
// 交互:
//   - 左键点击(<4px):切换统计气泡
//   - 左键按住拖动:Q 弹拉拽(果冻拉伸 + 松手 overshoot 回弹,physics 开关控制)
//   - 右键按住拖动:移动位置(持久化)
//
// Q 弹物理用 motion 的 spring 引擎(胡克定律+阻尼):useSpring 追踪拉拽偏移,
// 跟手有延迟、松手自然回弹;形变用 useTransform 沿拉拽方向拉伸/垂直压扁。
//
// 点击穿透:覆盖层默认全屏点击穿透,悬停伙伴时 set_cursor_passthrough(false)
// 局部恢复点击;拖拽/拉拽中强制保持恢复,释放后按光标位置重新判定。

import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useEventStore } from "@/stores/useEventStore";
import { levelOf, titleOf, useCompanionStore } from "@/stores/useCompanionStore";

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
  moved: boolean;
}

const DRAG_THRESHOLD = 4;
// Q 弹物理参数:欠阻尼 → 松手有 overshoot 果冻感
const PULL_SPRING = { stiffness: 320, damping: 14, mass: 0.7 };

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

  // Q 弹拉拽:即时偏移(motionValue)+ spring 平滑 + 形变派生
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const springX = useSpring(pullX, PULL_SPRING);
  const springY = useSpring(pullY, PULL_SPRING);
  const rotate = useTransform([springX, springY], (latest: number[]) => {
    const [x, y] = latest;
    return (Math.atan2(y, x) * 180) / Math.PI;
  });
  const stretch = useTransform([springX, springY], (latest: number[]) => {
    const [x, y] = latest;
    return 1 + Math.min(Math.hypot(x, y), 180) * 0.0018;
  });
  const squash = useTransform([springX, springY], (latest: number[]) => {
    const [x, y] = latest;
    return 1 - Math.min(Math.hypot(x, y), 180) * 0.0011;
  });

  const setPos = (p: [number, number] | null) => {
    localPosRef.current = p;
    setLocalPos(p);
  };

  const pos = dragging && localPos ? localPos : config.pos;

  // 点击穿透翻转 + 拖拽/拉拽跟随
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

      const drag = dragRef.current;
      if (drag) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!drag.moved) {
          drag.moved = true;
          setDragging(true);
        }
        setIgnore(false);
        if (drag.mode === "move") {
          // 右键移动:直接跟随光标
          const el = rootRef.current;
          setPos([
            clamp(drag.originLeft + dx, 0, window.innerWidth - (el?.offsetWidth ?? 0)),
            clamp(drag.originTop + dy, 0, window.innerHeight - (el?.offsetHeight ?? 0)),
          ]);
        } else {
          // 左键拉拽:更新 spring 目标,产生跟手延迟 + 回弹
          pullX.set(dx);
          pullY.set(dy);
        }
        return;
      }

      // 常规翻转:进入伙伴矩形恢复点击,离开恢复全屏穿透
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setIgnore(!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));
    });

    const onMouseUp = () => {
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
        // 拉拽松手:回弹到原位
        pullX.set(0);
        pullY.set(0);
        if (!drag.moved) {
          // 未移动 = 点击,切换气泡
          setBubbleOpen((o) => !o);
        }
      }
    };

    const onBlur = () => {
      dragRef.current = null;
      setDragging(false);
      setPos(null);
      pullX.set(0);
      pullY.set(0);
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
  }, [config.enabled, pullX, pullY]);

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
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = useEventStore.getState().mouse;
    const dpr = window.devicePixelRatio || 1;
    // 右键 = 移动位置;左键 = Q 弹拉拽(物理关闭时左键也退化为移动)
    const physics = useCompanionStore.getState().config.physics;
    const mode: DragMode = e.button === 2 || !physics ? "move" : "pull";
    dragRef.current = {
      mode,
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
      onContextMenu={(e) => e.preventDefault()}
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

        {/* 熊猫汤圆:外层 Q 弹偏移,中层方向旋转,内层形变拉伸/压扁 */}
        <motion.div animate={controls} style={{ x: springX, y: springY }}>
          <motion.div style={{ rotate }}>
            <motion.div style={{ scaleX: stretch, scaleY: squash }}>
              <BlobSvg />
            </motion.div>
          </motion.div>
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
      style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
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
