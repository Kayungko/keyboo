// 打字伙伴 store:配置 + 累计统计 + 运行时动画脉冲
//
// 持久化策略(与 style/event store 不同):
// - 统计的计数方是覆盖层窗口(事件只在那里消费),而 keybooStorage 只允许设置窗口写盘,
//   因此这里不走 zustand persist,直接用 plugin-store 两个独立条目:
//   companion-config(双窗口可写,低频)、companion-stats(覆盖层防抖写 / 设置页重置时写)。
// - 条目分离避免双窗口互相覆盖:设置页改配置不会把旧统计写回。
//
// 双窗口同步:配置走 sync.ts(设置页 startSyncSender),统计重置同样经 sync 通知覆盖层。
//
// 等级数值:内置角色预设见 src/lib/companion/presets.ts(每个角色一份档案:
// 称号 + 各级累计字数 + 表外外推 + 主题文案)。新增角色在 presets.ts 注册。
// 数值策划锚点 = 办公室重度敲字节奏(2~3W 字/天,中位 2.5W):首日升 3~4 级(密集正反馈)、
// 第 4 天左右 Lv.7、首周内「键啵宗师」;轻度用户(~8k/天)约三周宗师。
// 形状 = 前段手调收敛(增量 ×2 收敛)+ 表外长尾:经验收入线性,故后期每级增量线性递增
// (base 起、每级 +step),每级耗时平滑拉长、永不死尾;称号沿用末条。
// 角色体系:每个角色(键啵/道童…)档案(config.profiles)与经验(stats.chars)均独立存档,
// 切换角色各看各的进度,新角色从 Lv.1 从零开始;轻/重敲字用户可在设置页逐档调整当前角色的等级表。

import { DEFAULT_PHYSICS, type PhysicsParams } from "@/lib/softbody/core";
import { MODIFIERS } from "@/lib/types";
import {
  CHARACTERS,
  LEGACY_JIANBO_LEVEL_TITLES,
  presetProfileOf,
  type CharacterId,
  type CompanionProfile,
  type LevelNode,
} from "@/lib/companion/presets";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

export type { CompanionProfile, LevelNode };
export type { CharacterId } from "@/lib/companion/presets";

export const COMPANION_STORE_NAME = "keyboo-companion-store";

/** 皮肤 id:2D 经典 / 3D 原型 / 道童 / 柯基实验 / 自定义图片 */
export type SkinId = "blob" | "blob3d" | "daotong" | "corgi" | "custom";

const CONFIG_KEY = "companion-config";
const STATS_KEY = "companion-stats";

// onKeyPress 内部复用的鼠标/滚轮/拖拽虚拟键:计入总按键,不计入字数
const MOUSE_VIRTUAL = new Set(["Left", "Right", "Middle", "Other", "ScrollUp", "ScrollDown", "Drag"]);

/** 校验/修正等级表:首档归零、单调递增、数值清洗;非法输入回退键啵预设 */
export function normalizeLevels(input: unknown, fallbackTitle = "键啵"): LevelNode[] {
  if (!Array.isArray(input) || input.length === 0) return presetProfileOf("jianbo").levels;
  const raw = input
    .map((n) => ({
      title: typeof n?.title === "string" && n.title.trim() ? n.title.trim() : fallbackTitle,
      chars: typeof n?.chars === "number" && Number.isFinite(n.chars) ? Math.max(0, Math.round(n.chars)) : 0,
    }))
    .slice(0, 99);
  raw[0].chars = 0;
  for (let i = 1; i < raw.length; i++) {
    // 单调递增:后档至少比前档多 1,防止乱序配置让等级跳变
    if (raw[i].chars <= raw[i - 1].chars) raw[i].chars = raw[i - 1].chars + 1;
  }
  return raw;
}

/** 旧版完整默认称号自动跟随产品升级；任一称号被用户改过就视为自定义，不迁移。 */
function migrateLegacyPresetTitles(id: CharacterId, levels: LevelNode[]): LevelNode[] {
  if (
    id !== "jianbo" ||
    levels.length !== LEGACY_JIANBO_LEVEL_TITLES.length ||
    !levels.every((level, index) => level.title === LEGACY_JIANBO_LEVEL_TITLES[index])
  ) {
    return levels;
  }
  const current = presetProfileOf("jianbo").levels;
  return levels.map((level, index) => ({ ...level, title: current[index].title }));
}

/** 当前生效档案:当前角色的用户改动 ?? 该角色内置预设 */
export const profileOf = (config: Pick<CompanionConfig, "character" | "profiles">): CompanionProfile =>
  config.profiles[config.character] ?? presetProfileOf(config.character);

export interface CompanionConfig {
  enabled: boolean;
  /** 皮肤:blob = 2D 经典,blob3d = 3D 原型,daotong = 道童,corgi = 柯基实验,custom = 自定义图片 */
  skin: SkinId;
  size: number;
  showLevel: boolean;
  /** 等级称号距头顶的垂直距离(px,越大离头顶越远) */
  levelOffsetY: number;
  /** 拖拽后的位置(CSS 像素,容器左上角相对窗口);null = 默认右下角 */
  pos: [number, number] | null;
  /** 敲键反馈:+1 气泡与 Q 弹(跟随真实打字,默认开;关闭仅静默计数) */
  typingFeedback: boolean;
  /** Q 弹物理:左键按住拖动时果冻拉伸+松手回弹 */
  physics: boolean;
  /** 软体物理参数(刚度/阻尼/影响半径/限幅等,见 softbody/core) */
  physicsParams: PhysicsParams;
  /** 当前角色(决定生效档案与主题文案);选皮肤时随之切换(custom 不切换) */
  character: CharacterId;
  /** 各角色的用户自定义档案(未改动的角色缺省,取内置预设) */
  profiles: Partial<Record<CharacterId, CompanionProfile>>;
  /** 自定义形象图片完整路径($APPDATA/companions/ 内);null = 未导入 */
  customSkinFile: string | null;
}

export interface CompanionStats {
  /** 全局按键总数(物理按键,不分角色) */
  totalKeys: number;
  todayKeys: number;
  todayDate: string;
  /** 每角色累计字数(经验),键 = 角色 id;缺省按 0 计 */
  chars: Partial<Record<CharacterId, number>>;
  /** 每角色今日字数 */
  todayChars: Partial<Record<CharacterId, number>>;
}

/** 当前角色的累计字数(经验) */
export const charsOf = (stats: CompanionStats, character: CharacterId) => stats.chars[character] ?? 0;
/** 当前角色的今日字数 */
export const todayCharsOf = (stats: CompanionStats, character: CharacterId) => stats.todayChars[character] ?? 0;

/** 升到 level 级所需累计字数:表内查配置;超出表长按档案的 extrapolation 线性增量外推
 *  (经验收入是线性的,后期增量必须线性递增而非几何增长,否则每级耗时指数爆炸、曲线死尾) */
export function thresholdOf(level: number, profile: CompanionProfile): number {
  const { levels, extrapolation } = profile;
  const n = levels.length;
  if (level <= n) return levels[Math.max(1, level) - 1].chars;
  let t = levels[n - 1].chars;
  for (let k = 1; k <= level - n; k++) {
    t += extrapolation.base + extrapolation.step * (k - 1);
  }
  return t;
}

/** 当前等级:表内线性查找;超出表长走外推(线性增量,循环次数极少) */
export function levelOf(chars: number, profile: CompanionProfile): number {
  const { levels, extrapolation } = profile;
  for (let i = 1; i < levels.length; i++) {
    if (chars < levels[i].chars) return i;
  }
  let level = levels.length;
  let t = levels[levels.length - 1].chars;
  for (let k = 1; k <= 998; k++) {
    t += extrapolation.base + extrapolation.step * (k - 1);
    if (chars < t) return level;
    level++;
  }
  return level;
}

export const titleOf = (level: number, levels: LevelNode[]) =>
  levels[Math.min(Math.max(1, level), levels.length) - 1].title;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const defaultConfig = (): CompanionConfig => ({
  enabled: true,
  skin: "blob",
  size: 96,
  showLevel: true,
  levelOffsetY: 4,
  pos: null,
  typingFeedback: true,
  physics: true,
  physicsParams: { ...DEFAULT_PHYSICS },
  character: "jianbo",
  profiles: {},
  customSkinFile: null,
});
const defaultStats = (): CompanionStats => ({
  totalKeys: 0,
  todayKeys: 0,
  todayDate: todayStr(),
  chars: {},
  todayChars: {},
});

interface CompanionRuntime {
  /** 每敲一个字符 +1,驱动 +1 气泡与弹跳 */
  charPulse: number;
  /** 升级时 +1,驱动升级动画 */
  levelUpPulse: number;
}

interface CompanionActions {
  setConfig: (config: Partial<CompanionConfig>) => void;
  registerKey: (name: string) => void;
  resetStats: () => void;
}

export type CompanionStore = { config: CompanionConfig; stats: CompanionStats } & CompanionRuntime & CompanionActions;

export const useCompanionStore = create<CompanionStore>()((set) => ({
  config: defaultConfig(),
  stats: defaultStats(),
  charPulse: 0,
  levelUpPulse: 0,

  setConfig: (config) => {
    set((s) => ({ config: { ...s.config, ...config } }));
    void saveConfig();
  },

  // 真实新按下即计数(信号解耦:挂载在 useEventStore.onKeyPress 显示过滤之前;
  // 字数仍排除修饰键与鼠标虚拟键,总按键含鼠标点击)
  registerKey: (name) => {
    set((s) => {
      const today = todayStr();
      const base =
        s.stats.todayDate === today
          ? s.stats
          : { ...s.stats, todayKeys: 0, todayChars: {}, todayDate: today };
      const isChar = !MODIFIERS.has(name) && !MOUSE_VIRTUAL.has(name);
      const character = s.config.character;
      const prev = base.chars[character] ?? 0;
      const totalChars = prev + (isChar ? 1 : 0);
      const profile = profileOf(s.config);
      const levelUp = isChar && levelOf(totalChars, profile) > levelOf(prev, profile);
      return {
        stats: {
          totalKeys: base.totalKeys + 1,
          todayKeys: base.todayKeys + 1,
          todayDate: today,
          chars: { ...base.chars, [character]: totalChars },
          todayChars: {
            ...base.todayChars,
            [character]: (base.todayChars[character] ?? 0) + (isChar ? 1 : 0),
          },
        },
        charPulse: isChar ? s.charPulse + 1 : s.charPulse,
        levelUpPulse: levelUp ? s.levelUpPulse + 1 : s.levelUpPulse,
      };
    });
    saveStatsDebounced();
  },

  resetStats: () => {
    set({ stats: defaultStats() });
    void saveStatsNow();
  },
}));

// ─── 持久化:keyboo.json 内两个独立条目 ───

let storePromise: ReturnType<typeof load> | null = null;
const getStore = () => (storePromise ??= load("keyboo.json", { autoSave: false, defaults: {} }));

/** 启动时读盘;设置窗口打开时也调一次以拿最新统计 */
export async function loadCompanionPersist() {
  const store = await getStore();
  const [config, stats] = await Promise.all([
    store.get<Partial<CompanionConfig>>(CONFIG_KEY),
    store.get<Partial<CompanionStats>>(STATS_KEY),
  ]);
  const patch: Partial<CompanionStore> = {};
  if (config) {
    const def = defaultConfig();
    // 旧存档兼容(三代格式):
    // - 最老格式 profile = { name, titles, levelBase }(公式曲线)→ 等级表 chars = base×i²
    // - 单档案格式 profile = { name, levels } → 归入角色「键啵」
    // - 新格式 character + profiles(每角色独立档案)→ 逐角色校验修正
    const rawConfig = config as Partial<CompanionConfig> & {
      profile?: Partial<CompanionProfile> & { titles?: string[]; levelBase?: number };
    };
    const { profile: _legacyProfile, profiles: _rawProfiles, character: _rawCharacter, ...restConfig } = rawConfig;
    const character: CharacterId =
      rawConfig.character === "daotong" ? "daotong" : rawConfig.character === "corgi" ? "corgi" : "jianbo";
    const profiles: Partial<Record<CharacterId, CompanionProfile>> = {};
    /** 兼容最老格式(titles + levelBase 公式曲线)的档案入参类型 */
    type LegacyProfile = Partial<CompanionProfile> & { titles?: string[]; levelBase?: number };
    const normalizeProfile = (id: CharacterId, raw: LegacyProfile | undefined) => {
      if (!raw) return;
      const preset = CHARACTERS[id].profile;
      const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : preset.name;
      const extr = raw.extrapolation;
      const extrapolation = {
        base:
          typeof extr?.base === "number" && Number.isFinite(extr.base) && extr.base > 0
            ? Math.round(extr.base)
            : preset.extrapolation.base,
        step:
          typeof extr?.step === "number" && Number.isFinite(extr.step) && extr.step >= 0
            ? Math.round(extr.step)
            : preset.extrapolation.step,
      };
      if (Array.isArray(raw.levels)) {
        const levels = migrateLegacyPresetTitles(id, normalizeLevels(raw.levels, preset.name));
        profiles[id] = { name, levels, extrapolation };
      } else if (Array.isArray(raw.titles) && raw.titles.length > 0) {
        const base = typeof raw.levelBase === "number" ? raw.levelBase : 150;
        const levels = migrateLegacyPresetTitles(
          id,
          normalizeLevels(raw.titles.map((t, i) => ({ title: t, chars: base * i * i })), preset.name),
        );
        profiles[id] = {
          name,
          levels,
          extrapolation,
        };
      }
    };
    if (rawConfig.profiles) {
      for (const id of Object.keys(CHARACTERS) as CharacterId[]) normalizeProfile(id, rawConfig.profiles[id]);
    } else {
      normalizeProfile("jianbo", rawConfig.profile); // 单档案存档归键啵
    }
    patch.config = {
      ...def,
      ...restConfig,
      // 旧存档兼容:skin 非法值回退(custom 仅在已导入图片时有效);physicsParams 深合并(新参数取默认)
      skin:
        restConfig.skin === "blob3d" ? "blob3d"
        : restConfig.skin === "daotong" ? "daotong"
        : restConfig.skin === "corgi" ? "corgi"
        : restConfig.skin === "custom" && restConfig.customSkinFile ? "custom"
        : "blob",
      physicsParams: { ...def.physicsParams, ...(restConfig.physicsParams ?? {}) },
      character,
      profiles,
    };
  }
  if (stats) {
    const def = defaultStats();
    // 旧存档兼容:旧版 totalChars/todayChars 是单值(number,全局一份),
    // 迁移为按角色分账(归入键啵);新版是 Record(chars/todayChars)。
    const legacy = stats as Partial<CompanionStats> & { totalChars?: number };
    const todayRaw = stats.todayChars as unknown;
    const legacyToday = typeof todayRaw === "number" ? todayRaw : undefined;
    const todayMap = !!todayRaw && typeof todayRaw === "object" ? (stats.todayChars as CompanionStats["todayChars"]) : undefined;
    patch.stats = {
      ...def,
      totalKeys: legacy.totalKeys ?? def.totalKeys,
      todayKeys: legacy.todayKeys ?? def.todayKeys,
      todayDate: legacy.todayDate ?? def.todayDate,
      chars: legacy.chars ?? (typeof legacy.totalChars === "number" ? { jianbo: legacy.totalChars } : {}),
      todayChars: todayMap ?? (legacyToday !== undefined ? { jianbo: legacyToday } : {}),
    };
  }
  useCompanionStore.setState(patch);

  // 跨天滚动
  const s = useCompanionStore.getState();
  if (s.stats.todayDate !== todayStr()) {
    useCompanionStore.setState({
      stats: { ...s.stats, todayKeys: 0, todayChars: {}, todayDate: todayStr() },
    });
  }
}

async function saveConfig() {
  const store = await getStore();
  await store.set(CONFIG_KEY, useCompanionStore.getState().config);
  await store.save();
}

let saveTimer: number | null = null;
function saveStatsDebounced() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveStatsNow();
  }, 1500);
}

async function saveStatsNow() {
  const store = await getStore();
  await store.set(STATS_KEY, useCompanionStore.getState().stats);
  await store.save();
}
