import { BlobSvg } from "@/components/BlobSvg";
import { CorgiSvg } from "@/components/CorgiSvg";
import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemGrid, ItemTitle, NumberField, Switch } from "@/components/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { HappyIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import daotongUrl from "@/assets/daotong.svg";
import { cn } from "@/lib/utils";
import { CHARACTERS, SKIN_CHARACTER } from "@/lib/companion/presets";
import { DEFAULT_PHYSICS, PHYSICS_LIMITS, type PhysicsParams } from "@/lib/softbody/core";
import { useStyleStore } from "@/stores/useStyleStore";
import {
  charsOf,
  levelOf,
  loadCompanionPersist,
  profileOf,
  thresholdOf,
  titleOf,
  todayCharsOf,
  useCompanionStore,
  type CompanionProfile,
  type LevelNode,
  type SkinId,
} from "@/stores/useCompanionStore";

export const CompanionSettings = () => {
  const config = useCompanionStore((state) => state.config);
  const setConfig = useCompanionStore((state) => state.setConfig);
  const stats = useCompanionStore((state) => state.stats);
  const resetStats = useCompanionStore((state) => state.resetStats);

  // 统计由覆盖层窗口写盘,设置窗口打开时读一次最新值
  useEffect(() => {
    void loadCompanionPersist();
  }, []);

  const character = CHARACTERS[config.character];
  const profile = profileOf(config);
  const level = levelOf(charsOf(stats, config.character), profile);
  const title = titleOf(level, profile.levels);
  // 实验性形象(3D 原型)仅总实验性开关开启时显示入口
  const experimental = useStyleStore((state) => state.experimental);

  const setParam = (key: keyof PhysicsParams, value: number) =>
    setConfig({ physicsParams: { ...config.physicsParams, [key]: value } });
  // 档案编辑记在当前角色名下(各角色进度独立保存,互不覆盖)
  const setProfile = (p: CompanionProfile) =>
    setConfig({ profiles: { ...config.profiles, [config.character]: p } });
  // 恢复默认 = 清除当前角色的自定义改动,回落到内置预设
  const resetProfile = () => {
    const profiles = { ...config.profiles };
    delete profiles[config.character];
    setConfig({ profiles });
  };
  // 切皮肤:有归属角色的皮肤随之切换角色与档案;custom 只换渲染,沿用当前角色
  const selectSkin = (skin: SkinId) => {
    const next = SKIN_CHARACTER[skin];
    setConfig(next ? { skin, character: next } : { skin });
  };

  // ─── 自定义形象:导入 / 移除 ───
  const importCustomSkin = async () => {
    const path = await open({
      multiple: false,
      title: "选择伙伴形象图片",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
    });
    if (!path || typeof path !== "string") return;
    try {
      const dest = await invoke<string>("import_companion_image", { path });
      setConfig({ customSkinFile: dest, skin: "custom" });
      toast.success("自定义形象已导入");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const removeCustomSkin = async () => {
    try {
      await invoke("remove_companion_image");
    } catch {
      // 文件删除失败不阻塞配置清理
    }
    setConfig({ customSkinFile: null, skin: config.skin === "custom" ? "blob" : config.skin });
    toast.success("已移除自定义形象");
  };

  // ─── 等级表编辑(称号 + 升级字数) ───
  const setLevelAt = (i: number, patch: Partial<LevelNode>) =>
    setProfile({ ...profile, levels: profile.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  // 新增档位:字数默认用表外外推值,给一个合理建议
  const addLevel = () =>
    setProfile({
      ...profile,
      levels: [...profile.levels, { title: "", chars: thresholdOf(profile.levels.length + 1, profile) }],
    });
  const removeLevelAt = (i: number) => {
    if (i === 0 || profile.levels.length <= 1) return;
    setProfile({ ...profile, levels: profile.levels.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">伙伴</h1>

      <h2 className="text-sm font-medium text-muted-foreground">打字伙伴</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={HappyIcon} size="1em" /> 启用伙伴
          </ItemTitle>
          <ItemDescription>桌面右下角的 {profile.name},{character.tagline}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={config.enabled} onChange={(enabled) => setConfig({ enabled })} />
        </ItemActions>
      </Item>

      <div className={cn("flex flex-col gap-3", !config.enabled && "pointer-events-none opacity-50")}>
        {/* ─── 形象选择(格子列表,后期扩展新形象在此注册);内置形象各带独立成长体系 ─── */}
        <Item variant="muted" className="flex-col items-stretch">
          <ItemContent>
            <ItemTitle>形象</ItemTitle>
            <ItemDescription>选择伙伴的形象与渲染方式;每个内置角色有独立的等级体系,进度各自保存</ItemDescription>
          </ItemContent>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <SkinCard
              selected={config.skin === "blob"}
              label="汤圆 · 2D 经典"
              onClick={() => selectSkin("blob")}
            >
              <BlobSvg />
            </SkinCard>
            {experimental && (
              <>
                <SkinCard
                  selected={config.skin === "blob3d"}
                  label="汤圆 · 3D 原型"
                  hint="实验性"
                  onClick={() => selectSkin("blob3d")}
                >
                  <BlobSvg />
                </SkinCard>
                <SkinCard
                  selected={config.skin === "corgi"}
                  label="柯基 · 毛发实验"
                  hint="实验性"
                  onClick={() => selectSkin("corgi")}
                >
                  <CorgiSvg />
                </SkinCard>
              </>
            )}
            <SkinCard
              selected={config.skin === "daotong"}
              label="道童 · 修仙"
              onClick={() => selectSkin("daotong")}
            >
              <img src={daotongUrl} alt="道童" className="max-h-full max-w-full object-contain" draggable={false} />
            </SkinCard>
            {config.customSkinFile ? (
              <SkinCard
                selected={config.skin === "custom"}
                label="自定义"
                onClick={() => selectSkin("custom")}
                onDelete={removeCustomSkin}
              >
                <img
                  src={convertFileSrc(config.customSkinFile)}
                  alt="自定义形象"
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              </SkinCard>
            ) : (
              <button
                type="button"
                onClick={importCustomSkin}
                className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                <span className="text-xl leading-none">＋</span>
                <span className="text-xs">导入图片</span>
              </button>
            )}
          </div>
          {config.skin === "custom" && (
            <ItemDescription className="mt-2">
              自定义形象支持 Q 弹拉拽与全身小动作,沿用当前角色的成长体系;局部五官动画仅分层 SVG 角色有
            </ItemDescription>
          )}
        </Item>

        <ItemGrid>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>大小</ItemTitle>
            </ItemContent>
            <ItemActions>
              <NumberField
                className="w-32"
                value={config.size}
                onChange={(size) => setConfig({ size })}
                min={64}
                max={160}
                step={8}
              />
            </ItemActions>
          </Item>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>等级称号</ItemTitle>
              <ItemDescription>头顶显示等级与称号</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch checked={config.showLevel} onChange={(showLevel) => setConfig({ showLevel })} />
            </ItemActions>
          </Item>
        </ItemGrid>
        {config.showLevel && (
          <div className="rounded-xl border border-transparent bg-secondary px-4 py-3">
            <ParamSlider
              label="距头顶距离"
              hint="称号与头顶的垂直间距,负值下移贴近/叠到本体"
              value={config.levelOffsetY}
              min={-48}
              max={48}
              step={1}
              format={(v) => `${v}px`}
              onChange={(levelOffsetY) => setConfig({ levelOffsetY })}
            />
          </div>
        )}
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Q 弹物理</ItemTitle>
            <ItemDescription>左键按住拖动时果冻拉伸,松手回弹</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch checked={config.physics} onChange={(physics) => setConfig({ physics })} />
          </ItemActions>
        </Item>

        {/* 高级物理参数(折叠):软体核心层参数,对所有皮肤生效 */}
        <div className={config.physics ? "" : "pointer-events-none opacity-50"}>
          <div className="rounded-xl border border-transparent bg-secondary px-4 py-3">
            <Collapsible>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-4">
                  <ItemContent>
                    <ItemTitle>高级物理参数</ItemTitle>
                    <ItemDescription>刚度 / 阻尼 / 影响半径 / 拉伸限幅等,实时生效</ItemDescription>
                  </ItemContent>
                  <span className="text-xs text-muted-foreground">▾</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-3 pt-4">
                  <ParamSlider
                    label="刚度"
                    hint="回弹快慢"
                    value={config.physicsParams.stiffness}
                    {...PHYSICS_LIMITS.stiffness}
                    format={(v) => v.toFixed(0)}
                    onChange={(v) => setParam("stiffness", v)}
                  />
                  <ParamSlider
                    label="阻尼"
                    hint="振荡时长"
                    value={config.physicsParams.damping}
                    {...PHYSICS_LIMITS.damping}
                    format={(v) => v.toFixed(1)}
                    onChange={(v) => setParam("damping", v)}
                  />
                  <ParamSlider
                    label="影响半径"
                    hint="拉伸波及范围"
                    value={config.physicsParams.sigma}
                    {...PHYSICS_LIMITS.sigma}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => setParam("sigma", v)}
                  />
                  <ParamSlider
                    label="最大拉伸"
                    hint="限幅,防裁切"
                    value={config.physicsParams.maxStretch}
                    {...PHYSICS_LIMITS.maxStretch}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setParam("maxStretch", v)}
                  />
                  <ParamSlider
                    label="面积守恒"
                    hint="果冻收缩感"
                    value={config.physicsParams.squash}
                    {...PHYSICS_LIMITS.squash}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setParam("squash", v)}
                  />
                  <ParamSlider
                    label="鼓起"
                    hint="3D 皮肤隆起"
                    value={config.physicsParams.bulge}
                    {...PHYSICS_LIMITS.bulge}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setParam("bulge", v)}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfig({ physicsParams: { ...DEFAULT_PHYSICS } })}
                    >
                      恢复默认
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <Item variant="muted">
          <ItemContent>
            <ItemTitle>位置</ItemTitle>
            <ItemDescription>在桌面上直接拖拽伙伴即可移动</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" disabled={config.pos === null} onClick={() => setConfig({ pos: null })}>
              回到默认位置
            </Button>
          </ItemActions>
        </Item>

        {/* ─── 自定义伙伴:名称 / 等级要求 / 称号表(低频,收纳) ─── */}
        <Collapsible>
          <CollapsibleTrigger className="mt-2 flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">自定义伙伴</div>
            <span className="text-xs text-muted-foreground">▾</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 pt-3">
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>名称</ItemTitle>
            <ItemDescription>气泡与展示中显示的伙伴名</ItemDescription>
          </ItemContent>
          <ItemActions>
            <input
              value={profile.name}
              maxLength={12}
              placeholder={character.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
            />
          </ItemActions>
        </Item>
        <Item variant="muted" className="flex-col items-stretch">
          <div className="flex items-center gap-4">
            <ItemContent>
              <ItemTitle>等级称号与升级要求</ItemTitle>
              <ItemDescription>每档 = 称号 + 升到该级的累计字数;超出表长的等级沿用最后称号,字数按该角色的曲线外推</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="ghost" size="sm" onClick={addLevel}>＋ 加一级</Button>
              <Button variant="ghost" size="sm" onClick={resetProfile}>
                恢复默认
              </Button>
            </ItemActions>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {profile.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">Lv.{i + 1}</span>
                <input
                  value={l.title}
                  maxLength={12}
                  placeholder={`第 ${i + 1} 级称号`}
                  onChange={(e) => setLevelAt(i, { title: e.target.value })}
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                />
                <NumberField
                  className="w-36"
                  value={l.chars}
                  onChange={(chars) => setLevelAt(i, { chars })}
                  min={0}
                  max={10000000}
                  step={500}
                  disabled={i === 0}
                />
                <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => removeLevelAt(i)}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <ItemDescription className="mt-2">
            当前:Lv.{level} {title} · 升级还需 {Math.max(0, thresholdOf(level + 1, profile) - charsOf(stats, config.character))} {character.unit}
          </ItemDescription>
        </Item>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* 成长统计(收纳):收起时标题带当前等级,一眼可见 */}
      <Collapsible>
        <CollapsibleTrigger className="mt-2 flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            成长统计
            <span className="ml-2 font-normal">Lv.{level} {title}</span>
          </div>
          <span className="text-xs text-muted-foreground">▾</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 pt-3">
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>当前等级</ItemTitle>
        </ItemContent>
        <ItemActions>
          <span className="text-sm font-medium">
            Lv.{level} {title}
          </span>
        </ItemActions>
      </Item>
      <ItemGrid>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>今日按键</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{stats.todayKeys}</span>
          </ItemActions>
        </Item>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>今日{character.unit}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{todayCharsOf(stats, config.character)}</span>
          </ItemActions>
        </Item>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>总按键</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{stats.totalKeys}</span>
          </ItemActions>
        </Item>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>总{character.unit}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{charsOf(stats, config.character)}</span>
          </ItemActions>
        </Item>
      </ItemGrid>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>重置统计</ItemTitle>
          <ItemDescription>清空全部累计与今日数据,等级回到 Lv.1</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm" onClick={resetStats}>
            <HugeiconsIcon icon={Refresh01Icon} className="mr-2" /> 重置
          </Button>
        </ItemActions>
      </Item>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

// 形象格子卡片:预览缩略图 + 名称 + 选中态(后期新增形象按此形态扩展)
function SkinCard({ selected, label, hint, onClick, onDelete, children }: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors",
        selected
          ? "border-foreground bg-accent"
          : "border-transparent bg-secondary hover:bg-accent/70",
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden">{children}</div>
      <div className="text-xs font-medium">
        {label}
        {hint && <span className="ml-1 text-[10px] text-muted-foreground">({hint})</span>}
      </div>
      {onDelete && (
        <span
          role="button"
          aria-label="移除自定义形象"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1.5 top-1.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-[10px] text-white group-hover:flex"
        >
          ✕
        </span>
      )}
    </button>
  );
}

// 单行参数滑块:标签 + 滑杆 + 数值
function ParamSlider({ label, hint, value, min, max, step, format, onChange }: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <Slider
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">{format(value)}</span>
    </div>
  );
}
