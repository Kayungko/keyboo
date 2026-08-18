// 打字伙伴 store:配置 + 累计统计 + 运行时动画脉冲
//
// 持久化策略(与 style/event store 不同):
// - 统计的计数方是覆盖层窗口(事件只在那里消费),而 keybooStorage 只允许设置窗口写盘,
//   因此这里不走 zustand persist,直接用 plugin-store 两个独立条目:
//   companion-config(双窗口可写,低频)、companion-stats(覆盖层防抖写 / 设置页重置时写)。
// - 条目分离避免双窗口互相覆盖:设置页改配置不会把旧统计写回。
//
// 双窗口同步:配置走 sync.ts(设置页 startSyncSender),统计重置同样经 sync 通知覆盖层。

import { MODIFIERS } from "@/lib/types";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

export const COMPANION_STORE_NAME = "keyboo-companion-store";

const CONFIG_KEY = "companion-config";
const STATS_KEY = "companion-stats";

// onKeyPress 内部复用的鼠标/滚轮/拖拽虚拟键:计入总按键,不计入字数
const MOUSE_VIRTUAL = new Set(["Left", "Right", "Middle", "Other", "ScrollUp", "ScrollDown", "Drag"]);

export interface CompanionConfig {
  enabled: boolean;
  /** 皮肤:预留扩展位,当前仅黑白小团子 */
  skin: "blob";
  size: number;
  showLevel: boolean;
}

export interface CompanionStats {
  totalKeys: number;
  totalChars: number;
  todayKeys: number;
  todayChars: number;
  todayDate: string;
}

// 等级曲线:level n 起点为 150*(n-1)^2 字(0/150/600/1350/…)
export const levelOf = (chars: number) => Math.floor(Math.sqrt(Math.max(0, chars) / 150)) + 1;

const TITLES = ["见习键啵", "练习键啵", "熟练键啵", "资深键啵", "精英键啵", "大师键啵", "传奇键啵", "键啵宗师"];
export const titleOf = (level: number) => TITLES[Math.min(level - 1, TITLES.length - 1)];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const defaultConfig = (): CompanionConfig => ({ enabled: true, skin: "blob", size: 96, showLevel: true });
const defaultStats = (): CompanionStats => ({
  totalKeys: 0,
  totalChars: 0,
  todayKeys: 0,
  todayChars: 0,
  todayDate: todayStr(),
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

  // 真实新按下且通过过滤才计数(挂载点在 useEventStore.onKeyPress)
  registerKey: (name) => {
    set((s) => {
      const today = todayStr();
      const base =
        s.stats.todayDate === today
          ? s.stats
          : { ...s.stats, todayKeys: 0, todayChars: 0, todayDate: today };
      const isChar = !MODIFIERS.has(name) && !MOUSE_VIRTUAL.has(name);
      const totalChars = base.totalChars + (isChar ? 1 : 0);
      const levelUp = isChar && levelOf(totalChars) > levelOf(base.totalChars);
      return {
        stats: {
          totalKeys: base.totalKeys + 1,
          totalChars,
          todayKeys: base.todayKeys + 1,
          todayChars: base.todayChars + (isChar ? 1 : 0),
          todayDate: today,
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
  if (config) patch.config = { ...defaultConfig(), ...config };
  if (stats) patch.stats = { ...defaultStats(), ...stats };
  useCompanionStore.setState(patch);

  // 跨天滚动
  const s = useCompanionStore.getState();
  if (s.stats.todayDate !== todayStr()) {
    useCompanionStore.setState({
      stats: { ...s.stats, todayKeys: 0, todayChars: 0, todayDate: todayStr() },
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
