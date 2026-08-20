// AI 额度进度条四形态:EQ 拾音条 / VU 分段条 / 信号灯吊坠 / 信号圆点。
// 视觉定稿自原型 .tmpfiles/quota-bar-prototype/v2.html,样式段在 app.css(quota- 前缀)。
//
// 颜色语义:填充/辉光色严格由「警告级别」决定(健康>50 / 紧张20-50 / 告急<20,
// 三档色可在设置页自定义),**不**用颜色区分 agent;agent 归属只靠位置/顺序,
// 品牌色仅保留在 VU 行首归属小点与点击气泡的小圆点上。
//
// 挂载约束:外层必须绝对定位脱离 rootRef 文档流(文档流子节点会撑大
// getBoundingClientRect,破坏 beginDrag 命中、软体拉伸锚点归一化与拖拽 clamp)。
// 整组 pointer-events-none。offsetX/offsetY 在挂载层内再套一层 translate 实现微调。
//
// 拾音:typingSignal = charPulse(仅覆盖层增长、仅真实字符键 +1),EQ 随机柱顶弹跳 /
// VU 尾段瞬闪 / 圆点 scale 脉冲;timeout 在 cleanup 清理。

import { cn } from "@/lib/utils";
import type { QuotaAppearance } from "@/stores/useQuotaStore";
import { useEffect, useRef, useState } from "react";

export interface QuotaBarItem {
  id: string;
  /** 剩余额度 0-100 */
  pct: number;
  /** 品牌色(仅 VU 归属点 / 气泡使用) */
  color: string;
  stale?: boolean;
}

interface QuotaBarsProps {
  style: "eq" | "vu" | "lights" | "dots";
  /** 悬挂位置(由 CompanionLayer 结合用户设置与贴边翻转算出) */
  placement: "bottom" | "top" | "left" | "right";
  glow: boolean;
  pulse: boolean;
  appearance: QuotaAppearance;
  offsetX: number;
  offsetY: number;
  /** 背景(玻璃舱容器)缩放 */
  podScale: number;
  /** 内部条本体(柱/段/圆点)缩放 */
  barScale: number;
  items: QuotaBarItem[];
  typingSignal: number;
}

const MOUNT_CLS: Record<QuotaBarsProps["placement"], string> = {
  bottom: "quota-mount-bottom",
  top: "quota-mount-top",
  left: "quota-mount-left",
  right: "quota-mount-right",
};

const SEG_COUNT = 12;

/** 子形态共用 props(不含 style/placement) */
type BarsProps = Omit<QuotaBarsProps, "style" | "placement">;

/** hex → rgba(用于玻璃舱背景透明度) */
const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** 警告级别 → 颜色(三档,可自定义) */
const levelColor = (pct: number, a: QuotaAppearance) =>
  pct < 20 ? a.colorLow : pct < 50 ? a.colorWarn : a.colorOk;

/** 辉光色:默认跟随警告级别,或固定色 */
const glowColorOf = (pct: number, a: QuotaAppearance) =>
  a.glowFollowsLevel ? levelColor(pct, a) : a.glowColor;

/** 辉光模糊半径:随强度 0-1 映射 3~16px(范围更大,强度差异更明显) */
const glowBlurOf = (a: QuotaAppearance) => 3 + a.glowIntensity * 13;

export function QuotaBars(props: QuotaBarsProps) {
  const { style, placement, offsetX, offsetY, podScale, barScale, items } = props;
  if (items.length === 0) return null;

  // CSS 变量下发给所有形态:--quota-pod-scale 控制容器内边距/间距/圆角,
  // --quota-bar-scale 控制条本体(柱/段/圆点)尺寸,两者独立缩放
  const vars = {
    "--quota-pod-scale": podScale,
    "--quota-bar-scale": barScale,
  } as React.CSSProperties;

  return (
    <div className={MOUNT_CLS[placement]}>
      <div style={{ ...vars, transform: `translate(${offsetX}px, ${offsetY}px)` }}>
        {style === "eq" && <EqBars {...props} />}
        {style === "vu" && <VuBars {...props} />}
        {style === "lights" && <Lights {...props} />}
        {style === "dots" && <Dots {...props} />}
      </div>
    </div>
  );
}

/** 低额度呼吸:仅 pulse 开关开启且 <20% 时挂类 */
const lowCls = (pct: number, pulse: boolean) => (pulse && pct < 20 ? "quota-lowpulse" : "");

// ─── A. EQ 拾音条 ───

function EqBars({ glow, pulse, appearance, items, typingSignal }: BarsProps) {
  const [bounce, setBounce] = useState<{ idx: number; extra: number } | null>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setBounce({ idx: Math.floor(Math.random() * items.length), extra: 10 + Math.random() * 10 });
    const t = window.setTimeout(() => setBounce(null), 160);
    return () => window.clearTimeout(t);
  }, [typingSignal, items.length]);

  return (
    <div
      className={cn("quota-pod quota-eq", glow && "quota-glow")}
      style={{
        background: hexToRgba(appearance.bgColor, appearance.bgOpacity),
        "--quota-glow-blur": `${glowBlurOf(appearance)}px`,
        opacity: items.some((i) => i.stale) ? 0.75 : 1,
      } as React.CSSProperties}
    >
      {items.map((it, i) => {
        const c = levelColor(it.pct, appearance);
        const h = Math.min(100, Math.max(it.pct, 7) + (bounce?.idx === i ? bounce.extra : 0));
        return (
          <div key={it.id} className="quota-eq-col" style={{ "--quota-glow": glowColorOf(it.pct, appearance) } as React.CSSProperties}>
            <div
              className={cn("quota-eq-fill", lowCls(it.pct, pulse))}
              style={{ height: `${Math.min(100, h)}%`, background: c }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── B. VU 分段条 ───

function VuBars({ glow, pulse, appearance, items, typingSignal }: BarsProps) {
  const [active, setActive] = useState(false);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setActive(true);
    const t = window.setTimeout(() => setActive(false), 300);
    return () => window.clearTimeout(t);
  }, [typingSignal]);

  return (
    <div
      className={cn("quota-pod quota-vu", glow && "quota-glow")}
      style={{
        background: hexToRgba(appearance.bgColor, appearance.bgOpacity),
        "--quota-glow-blur": `${glowBlurOf(appearance)}px`,
      } as React.CSSProperties}
    >
      {items.map((it) => {
        const c = levelColor(it.pct, appearance);
        const lit = Math.round((it.pct / 100) * SEG_COUNT);
        return (
          <div key={it.id} className="quota-vu-row" style={{ "--quota-glow": glowColorOf(it.pct, appearance) } as React.CSSProperties}>
            <div className="quota-vu-who" style={{ background: it.color }} />
            <div className="quota-vu-segs">
              {Array.from({ length: SEG_COUNT }, (_, i) => {
                const on = i < lit;
                const tail = active && i === lit - 1;
                return (
                  <div
                    key={i}
                    className={cn("quota-vu-seg", on && "quota-on", tail && "quota-tail", on && lowCls(it.pct, pulse))}
                    style={on ? { background: c } : undefined}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── C. 信号灯吊坠 ───

function Lights({ glow, pulse, appearance, items }: BarsProps) {
  return (
    <div className={cn("quota-lights", glow && "quota-glow")} style={{ "--quota-glow-blur": `${glowBlurOf(appearance)}px` } as React.CSSProperties}>
      {items.map((it) => {
        const cols = [appearance.colorOk, appearance.colorWarn, appearance.colorLow];
        const st = it.pct < 20 ? 2 : it.pct < 50 ? 1 : 0;
        const glowC = glowColorOf(it.pct, appearance);
        return (
          <div
            key={it.id}
            className="quota-light"
            style={{ background: hexToRgba(appearance.bgColor, appearance.bgOpacity) }}
          >
            {cols.map((c, i) => (
              <i
                key={c}
                className={cn(i === st && "quota-lit", i === 2 && st === 2 && pulse && "quota-lowpulse")}
                style={{ "--quota-glow": glowC, background: c, opacity: i === st ? 1 : 0.16 } as React.CSSProperties}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── D. 信号圆点 ───

function Dots({ glow, pulse, appearance, items, typingSignal }: BarsProps) {
  const [popIdx, setPopIdx] = useState<number | null>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setPopIdx(Math.floor(Math.random() * items.length));
    const t = window.setTimeout(() => setPopIdx(null), 150);
    return () => window.clearTimeout(t);
  }, [typingSignal, items.length]);

  return (
    <div
      className={cn("quota-pod quota-dots", glow && "quota-glow")}
      style={{
        background: hexToRgba(appearance.bgColor, appearance.bgOpacity),
        "--quota-glow-blur": `${glowBlurOf(appearance)}px`,
      } as React.CSSProperties}
    >
      {items.map((it, i) => (
        <div
          key={it.id}
          className={cn("quota-dot", lowCls(it.pct, pulse))}
          style={{
            "--quota-glow": glowColorOf(it.pct, appearance),
            background: levelColor(it.pct, appearance),
            transform: popIdx === i ? "scale(1.35)" : undefined,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ─── 点击气泡内的额度明细行(颜色同样遵循警告级别) ───

export interface QuotaDetailItem {
  name: string;
  color: string;
  label: string;
  pct: number | null;
  error?: string;
}

export function QuotaDetailRows({ items, appearance }: { items: QuotaDetailItem[]; appearance: QuotaAppearance }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => (
        <div key={it.name}>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="text-white/85">{it.name}</span>
            <span className="ml-auto font-mono text-[10px] text-white/55">
              {it.error ? "查询失败" : it.pct != null ? `${it.pct}% · ${it.label}` : it.label}
            </span>
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${it.pct ?? 0}%`,
                background: it.pct != null ? levelColor(it.pct, appearance) : "rgba(255,255,255,.3)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
