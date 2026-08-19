// 软体 2D 皮肤:熊猫汤圆的"局部 Q 弹"变形(three.js 稠密网格 Warp)
//
// 物理:SoftBodyField 核心层(参数化 + tanh 应变限幅 + 面积守恒),与 3D 皮肤共用。
// 渲染:PlaneGeometry 稠密网格(32×32 段)承载 SVG 光栅化纹理,GPU 双线性采样——
// 替代旧 Canvas2D 逐三角形仿射 drawTri(三角形接缝/滑移/像素化在稠密网格下不可见)。
// 裁切:渲染区 padding = (maxStretch + 余量)×size,由物理限幅保证顶点永不越界。

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BODY_SVG, rasterizeImage, rasterizeSvg } from "@/lib/softbody/assets";
import { SoftBodyField, type SkinProps } from "@/lib/softbody/core";

const GRID = 32; // 32×32 段 → 33×33=1089 顶点,2048 三角形(GPU 无压力)
const TEXTURE = 1024; // 纹理光栅化尺寸
const PAD_EXTRA = 0.15; // maxStretch 之外的余量(弹簧 overshoot + 抗锯齿)

// 纹理画布按源缓存(内置角色 + 各自定义图片,多次挂载不重复光栅化)
const canvasCache = new Map<string, Promise<HTMLCanvasElement>>();
const getSkinCanvas = (asset?: string) => {
  const key = asset ?? "__body__";
  let p = canvasCache.get(key);
  if (!p) {
    p = asset ? rasterizeImage(asset, TEXTURE) : rasterizeSvg(BODY_SVG, TEXTURE);
    canvasCache.set(key, p);
  }
  return p;
};

export function SoftBody({ size, pull, params, visible, asset }: SkinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(pull);
  const paramsRef = useRef(params);
  const visibleRef = useRef(visible);
  const sizeRef = useRef(size);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ─── 渲染器:透明背景 ───
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    renderer.setClearColor(0x000000, 0);
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(dpr);
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    container.appendChild(canvas);

    // ─── 场景与正交相机(角色归一化空间,ext 随 maxStretch 参数推导) ───
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const geo = new THREE.PlaneGeometry(1, 1, GRID, GRID);
    const mat = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    let texReady = false;
    let disposed = false;
    void getSkinCanvas(asset).then((c) => {
      if (disposed) return;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      mat.map = tex;
      mat.needsUpdate = true;
      texReady = true;
    });

    // ─── 物理场:33×33 网格,静止坐标 = 纹理归一化坐标 ───
    const stride = GRID + 1;
    const restU = new Float32Array(stride * stride);
    const restV = new Float32Array(stride * stride);
    for (let gy = 0; gy < stride; gy++) {
      for (let gx = 0; gx < stride; gx++) {
        const i = gy * stride + gx;
        restU[i] = gx / GRID;
        restV[i] = gy / GRID;
      }
    }
    const field = new SoftBodyField(restU, restV);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;

    // ─── 布局:渲染区尺寸随 size / maxStretch 变化 ───
    let appliedSize = -1;
    let appliedStretch = -1;
    const applyLayout = () => {
      const s = sizeRef.current;
      const padNorm = paramsRef.current.maxStretch + PAD_EXTRA;
      const ext = 0.5 + padNorm;
      camera.left = -ext;
      camera.right = ext;
      camera.top = ext;
      camera.bottom = -ext;
      camera.updateProjectionMatrix();
      const cssSize = s * (1 + padNorm * 2);
      // setSize 传 CSS 尺寸,pixelRatio 由 renderer 内部处理(updateStyle=false,样式自管)
      renderer.setSize(cssSize, cssSize, false);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      canvas.style.left = `${-s * padNorm}px`;
      canvas.style.top = `${-s * padNorm}px`;
      appliedSize = s;
      appliedStretch = paramsRef.current.maxStretch;
    };
    applyLayout();

    // ─── rAF:物理更新 + 网格顶点写入 + 渲染 ───
    let raf = 0;
    let lastT = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.033, (now - lastT) / 1000);
      lastT = now;

      if (appliedSize !== sizeRef.current || appliedStretch !== paramsRef.current.maxStretch) {
        applyLayout();
      }

      field.update(dt, pullRef.current, sizeRef.current, paramsRef.current);
      for (let i = 0; i < field.count; i++) {
        posAttr.setXYZ(i, field.curU[i] - 0.5, 0.5 - field.curV[i], 0);
      }
      posAttr.needsUpdate = true;

      if (texReady && visibleRef.current) {
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [asset]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
      }}
    />
  );
}
