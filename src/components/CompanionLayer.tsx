// 打字伙伴覆盖层:角色形象 + 等级称号 + 敲键冒 +1 + 点击气泡统计 + 待机小动作
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
// 软体 Q 弹:拖动时切皮肤渲染器(SkinProps 协议,物理核心 SoftBodyField 共用),
// 对拖拽点附近施加高斯衰减位移(限幅+面积守恒),只让按住的那一块局部拉伸;
// 松手 spring 回弹后切回静止帧。
//
// 待机动画:停止打字一段时间后,随机调度器挂 CSS 动画类(见 app.css)——
// 全身动作(摇摆/蹦跳/呼吸)所有形象通用;局部动作(张望/耳朵抖动)仅汤圆
// (SVG 静止帧有动画钩子,道童与自定义图片没有)。眨眼独立随机触发,随时可能发生。

import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CHARACTERS } from "@/lib/companion/presets";
import { type PullInfo, type SkinProps } from "@/lib/softbody/core";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState, type AnimationEvent, type ComponentType } from "react";
import daotongUrl from "@/assets/daotong.svg";
import { BlobSvg } from "./BlobSvg";
import { DaotongSvg } from "./DaotongSvg";
import { useEventStore } from "@/stores/useEventStore";
import { charsOf, levelOf, profileOf, titleOf, todayCharsOf, useCompanionStore, type SkinId } from "@/stores/useCompanionStore";
import { SoftBody } from "./SoftBody";
import { SoftBody3D } from "./SoftBody3D";

// 皮肤注册表:不同渲染实现(2D 网格 Warp / 3D 球体软体)共用同一套
// 物理核心(SoftBodyField)与交互协议(SkinProps),后期加新皮肤在此注册即可。
// daotong = 道童(内置 SVG,走 2D 网格 Warp);custom = 自定义图片,同走 2D 网格 Warp
const SKINS: Record<SkinId, ComponentType<SkinProps>> = {
  blob: SoftBody,
  blob3d: SoftBody3D,
  daotong: SoftBody,
  custom: SoftBody,
};

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
// 松手后软体回弹稳定再切回静止帧的延迟:由阻尼推导(欠阻尼包络 e^{-(d/2)t} 衰减到 5% ≈ 6/d 秒),
// 阻尼越小振荡越久;夹在 [600,1600]ms
const settleMsOf = (damping: number) => Math.min(1600, Math.max(600, Math.round(6000 / Math.max(1, damping))));

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── 待机动画池 ───
type IdleAnim =
  | "companion-idle-sway"
  | "companion-idle-bounce"
  | "companion-idle-breath"
  | "companion-idle-look-left"
  | "companion-idle-look-right"
  | "companion-idle-ear";

// 全身动作所有形象通用;张望/耳朵抖动依赖汤圆 SVG 的动画钩子(道童/自定义图片没有)
const IDLE_ALL: IdleAnim[] = ["companion-idle-sway", "companion-idle-bounce", "companion-idle-breath"];
const IDLE_BLOB_EXTRA: IdleAnim[] = ["companion-idle-look-left", "companion-idle-look-right", "companion-idle-ear"];

const pickIdle = (skin: SkinId): IdleAnim => {
  const pool = skin === "blob" || skin === "blob3d" ? [...IDLE_ALL, ...IDLE_BLOB_EXTRA] : IDLE_ALL;
  return pool[Math.floor(Math.random() * pool.length)];
};

/** 无操作多久后允许播放待机动画 */
const IDLE_AFTER_MS = 6000;

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
  const [idleAnim, setIdleAnim] = useState<IdleAnim | null>(null);
  const [blinking, setBlinking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const localPosRef = useRef<[number, number] | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const lastKeyAtRef = useRef(performance.now());
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
        // 软体拉拽松手:回弹,稳定后切回静止帧
        setPull(null);
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
        const damping = useCompanionStore.getState().config.physicsParams.damping;
        settleTimerRef.current = window.setTimeout(() => setWarping(false), settleMsOf(damping));
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
          setIdleAnim(null);
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
      setIdleAnim(null);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      unsubscribe();
      window.removeEventListener("blur", onBlur);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  // 敲键:反馈按角色性格区分(首帧跳过;池上限 5 防堆积);打断待机动画
  //   汤圆 = 软萌 Q 弹压缩(幅度收小,连击不抖);道童 = 灵气轻托(轻微上浮,含蓄不违和)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (charPulse === 0) return;
    lastKeyAtRef.current = performance.now();
    setIdleAnim(null);
    const daotong = config.skin === "daotong";
    void controls.start(
      daotong
        ? { y: [0, -3, 0], scale: 1, rotate: 0, transition: { duration: 0.24, ease: "easeOut" } }
        : { scale: [1, 0.94, 1.03, 1], rotate: 0, transition: { duration: 0.18, ease: "easeOut" } },
    );
    setFloats((fs) => [...fs.slice(-4), { id: charPulse }]);
  }, [charPulse, controls, config.skin]);

  // 升级:大弹跳 + 摇摆
  useEffect(() => {
    if (levelUpPulse === 0) return;
    setIdleAnim(null);
    void controls.start({
      scale: [1, 1.25, 0.92, 1.08, 1],
      rotate: [0, -5, 5, 0],
      transition: { duration: 0.7, ease: "easeOut" },
    });
  }, [levelUpPulse]);

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

  // 眨眼:随机间隔一次性触发(自然感;固定周期会显得机械)
  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        schedule(2200 + Math.random() * 3600);
      }, delay);
    };
    schedule(1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // 待机调度:停止打字 IDLE_AFTER_MS 后,每 3.5~8s 随机播一个动作(拖拽中不播)
  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const idleMs = performance.now() - lastKeyAtRef.current;
        if (idleMs > IDLE_AFTER_MS && !dragRef.current) {
          const skin = useCompanionStore.getState().config.skin;
          // 道童走常驻打坐态(吐纳+浮空+灵光),不参与随机待机小动作
          if (skin !== "daotong") setIdleAnim(pickIdle(skin));
        }
        schedule(3500 + Math.random() * 4500);
      }, delay);
    };
    schedule(4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // CSS 动画结束(含 SVG 子元素冒泡上来的眨眼/张望/耳朵):清掉状态类,
  // 否则同类动画无法再次触发
  const onBodyAnimEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === "companion-blink-once") setBlinking(false);
    else if (e.animationName.startsWith("companion-")) setIdleAnim(null);
  };

  if (!config.enabled) return null;

  const character = CHARACTERS[config.character];
  const profile = profileOf(config);
  const level = levelOf(charsOf(stats, config.character), profile);
  const title = titleOf(level, profile.levels);
  const Skin = SKINS[config.skin] ?? SoftBody;
  // 形象纹理源:自定义图片(asset protocol)/ 道童(打包 SVG);汤圆无纹理源(BlobSvg/BODY_SVG 渲染)
  const skinUrl =
    config.skin === "custom" && config.customSkinFile
      ? convertFileSrc(config.customSkinFile)
      : config.skin === "daotong"
        ? daotongUrl
        : null;

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
      <div className="relative w-full">
        {/* 等级称号:绝对定位锚在头顶上方——调整间距只移动称号,不推挤伙伴本体;
            z-20 保证负间距叠到本体上时称号仍在角色之上可读 */}
        {config.showLevel && (
          <div
            className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white"
            style={{
              textShadow: "0 1px 3px rgba(0,0,0,0.85)",
              bottom: "100%",
              marginBottom: config.levelOffsetY,
            }}
          >
            Lv.{level} {title}
          </div>
        )}
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
                {character.floatText}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 角色:静止帧(SVG/自定义图片,待机动画类挂在包裹层)+ 拖拽时切皮肤渲染器。
            阴影在容器(各皮肤共用) */}
        <motion.div
          animate={controls}
          className="relative w-full"
          style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
        >
          <div
            className={cn(
              config.skin === "daotong" ? "companion-daotong-idle" : idleAnim,
              blinking && "companion-blinking",
            )}
            onAnimationEnd={onBodyAnimEnd}
            style={{ opacity: warping ? 0 : 1, transition: "opacity 0.08s" }}
          >
            {config.skin === "daotong" ? (
              <DaotongSvg />
            ) : skinUrl ? (
              <div className="aspect-square w-full">
                <img
                  src={skinUrl}
                  alt={profile.name}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              </div>
            ) : (
              <BlobSvg />
            )}
          </div>
          <Skin
            size={config.size}
            pull={pull}
            params={config.physicsParams}
            visible={warping}
            asset={skinUrl ?? undefined}
          />
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
                {profile.name} · Lv.{level} {title}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/70">今日按键</span>
                  <span className="font-mono">{stats.todayKeys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">今日{character.unit}</span>
                  <span className="font-mono">{todayCharsOf(stats, config.character)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">总按键</span>
                  <span className="font-mono">{stats.totalKeys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">总{character.unit}</span>
                  <span className="font-mono">{charsOf(stats, config.character)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
