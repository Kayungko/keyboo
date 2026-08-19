// 角色预设注册表:每个内置伙伴(角色)一份独立档案——
// 名称 + 等级表(称号 + 累计字数)+ 表外外推 + 主题文案(经验单位 / 敲键气泡 / 标语)。
//
// 曲线节奏统一按数值策划锚点标定(2~3W 字/天,中位 2.5W):首日 3~4 级、首周密集升级、
// 长尾每级耗时线性拉长;各角色只换风味(称号/单位),不改节奏。
// 新增角色:在此注册 + CompanionLayer 的 SKINS 注册渲染器 + 设置页加形象卡。

import type { SkinId } from "@/stores/useCompanionStore";

/** 等级节点:chars = 升到该级所需的累计字数(levels[0].chars 必须为 0) */
export interface LevelNode {
  title: string;
  chars: number;
}

/** 表外长尾外推:超出等级表后每级增量 = base + step×(k-1),线性递增防死尾 */
export interface LevelExtrapolation {
  base: number;
  step: number;
}

/** 伙伴档案:名称 + 等级表 + 外推,均可在设置页按角色自定义 */
export interface CompanionProfile {
  name: string;
  levels: LevelNode[];
  extrapolation: LevelExtrapolation;
}

export type CharacterId = "jianbo" | "daotong";

export interface CharacterPreset {
  id: CharacterId;
  /** 伙伴名称(气泡头、设置页) */
  name: string;
  /** 经验单位文案:统计行与「升级还需 X」用(字数 / 灵气) */
  unit: string;
  /** 敲键上浮气泡文案 */
  floatText: string;
  /** 一句话性格标语(设置页「启用伙伴」描述) */
  tagline: string;
  profile: CompanionProfile;
}

/** 仅用于把旧版内置默认称号迁移到新版；自定义称号不会命中。 */
export const LEGACY_JIANBO_LEVEL_TITLES = [
  "见习键啵",
  "练习键啵",
  "熟练键啵",
  "资深键啵",
  "精英键啵",
  "大师键啵",
  "传奇键啵",
  "键啵宗师",
] as const;

export const CHARACTERS: Record<CharacterId, CharacterPreset> = {
  // 键啵(汤圆):键盘系称号,经验单位 = 字数
  jianbo: {
    id: "jianbo",
    name: "键啵",
    unit: "字数",
    floatText: "+1",
    tagline: "陪你打字、吃经验成长",
    profile: {
      name: "键啵",
      levels: [
        { title: "初醒汤圆", chars: 0 },
        { title: "敲键学徒", chars: 1500 },
        { title: "指尖熟手", chars: 6000 },
        { title: "键盘搭子", chars: 15000 },
        { title: "灵感捕手", chars: 30000 },
        { title: "妙键生花", chars: 60000 },
        { title: "万字行家", chars: 100000 },
        { title: "一代键宗", chars: 160000 },
      ],
      extrapolation: { base: 60000, step: 25000 },
    },
  },
  // 道童:修仙系境界称号,经验单位 = 灵气(敲一个字 = 一缕灵气)。
  // Lv.9~12 的表内数值恰好等于外推公式(base 60000、step 25000)的前四项,
  // 因此表外外推从 base 160000 续接,整条曲线保持线性增量、无断点。
  daotong: {
    id: "daotong",
    name: "道童",
    unit: "灵气",
    floatText: "+1 灵气",
    tagline: "陪你打字、吸纳灵气修仙",
    profile: {
      name: "道童",
      levels: [
        { title: "道童", chars: 0 },
        { title: "引气", chars: 1500 },
        { title: "练气", chars: 6000 },
        { title: "筑基", chars: 15000 },
        { title: "金丹", chars: 30000 },
        { title: "元婴", chars: 60000 },
        { title: "化神", chars: 100000 },
        { title: "飞升", chars: 160000 },
        { title: "地仙", chars: 220000 },
        { title: "天仙", chars: 305000 },
        { title: "金仙", chars: 415000 },
        { title: "大罗", chars: 550000 },
      ],
      extrapolation: { base: 160000, step: 25000 },
    },
  },
};

/** 角色默认档案(深拷贝,可安全写入配置) */
export const presetProfileOf = (id: CharacterId): CompanionProfile => ({
  name: CHARACTERS[id].profile.name,
  levels: CHARACTERS[id].profile.levels.map((l) => ({ ...l })),
  extrapolation: { ...CHARACTERS[id].profile.extrapolation },
});

/** 皮肤 → 所属角色;custom 只换渲染不切换角色(沿用当前角色的成长体系) */
export const SKIN_CHARACTER: Record<SkinId, CharacterId | null> = {
  blob: "jianbo",
  blob3d: "jianbo",
  daotong: "daotong",
  custom: null,
};
