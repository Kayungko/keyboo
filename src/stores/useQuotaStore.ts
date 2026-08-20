// AI 额度 store:配置持久化(keyboo.json 独立条目 quota-config)+ 运行时额度快照。
//
// 持久化策略仿 useCompanionStore:不走 zustand persist,手动 load/save 独立条目,
// 因此不受 persist.ts 的 isSenderWindow 限制(双窗口可写,但实际只有设置页改配置;
// 覆盖层只更新运行时 snapshots,绝不写 config,天然无冲突)。
//
// 双窗口同步:配置走 sync.ts(设置页 startSyncSender / 覆盖层 listenSync);
// snapshots 是覆盖层独占的运行时态,不持久化、不同步(重启后首轮询周期为空窗,可接受)。
//
// 不可变约定:setProvider 必须 map 出新数组——sync.ts 对顶层键做浅比较,
// 原地 mutate providers 再 setConfig 会让广播与重渲染静默失败。
//
// 安全取舍:apiKey 以明文存于本机 %APPDATA% 的 keyboo.json(与主流本地工具同档),
// 设置页有显式提示;后续可改 Rust command 走 DPAPI 加密。覆盖层任何渲染路径不回显 key。

import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

export const QUOTA_STORE_NAME = "keyboo-quota-store";
const CONFIG_KEY = "quota-config";

/** 进度条形态:EQ 拾音条 / VU 分段条 / 信号灯吊坠 / 信号圆点 */
export type QuotaStyle = "eq" | "vu" | "lights" | "dots";

/** 进度条悬挂位置:auto = 智能(伙伴贴屏幕底边时翻到头顶,侧挂形态贴右边时换左侧) */
export type QuotaPosition = "auto" | "bottom" | "top" | "side";

/** 进度条外观自定义 */
export interface QuotaAppearance {
  /** 玻璃舱背景色(hex,如 #0a0c10) */
  bgColor: string;
  /** 玻璃舱背景不透明度 0-1 */
  bgOpacity: number;
  /** 健康档颜色(>50%) */
  colorOk: string;
  /** 紧张档颜色(20-50%) */
  colorWarn: string;
  /** 告急档颜色(<20%) */
  colorLow: string;
  /** 辉光强度 0-1(映射到模糊半径与阴影透明度) */
  glowIntensity: number;
  /** 辉光是否跟随警告级别色(否则用 glowColor 固定色) */
  glowFollowsLevel: boolean;
  /** 固定辉光色(glowFollowsLevel=false 时生效) */
  glowColor: string;
}

export interface QuotaProviderConfig {
  /** 注册表 id,见 src/lib/quota/providers.ts */
  id: string;
  enabled: boolean;
  /** apikey 类凭据(明文存储,见头部安全取舍) */
  apiKey?: string;
  /** 余额类(¥/$)换算百分比的月度预算基准;缺省取注册表默认 */
  budget?: number;
}

export interface QuotaConfig {
  /** 总开关 */
  enabled: boolean;
  style: QuotaStyle;
  /** 悬挂位置(信号灯形态只走 side 逻辑) */
  position: QuotaPosition;
  /** 水平偏移(px,支持负数),相对默认悬挂位置 */
  offsetX: number;
  /** 垂直偏移(px,支持负数) */
  offsetY: number;
  /** 背景(玻璃舱容器)缩放 0.5~2.0 */
  podScale: number;
  /** 内部条本体(柱/段/圆点)缩放 0.5~2.0 */
  barScale: number;
  /** LED 辉光 */
  glow: boolean;
  /** 低额度(<20%)呼吸警示 */
  pulse: boolean;
  /** 轮询间隔(分钟),钳制 [1, 1440] */
  refreshMin: number;
  /** 外观自定义(背景/警告色/辉光) */
  appearance: QuotaAppearance;
  providers: QuotaProviderConfig[];
}

export interface QuotaSnapshot {
  id: string;
  /** 剩余额度百分比 0-100;null = 无法换算(条显示占位灰) */
  pct: number | null;
  /** 气泡展示文本:"¥12.34" / "$4.20" / "62%" */
  label: string;
  updatedAt: number;
  /** 最近一次失败原因 */
  error?: string;
  /** 本次失败、沿用上次值 */
  stale?: boolean;
}

const defaultAppearance = (): QuotaAppearance => ({
  bgColor: "#0a0c10",
  bgOpacity: 0.52,
  colorOk: "#34d399",
  colorWarn: "#fbbf24",
  colorLow: "#f87171",
  glowIntensity: 0.6,
  glowFollowsLevel: true,
  glowColor: "#34d399",
});

const defaultConfig = (): QuotaConfig => ({
  enabled: true,
  style: "eq",
  position: "auto",
  offsetX: 0,
  offsetY: 0,
  podScale: 1,
  barScale: 1,
  glow: true,
  pulse: true,
  refreshMin: 5,
  appearance: defaultAppearance(),
  providers: [
    { id: "openrouter", enabled: false },
    { id: "deepseek", enabled: false },
    { id: "moonshot", enabled: false },
    { id: "siliconflow", enabled: false },
    { id: "stability", enabled: false },
    { id: "codex", enabled: false },
    { id: "gemini-cli", enabled: false },
  ],
});

interface QuotaActions {
  setConfig: (patch: Partial<QuotaConfig>) => void;
  /** 不可变更新单个 provider(禁原地 mutate,见头部注释) */
  setProvider: (id: string, patch: Partial<QuotaProviderConfig>) => void;
  /** 仅覆盖层轮询调用 */
  applySnapshots: (list: QuotaSnapshot[]) => void;
}

export interface QuotaStore {
  config: QuotaConfig;
  snapshots: Record<string, QuotaSnapshot>;
  /** loadQuotaPersist 完成前设置页表单禁用,防默认值首帧冲掉 apiKey 存档 */
  loaded: boolean;
}

export const useQuotaStore = create<QuotaStore & QuotaActions>()((set) => ({
  config: defaultConfig(),
  snapshots: {},
  loaded: false,

  setConfig: (patch) => {
    set((s) => ({ config: { ...s.config, ...patch } }));
    void saveConfig();
  },

  setProvider: (id, patch) => {
    set((s) => ({
      config: {
        ...s.config,
        providers: s.config.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    }));
    void saveConfig();
  },

  applySnapshots: (list) =>
    set((s) => {
      const next = { ...s.snapshots };
      for (const snap of list) next[snap.id] = snap;
      return { snapshots: next };
    }),
}));

// ─── 持久化:keyboo.json 独立条目 ───

let storePromise: ReturnType<typeof load> | null = null;
const getStore = () => (storePromise ??= load("keyboo.json", { autoSave: false, defaults: {} }));

/** 启动时读盘(双窗口都调);校验非法值回退,完成置 loaded */
export async function loadQuotaPersist() {
  const store = await getStore();
  const raw = await store.get<Partial<QuotaConfig>>(CONFIG_KEY);
  if (raw) {
    const def = defaultConfig();
    const style: QuotaStyle =
      raw.style === "vu" || raw.style === "lights" || raw.style === "dots" ? raw.style : "eq";
    const position: QuotaPosition =
      raw.position === "bottom" || raw.position === "top" || raw.position === "side" ? raw.position : "auto";
    const defApp = defaultAppearance();
    const a: Partial<QuotaAppearance> = raw.appearance ?? {};
    const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
    const appearance: QuotaAppearance = {
      bgColor: isColor(a.bgColor) ? a.bgColor : defApp.bgColor,
      bgOpacity: typeof a.bgOpacity === "number" && Number.isFinite(a.bgOpacity) ? Math.min(1, Math.max(0, a.bgOpacity)) : defApp.bgOpacity,
      colorOk: isColor(a.colorOk) ? a.colorOk : defApp.colorOk,
      colorWarn: isColor(a.colorWarn) ? a.colorWarn : defApp.colorWarn,
      colorLow: isColor(a.colorLow) ? a.colorLow : defApp.colorLow,
      glowIntensity: typeof a.glowIntensity === "number" && Number.isFinite(a.glowIntensity) ? Math.min(1, Math.max(0, a.glowIntensity)) : defApp.glowIntensity,
      glowFollowsLevel: a.glowFollowsLevel !== false,
      glowColor: isColor(a.glowColor) ? a.glowColor : defApp.glowColor,
    };
    const clampOffset = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(2000, Math.max(-2000, Math.round(v))) : 0);
    // 旧存档兼容:老字段 scale(整体缩放)不再使用,回落到两个新字段的默认值
    const clampScale = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1);
    const podScale = clampScale(raw.podScale);
    const barScale = clampScale(raw.barScale);
    const refreshMin =
      typeof raw.refreshMin === "number" && Number.isFinite(raw.refreshMin)
        ? Math.min(1440, Math.max(1, Math.round(raw.refreshMin)))
        : def.refreshMin;
    // 存档 provider 与默认合并:新增 id 自动补进列表,未知 id 丢弃
    const known = new Map(def.providers.map((p) => [p.id, p]));
    const providers: QuotaProviderConfig[] = (Array.isArray(raw.providers) ? raw.providers : [])
      .filter((p): p is QuotaProviderConfig => !!p && typeof p.id === "string" && known.has(p.id))
      .map((p) => ({ ...known.get(p.id)!, enabled: !!p.enabled, apiKey: p.apiKey, budget: p.budget }));
    for (const [id, p] of known) {
      if (!providers.some((x) => x.id === id)) providers.push(p);
    }
    useQuotaStore.setState({
      config: {
        enabled: raw.enabled !== false,
        style,
        position,
        offsetX: clampOffset(raw.offsetX),
        offsetY: clampOffset(raw.offsetY),
        podScale,
        barScale,
        glow: raw.glow !== false,
        pulse: raw.pulse !== false,
        refreshMin,
        appearance,
        providers,
      },
    });
  }
  useQuotaStore.setState({ loaded: true });
}

async function saveConfig() {
  const store = await getStore();
  await store.set(CONFIG_KEY, useQuotaStore.getState().config);
  await store.save();
}
