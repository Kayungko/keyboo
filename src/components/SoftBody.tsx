// 软体网格组件:熊猫汤圆的"局部 Q 弹"变形
//
// 方案:Canvas 网格纹理映射(mesh warp)。把角色光栅化到离屏 canvas,
// 用 M×N 网格顶点覆盖,拖动时对拖拽点附近的顶点施加位移(高斯衰减,
// 只影响附近区域 → "只有那一块被拉伸"),每个顶点独立 spring 回弹
// (欠阻尼 → 松手 overshoot 果冻感),渲染时三角化 + 仿射纹理映射。
//
// 与 SVG 版(带眨眼)并存:拖动/回弹期间本组件可见,稳定后切回 SVG。

import { useEffect, useRef } from "react";

const GRID = 6; // 6×6 段 → 7×7 顶点,72 三角形,96px 角色够平滑
const CANVAS = 256; // 离屏光栅化尺寸

// 熊猫汤圆(与 BlobSvg 的 JSX 内容一致,去除 drop-shadow——阴影移到外层容器)
const BLOB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <ellipse cx="329" cy="324" rx="83" ry="67" fill="#1D1D1D" transform="rotate(-22 329 324)"/>
  <ellipse cx="684" cy="318" rx="83" ry="67" fill="#1D1D1D" transform="rotate(22 684 318)"/>
  <path d="M512 256 C672 256 785 374 785 531 C785 683 673 767 508 767 C347 767 239 680 239 531 C239 377 351 256 512 256Z" fill="#FFFDF7"/>
  <path d="M340 402C385 313 484 286 568 305C468 318 390 360 340 443Z" fill="#FFFFFF" opacity=".85"/>
  <g transform="rotate(25 407 490)"><ellipse cx="407" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
  <g transform="rotate(-25 617 490)"><ellipse cx="617" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
  <ellipse cx="512" cy="585" rx="39" ry="31" fill="#1D1D1D" transform="rotate(-8 512 585)"/>
</svg>`;

export interface PullInfo {
  /** 拖拽点在角色内的相对位置(0~1) */
  localX: number;
  localY: number;
  /** 拖拽点自按下起的全局偏移(px) */
  offsetX: number;
  offsetY: number;
}

interface Vertex {
  rx: number;
  ry: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
}

// 弹簧参数(欠阻尼 → overshoot)
const STIFFNESS = 0.28;
const DAMPING = 0.82;
// 高斯衰减:sigma²=0.12 → sigma≈0.35,拖拽只影响附近 ~1/3 区域
const SIGMA2 = 0.12;

export function SoftBody({
  size,
  pull,
  visible,
}: {
  size: number;
  pull: PullInfo | null;
  visible: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const vertsRef = useRef<Vertex[]>([]);
  const pullRef = useRef<PullInfo | null>(pull);
  const visibleRef = useRef(visible);
  const sizeRef = useRef(size);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // 光栅化角色 + 初始化网格(仅一次)
  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = CANVAS;
    off.height = CANVAS;
    const octx = off.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      octx.clearRect(0, 0, CANVAS, CANVAS);
      octx.drawImage(img, 0, 0, CANVAS, CANVAS);
      offRef.current = off;
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(BLOB_SVG);

    const verts: Vertex[] = [];
    for (let gy = 0; gy <= GRID; gy++) {
      for (let gx = 0; gx <= GRID; gx++) {
        const rx = gx / GRID;
        const ry = gy / GRID;
        verts.push({ rx, ry, cx: rx, cy: ry, vx: 0, vy: 0 });
      }
    }
    vertsRef.current = verts;
  }, []);

  // rAF 循环:spring 更新 + 纹理映射渲染
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const canvas = canvasRef.current;
      const off = offRef.current;
      const verts = vertsRef.current;
      if (canvas && off && verts.length && visibleRef.current) {
        updateAndRender(canvas, off, verts, sizeRef.current, pullRef.current);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
      }}
    />
  );
}

function updateAndRender(
  canvas: HTMLCanvasElement,
  off: HTMLCanvasElement,
  verts: Vertex[],
  size: number,
  pull: PullInfo | null,
) {
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.max(1, Math.round(size * dpr));
  if (canvas.width !== pw || canvas.height !== pw) {
    canvas.width = pw;
    canvas.height = pw;
  }

  // spring 更新
  for (const v of verts) {
    let tx = v.rx;
    let ty = v.ry;
    if (pull) {
      const dx = v.rx - pull.localX;
      const dy = v.ry - pull.localY;
      const dist2 = dx * dx + dy * dy;
      const w = Math.exp(-dist2 / (2 * SIGMA2));
      tx = v.rx + (pull.offsetX / size) * w;
      ty = v.ry + (pull.offsetY / size) * w;
    }
    v.vx = (v.vx + (tx - v.cx) * STIFFNESS) * DAMPING;
    v.vy = (v.vy + (ty - v.cy) * STIFFNESS) * DAMPING;
    v.cx += v.vx;
    v.cy += v.vy;
  }

  // 渲染
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = size;
  const stride = GRID + 1;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i00 = gy * stride + gx;
      const i10 = i00 + 1;
      const i01 = i00 + stride;
      const i11 = i01 + 1;
      const v00 = verts[i00];
      const v10 = verts[i10];
      const v01 = verts[i01];
      const v11 = verts[i11];
      drawTri(
        ctx, off,
        v00.cx * S, v00.cy * S, v10.cx * S, v10.cy * S, v11.cx * S, v11.cy * S,
        v00.rx * CANVAS, v00.ry * CANVAS, v10.rx * CANVAS, v10.ry * CANVAS, v11.rx * CANVAS, v11.ry * CANVAS,
      );
      drawTri(
        ctx, off,
        v00.cx * S, v00.cy * S, v11.cx * S, v11.cy * S, v01.cx * S, v01.cy * S,
        v00.rx * CANVAS, v00.ry * CANVAS, v11.rx * CANVAS, v11.ry * CANVAS, v01.rx * CANVAS, v01.ry * CANVAS,
      );
    }
  }
}

function drawTri(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  u0: number, v0: number, u1: number, v1: number, u2: number, v2: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();
  const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if (Math.abs(det) < 1e-6) {
    ctx.restore();
    return;
  }
  const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
  const b = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
  const c = x0 - a * u0 - b * v0;
  const d = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
  const e = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
  const f = y0 - d * u0 - e * v0;
  ctx.transform(a, d, b, e, c, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
