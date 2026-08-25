import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { useEffect, useRef } from "react";

// 鼠标移动轨迹拖尾:订阅已合并的鼠标坐标,在 canvas 上绘制按年龄渐隐的轨迹

const MAX_TRAIL_POINTS = 512;

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

export const MouseTrail = () => {
  const showTrail = useStyleStore((state) => state.mouse.showTrail);
  const trailColor = useStyleStore((state) => state.mouse.trailColor);
  const trailWidth = useStyleStore((state) => state.mouse.trailWidth);
  const trailFadeMs = useStyleStore((state) => state.mouse.trailFadeMs);
  // 设备维度总门控:常规设置「鼠标反馈」关闭时拖尾一并隐藏
  const showMouseEffects = useEventStore((state) => state.showMouseEffects);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<TrailPoint[]>([]);

  useEffect(() => {
    // showTrail 必须在依赖里:关闭后 canvas 卸载,重开时 effect 需重建,
    // 否则 ctx 仍指向旧 canvas,轨迹永不显示
    if (!showTrail || !showMouseEffects) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // 收集轨迹点:存物理像素坐标,绘制时按实时 dpr 换算,
    // 跨显示器/缩放变化时旧点不错位
    const unsubscribe = useEventStore.subscribe((state, prev) => {
      if (state.mouse.x === prev.mouse.x && state.mouse.y === prev.mouse.y) return;
      pointsRef.current.push({
        x: state.mouse.x,
        y: state.mouse.y,
        t: performance.now(),
      });
      if (pointsRef.current.length > MAX_TRAIL_POINTS) {
        pointsRef.current.splice(0, pointsRef.current.length - MAX_TRAIL_POINTS);
      }
    });

    let raf = 0;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const now = performance.now();
      const fadeMs = Math.max(50, trailFadeMs);
      const points = pointsRef.current.filter((p) => now - p.t < fadeMs);
      pointsRef.current = points;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      if (points.length > 1) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = trailWidth;
        // 按段绘制,透明度随年龄线性衰减
        for (let i = 1; i < points.length; i++) {
          const age = now - points[i].t;
          ctx.globalAlpha = Math.max(0, 1 - age / fadeMs) * 0.6;
          ctx.beginPath();
          ctx.moveTo(points[i - 1].x / dpr, points[i - 1].y / dpr);
          ctx.lineTo(points[i].x / dpr, points[i].y / dpr);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", resize);
      pointsRef.current = [];
    };
  }, [showTrail, showMouseEffects, trailColor, trailWidth, trailFadeMs]);

  if (!showTrail || !showMouseEffects) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};
