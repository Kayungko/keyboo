// 软体 3D 皮肤:熊猫汤圆的"局部 Q 弹"变形(three.js 真 3D 软体)
//
// 物理:SoftBodyField 核心层(参数化 + tanh 应变限幅 + 面积守恒),与 2D 皮肤共用。
// 造型:球体身体 + 双耳小球 + 脸片 decal(五官贴图平面)——保住熊猫人设,
// 不再是纯白球;脸片/耳朵跟随形变场微移,与身体运动一致。
// 裁切:相机距离随拉伸幅度自适应(视锥半高 ≥ 球半径 + 最大位移 + 余量),顶点永不出画。
//
// 单位换算:球半径 1 ↔ 角色盒半径 BLOB_R(与 2D 皮肤的视觉大小一致)。

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FACE_SVG, rasterizeSvg } from "@/lib/softbody/assets";
import { SoftBodyField, fieldDisplacement, VISUAL_SETTLE_EPS, type SkinProps } from "@/lib/softbody/core";

const SEGMENTS = 36; // 球体细分(~1400 顶点);面向 160px 展示上限,降低逐帧法线重算
const BLOB_R = 0.26; // 角色盒归一化半径(身体占盒宽 ~52%,与 2D 皮肤一致)
const FOV = 35;
const REST_HALF = 0.5 / BLOB_R; // 静止时视锥半高(球直径 = 盒宽×2×BLOB_R)
const PAD_EXTRA = 0.15; // 限幅之外的余量(弹簧 overshoot),与 2D 皮肤一致

const FACE_UV = { u: 0.5, v: 0.5 }; // 脸片锚点(球正面中心)
const EAR_BASE = [
  { x: -0.66, y: 0.68, z: 0.12 },
  { x: 0.66, y: 0.68, z: 0.12 },
];

// 脸片/耳朵跟随锚点的弹簧状态(与身体共用物理参数,运动一致)
interface Anchor {
  baseX: number;
  baseY: number;
  baseZ: number;
  u: number;
  v: number;
  obj: THREE.Object3D;
  dx: number;
  dy: number;
  dz: number;
  vx: number;
  vy: number;
  vz: number;
}

export function SoftBody3D({ size, pull, params, visible, onSettled }: SkinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(pull);
  const paramsRef = useRef(params);
  const visibleRef = useRef(visible);
  const sizeRef = useRef(size);
  const onSettledRef = useRef(onSettled);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    pullRef.current = pull;
    wakeRef.current();
  }, [pull]);
  useEffect(() => {
    paramsRef.current = params;
    wakeRef.current();
  }, [params]);
  useEffect(() => {
    visibleRef.current = visible;
    wakeRef.current();
  }, [visible]);
  useEffect(() => {
    sizeRef.current = size;
    wakeRef.current();
  }, [size]);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ─── 渲染器:透明背景 ───
    // premultipliedAlpha/preserveDrawingBuffer 与 2D 皮肤同理:边缘合成一致 + 停帧末帧保留
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    container.appendChild(canvas);

    // ─── 场景与相机(距离随拉伸自适应) ───
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const CAM_DIST = REST_HALF / Math.tan((FOV * Math.PI) / 360);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);

    // 光照:环境光为主 + 主光随形变渐亮。静止时主光≈0.1,整体接近平涂——
    // 与 2D 静止帧的亮度观感一致,消除切换瞬间的"光影消失"明暗阶跃;
    // 拉拽形变中主光升到 1.1,保留体积感。初始即静止值,起步无亮度下冲
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.1);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    // ─── 身体:球体 ───
    const geo = new THREE.SphereGeometry(1, SEGMENTS, SEGMENTS);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.55, metalness: 0 });
    const body = new THREE.Mesh(geo, bodyMat);
    scene.add(body);

    // ─── 耳朵:两个黑色小球 ───
    const earGeo = new THREE.SphereGeometry(0.3, 20, 20);
    const earMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6, metalness: 0 });
    const ears = EAR_BASE.map((b) => {
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(b.x, b.y, b.z);
      scene.add(ear);
      return ear;
    });

    // ─── 脸片:五官 decal 平面(贴着脸前表面;贴图加载前先隐藏,避免白板闪现) ───
    // 透视补偿:脸片位于 z=0.98 前表面,透视相机会把它放大 CAM_DIST/(CAM_DIST-0.98)
    // ≈1.19 倍(双眼表观间距比 2D 帧大 ~20%);整体缩放 (D-0.98)/D 恰好抵消,
    // 使静止时五官比例与 2D 静止帧对齐,切回无"五官向内收"跳变
    const FACE_PERSP = (CAM_DIST - 0.98) / CAM_DIST;
    const faceGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const faceMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.scale.setScalar(FACE_PERSP);
    face.position.z = 0.98;
    face.renderOrder = 1;
    face.visible = false;
    scene.add(face);

    let disposed = false;
    void rasterizeSvg(FACE_SVG, 512).then((c) => {
      if (disposed) return;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      faceMat.map = tex;
      faceMat.needsUpdate = true;
      face.visible = true;
      wakeRef.current();
    });

    // ─── 物理场:球面顶点 → 角色归一化空间 ───
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const n = posAttr.count;
    const restU = new Float32Array(n);
    const restV = new Float32Array(n);
    const restW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      restU[i] = 0.5 + posAttr.getX(i) * BLOB_R;
      restV[i] = 0.5 - posAttr.getY(i) * BLOB_R;
      restW[i] = 0.5 + posAttr.getZ(i) * BLOB_R;
    }
    const field = new SoftBodyField(restU, restV, restW);

    // 跟随锚点:脸片 + 双耳
    const anchors: Anchor[] = [
      { baseX: 0, baseY: 0, baseZ: 0.98, u: FACE_UV.u, v: FACE_UV.v, obj: face, dx: 0, dy: 0, dz: 0, vx: 0, vy: 0, vz: 0 },
      ...EAR_BASE.map((b, i) => ({
        baseX: b.x,
        baseY: b.y,
        baseZ: b.z,
        u: 0.5 + b.x * BLOB_R,
        v: 0.5 - b.y * BLOB_R,
        obj: ears[i],
        dx: 0,
        dy: 0,
        dz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      })),
    ];

    // ─── 尺寸适配(setSize 传 CSS 尺寸,pixelRatio 由 renderer 内部处理) ───
    let appliedSize = -1;
    const applyLayout = () => {
      renderer.setSize(sizeRef.current, sizeRef.current, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      appliedSize = sizeRef.current;
    };
    applyLayout();

    // ─── rAF:软体物理 + 相机自适应 + 渲染 ───
    // 静止后停帧；隐藏时不渲染但完成剩余回弹，交互/参数变化即时恢复。
    // onSettled 闭环与 2D 皮肤同理:hadMotion 门防挂载首帧误触发,3D 侧静止
    // = 物理场 + 跟随锚点 + 相机 lerp 三者全部收敛,任一未收敛都不上报。
    let raf = 0;
    let lastT = performance.now();
    let hadMotion = false;
    const wake = () => {
      if (disposed || raf !== 0) return;
      lastT = performance.now();
      raf = requestAnimationFrame(step);
    };
    const step = () => {
      raf = 0;
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.033, (now - lastT) / 1000);
      lastT = now;
      const p = paramsRef.current;

      if (appliedSize !== sizeRef.current) applyLayout();

      const fieldMoving = field.update(dt, pullRef.current, sizeRef.current, p);

      // 球面顶点写回:归一化空间 → 球坐标
      for (let i = 0; i < n; i++) {
        posAttr.setXYZ(
          i,
          (field.curU[i] - 0.5) / BLOB_R,
          (0.5 - field.curV[i]) / BLOB_R,
          (field.curW[i] - 0.5) / BLOB_R,
        );
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();

      // 脸片/耳朵:目标位移经弹簧平滑,与身体同步晃动
      let anchorMoving = false;
      for (const a of anchors) {
        const disp = fieldDisplacement(a.u, a.v, pullRef.current, sizeRef.current, p);
        const tx = disp.du / BLOB_R;
        const ty = -disp.dv / BLOB_R;
        const tz = disp.dw / BLOB_R;
        a.vx += ((tx - a.dx) * p.stiffness - a.vx * p.damping) * dt;
        a.vy += ((ty - a.dy) * p.stiffness - a.vy * p.damping) * dt;
        a.vz += ((tz - a.dz) * p.stiffness - a.vz * p.damping) * dt;
        a.dx += a.vx * dt;
        a.dy += a.vy * dt;
        a.dz += a.vz * dt;
        const movingX = Math.abs(tx - a.dx) > 1e-4 || Math.abs(a.vx) > 1e-3;
        const movingY = Math.abs(ty - a.dy) > 1e-4 || Math.abs(a.vy) > 1e-3;
        const movingZ = Math.abs(tz - a.dz) > 1e-4 || Math.abs(a.vz) > 1e-3;
        if (!movingX) {
          a.dx = tx;
          a.vx = 0;
        }
        if (!movingY) {
          a.dy = ty;
          a.vy = 0;
        }
        if (!movingZ) {
          a.dz = tz;
          a.vz = 0;
        }
        anchorMoving ||= movingX || movingY || movingZ;
        a.obj.position.set(a.baseX + a.dx, a.baseY + a.dy, a.baseZ + a.dz);
      }

      // 光照:主光随真实形变量渐变。dispNorm 从 cur-rest 实测,松手回弹过程中
      // 仍有值(ampNorm 对 null pull 立即归 0,不能用),回弹到位主光渐熄至 ~0.1
      const targetI = 0.1 + Math.min(1, field.dispNorm * 3);
      dir.intensity += (targetI - dir.intensity) * Math.min(1, dt * 8);

      // 相机:视锥半高 ≥ 球半径 + 最大位移 + 余量(位移 amp 是角色盒归一化,
      // 除以 BLOB_R 换算到球坐标)→ 任意拉伸不出画
      const halfH = Math.max(REST_HALF, 1 + (field.ampNorm + PAD_EXTRA) / BLOB_R);
      const targetZ = halfH / Math.tan((FOV * Math.PI) / 360);
      camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 10);
      const cameraMoving = Math.abs(camera.position.z - targetZ) > 1e-3;

      if (visibleRef.current) {
        renderer.render(scene, camera);
      }
      // 视觉静止即切(与 2D 皮肤一致):残余 < 0.3px 不再等物理判据收尾
      const settled = !pullRef.current && field.dispNorm < VISUAL_SETTLE_EPS;
      const busy = (fieldMoving || anchorMoving || cameraMoving) && !settled;
      if (busy) {
        hadMotion = true;
        wake();
      } else if (hadMotion && !pullRef.current) {
        hadMotion = false;
        onSettledRef.current?.();
      }
    };
    wakeRef.current = wake;
    wake();

    return () => {
      disposed = true;
      wakeRef.current = () => {};
      cancelAnimationFrame(raf);
      geo.dispose();
      bodyMat.dispose();
      earGeo.dispose();
      earMat.dispose();
      faceGeo.dispose();
      faceMat.map?.dispose();
      faceMat.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: visible ? 1 : 0,
        // 方向感知过渡(与 2D 皮肤一致):显示瞬时,隐藏延迟 80ms 后 80ms 淡出,
        // DOM 帧先淡入到位、canvas 后退场,切换全程无合成不透明度空窗
        transition: visible ? "none" : "opacity 0.08s linear 0.08s",
        pointerEvents: "none",
      }}
    />
  );
}
