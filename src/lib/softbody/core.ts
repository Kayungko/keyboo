// 软体物理核心层:2D / 3D 皮肤共用的形变场(皮肤可插拔架构的中间层)
//
//   CompanionLayer(交互判定)→ SoftBodyField(本文件,物理)→ 皮肤渲染器(SoftBody / SoftBody3D)
//
// 模型:高斯拉拽场 + tanh 应变限幅 + 垂直颈缩 + 逐顶点欠阻尼弹簧
// - 应变限幅:拖拽位移经 tanh 软钳制,最大拉伸量 < maxStretch×size,
//   顶点数学上不可能越出渲染区 → 裁切根治;"无限拉长"的橡皮筋感也随之消失。
// - 颈缩(面积守恒感):拖拽轴垂直方向向轴心收拢——像捏果冻时截面变窄,
//   集中在抓点附近,远端不受干扰。
// - 弹簧:半隐式欧拉 mass-spring-damper,欠阻尼 → 松手 overshoot 果冻感。
//
// 坐标约定:静止坐标用角色归一化空间,u/v ∈ [0,1](v 向下,与屏幕一致);
// 位移同单位。各皮肤自行映射到自己的渲染空间(2D 平面 / 3D 球面)。

export interface PullInfo {
  /** 拖拽点在角色内的相对位置(0~1) */
  localX: number;
  localY: number;
  /** 拖拽点自按下起的全局偏移(CSS px) */
  offsetX: number;
  offsetY: number;
}

export interface PhysicsParams {
  /** 弹簧刚度(ω₀=√k) */
  stiffness: number;
  /** 阻尼(ζ = d/2√k,<1 欠阻尼有回弹) */
  damping: number;
  /** 影响半径 σ(高斯衰减,拖拽只影响附近 ~σ 区域) */
  sigma: number;
  /** 最大拉伸率(相对角色尺寸):应变限幅上限 */
  maxStretch: number;
  /** 颈缩强度(0=纯拉伸,1=抓点附近截面明显收窄) */
  squash: number;
  /** 拉伸处隆起强度(3D 皮肤的 Z 轴鼓起) */
  bulge: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  stiffness: 50,
  damping: 6,
  sigma: 0.35,
  maxStretch: 0.45,
  squash: 0.5,
  bulge: 0.4,
};

/** 设置页滑块范围(与 DEFAULT_PHYSICS 对应) */
export const PHYSICS_LIMITS: Record<keyof PhysicsParams, { min: number; max: number; step: number }> = {
  stiffness: { min: 10, max: 150, step: 5 },
  damping: { min: 2, max: 20, step: 0.5 },
  sigma: { min: 0.15, max: 0.6, step: 0.01 },
  maxStretch: { min: 0.15, max: 0.8, step: 0.05 },
  squash: { min: 0, max: 1, step: 0.05 },
  bulge: { min: 0, max: 1, step: 0.05 },
};

/** 皮肤渲染器的统一 props(CompanionLayer 按 config.skin 选择) */
export interface SkinProps {
  size: number;
  pull: PullInfo | null;
  params: PhysicsParams;
  visible: boolean;
  /** 自定义形象纹理源(asset protocol URL);缺省渲染内置角色 */
  asset?: string;
}

// ─── 内部:一帧的场参数(由 pull + params 推导) ───

interface FieldState {
  /** 限幅后的拉伸幅度(角色尺寸归一化) */
  amp: number;
  /** 拉伸方向(归一化) */
  dirU: number;
  dirV: number;
  /** 高斯中心(拖拽点) */
  cu: number;
  cv: number;
  /** 1/(2σ²) */
  inv2s2: number;
  /** 面积守恒收缩系数 */
  squashK: number;
  /** 隆起系数 */
  bulge: number;
}

function computeField(pull: PullInfo | null, sizePx: number, p: PhysicsParams): FieldState {
  let amp = 0;
  let dirU = 0;
  let dirV = 0;
  if (pull) {
    // 应变限幅:tanh 软钳制,|位移| 渐近 maxStretch×size,永不超过
    const limitPx = Math.max(1e-3, sizePx * p.maxStretch);
    const mag = Math.hypot(pull.offsetX, pull.offsetY);
    amp = (limitPx * Math.tanh(mag / limitPx)) / sizePx;
    if (mag > 1e-6) {
      dirU = pull.offsetX / mag;
      dirV = pull.offsetY / mag;
    }
  }
  return {
    amp,
    dirU,
    dirV,
    cu: pull ? pull.localX : 0.5,
    cv: pull ? pull.localY : 0.5,
    inv2s2: 1 / (2 * p.sigma * p.sigma),
    // 颈缩强度:随拉伸幅度增长;×1.5 使默认参数下收拢肉眼可见
    squashK: p.squash * 1.5 * amp,
    bulge: p.bulge,
  };
}

/** 场在某静止点的目标位移(不含弹簧平滑;脸片/耳朵跟随用) */
export function fieldDisplacement(
  u: number,
  v: number,
  pull: PullInfo | null,
  sizePx: number,
  p: PhysicsParams,
): { du: number; dv: number; dw: number } {
  const f = computeField(pull, sizePx, p);
  if (f.amp <= 1e-5) return { du: 0, dv: 0, dw: 0 };
  const dx = u - f.cu;
  const dy = v - f.cv;
  const w = Math.exp(-(dx * dx + dy * dy) * f.inv2s2);
  // 垂直收缩:拖拽轴垂直方向的分量向轴心收拢(果冻受捏的颈缩效果),
  // 权重随高斯衰减 → 收缩集中在抓点附近,远端不受干扰
  const par = dx * f.dirU + dy * f.dirV;
  const perpX = dx - par * f.dirU;
  const perpY = dy - par * f.dirV;
  const pinch = f.squashK * w;
  return {
    du: f.dirU * f.amp * w - perpX * pinch,
    dv: f.dirV * f.amp * w - perpY * pinch,
    dw: f.amp * w * f.bulge,
  };
}

/**
 * 软体形变场:一组静止坐标上的顶点,逐顶点弹簧追踪高斯目标位移。
 * restU/restV ∈ [0,1];restW 可选(Z 轴,3D 皮肤用;同单位,0.5 = 中性面)。
 */
export class SoftBodyField {
  readonly count: number;
  readonly withZ: boolean;
  curU: Float32Array;
  curV: Float32Array;
  curW: Float32Array;
  /** 当前生效的限幅拉伸幅度(角色尺寸归一化)——相机自适应等外部逻辑读取 */
  ampNorm = 0;

  private restU: Float32Array;
  private restV: Float32Array;
  private restW: Float32Array;
  private velU: Float32Array;
  private velV: Float32Array;
  private velW: Float32Array;

  constructor(restU: ArrayLike<number>, restV: ArrayLike<number>, restW?: ArrayLike<number>) {
    const n = restU.length;
    this.count = n;
    this.withZ = !!restW;
    this.restU = Float32Array.from(restU);
    this.restV = Float32Array.from(restV);
    this.restW = restW ? Float32Array.from(restW) : new Float32Array(n).fill(0.5);
    this.curU = Float32Array.from(this.restU);
    this.curV = Float32Array.from(this.restV);
    this.curW = Float32Array.from(this.restW);
    this.velU = new Float32Array(n);
    this.velV = new Float32Array(n);
    this.velW = new Float32Array(n);
  }

  /** 一帧更新:dt 秒,pull = null 时目标回静止位(弹簧回弹) */
  update(dt: number, pull: PullInfo | null, sizePx: number, p: PhysicsParams) {
    const f = computeField(pull, sizePx, p);
    this.ampNorm = f.amp;
    const { count, restU, restV, restW, curU, curV, curW, velU, velV, velW } = this;
    const k = p.stiffness;
    const d = p.damping;
    const active = f.amp > 1e-5;
    for (let i = 0; i < count; i++) {
      const ru = restU[i];
      const rv = restV[i];
      let tu = ru;
      let tv = rv;
      let tw = restW[i];
      if (active) {
        const dx = ru - f.cu;
        const dy = rv - f.cv;
        const w = Math.exp(-(dx * dx + dy * dy) * f.inv2s2);
        // 垂直收缩(颈缩):拖拽轴垂直分量向轴心收拢,集中在抓点附近
        const par = dx * f.dirU + dy * f.dirV;
        const pinch = f.squashK * w;
        tu = ru + f.dirU * f.amp * w - (dx - par * f.dirU) * pinch;
        tv = rv + f.dirV * f.amp * w - (dy - par * f.dirV) * pinch;
        if (this.withZ) tw = restW[i] + f.amp * w * f.bulge;
      }
      // 半隐式欧拉弹簧(与帧率无关)
      velU[i] += ((tu - curU[i]) * k - velU[i] * d) * dt;
      velV[i] += ((tv - curV[i]) * k - velV[i] * d) * dt;
      if (this.withZ) velW[i] += ((tw - curW[i]) * k - velW[i] * d) * dt;
      curU[i] += velU[i] * dt;
      curV[i] += velV[i] * dt;
      if (this.withZ) curW[i] += velW[i] * dt;
    }
  }
}
