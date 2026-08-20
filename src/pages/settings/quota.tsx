// 设置页「AI 额度」页签:总开关 / 进度条形态四选 / 辉光与低额脉冲 / 轮询间隔 /
// 数据源列表(apikey 填 key + 预算 + 测试连接;local 读本机登录态;placeholder 即将支持)。
//
// loaded 守卫:loadQuotaPersist 完成前整页禁用,防默认值首帧经 setConfig 冲掉 apiKey 存档。

import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemTitle, NumberField, Switch } from "@/components/ui";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PROVIDERS, QUERY, type ProviderMeta } from "@/lib/quota/providers";
import { loadQuotaPersist, useQuotaStore, type QuotaAppearance, type QuotaPosition, type QuotaStyle } from "@/stores/useQuotaStore";
import { BatteryCharging01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const QuotaSettings = () => {
  const config = useQuotaStore((s) => s.config);
  const setConfig = useQuotaStore((s) => s.setConfig);
  const setProvider = useQuotaStore((s) => s.setProvider);
  const loaded = useQuotaStore((s) => s.loaded);
  const [testing, setTesting] = useState<string | null>(null);

  // 设置窗口打开时读一次盘(防默认值覆盖存档)
  useEffect(() => {
    void loadQuotaPersist();
  }, []);

  // 展示分组:真实数据源 → 即将支持
  const order: Record<ProviderMeta["kind"], number> = { apikey: 0, local: 1, placeholder: 2 };
  const sorted = [...PROVIDERS].sort((a, b) => order[a.kind] - order[b.kind]);

  const testConnection = async (meta: ProviderMeta) => {
    const cfg = config.providers.find((p) => p.id === meta.id);
    if (!cfg) return;
    if (!cfg.apiKey) {
      toast.error("请先填写 API Key");
      return;
    }
    setTesting(meta.id);
    try {
      const reading = await QUERY[meta.id](cfg);
      toast.success(`${meta.name} 连接成功:${reading.label}`);
    } catch (e) {
      toast.error(`${meta.name} 连接失败:${e instanceof Error ? e.message : e}`);
    } finally {
      setTesting(null);
    }
  };

  const appearance = config.appearance;
  const setAppearance = (patch: Partial<QuotaAppearance>) =>
    setConfig({ appearance: { ...appearance, ...patch } });

  return (
    <div className={cn("flex flex-col gap-y-4 p-6", !loaded && "pointer-events-none opacity-50")}>
      <h1 className="text-xl font-semibold">AI 额度</h1>

      <h2 className="text-sm font-medium text-muted-foreground">额度监控</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={BatteryCharging01Icon} size="1em" /> 启用额度监控
          </ItemTitle>
          <ItemDescription>在伙伴旁显示 AI 账号额度进度条,剩余多少一眼可见</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={config.enabled} onChange={(enabled) => setConfig({ enabled })} />
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>进度条形态</ItemTitle>
          <ItemDescription>EQ 拾音条会随敲键跳动;信号灯只报状态不读数字</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ToggleGroup value={config.style} onValueChange={(v) => setConfig({ style: v as QuotaStyle })}>
            <ToggleGroupItem value="eq">EQ 拾音条</ToggleGroupItem>
            <ToggleGroupItem value="vu">VU 分段</ToggleGroupItem>
            <ToggleGroupItem value="lights">信号灯</ToggleGroupItem>
            <ToggleGroupItem value="dots">圆点</ToggleGroupItem>
          </ToggleGroup>
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>悬挂位置</ItemTitle>
          <ItemDescription>自动 = 伙伴贴屏幕底边时翻到头顶,避免被任务栏裁掉</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ToggleGroup value={config.position} onValueChange={(v) => setConfig({ position: v as QuotaPosition })}>
            <ToggleGroupItem value="auto">自动</ToggleGroupItem>
            <ToggleGroupItem value="bottom">脚边</ToggleGroupItem>
            <ToggleGroupItem value="top">头顶</ToggleGroupItem>
            <ToggleGroupItem value="side">侧边</ToggleGroupItem>
          </ToggleGroup>
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>位置微调(像素)</ItemTitle>
          <ItemDescription>相对默认悬挂位置的偏移,支持负数;X 右移为正,Y 下移为正</ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            X
            <NumberField value={config.offsetX} onChange={(offsetX) => setConfig({ offsetX })} min={-2000} max={2000} />
            Y
            <NumberField value={config.offsetY} onChange={(offsetY) => setConfig({ offsetY })} min={-2000} max={2000} />
          </div>
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>背景尺寸</ItemTitle>
          <ItemDescription>玻璃舱容器与内边距缩放,0.5 ~ 2.0 倍</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField value={config.podScale} onChange={(podScale) => setConfig({ podScale })} min={0.5} max={2} step={0.1} />
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>进度条尺寸</ItemTitle>
          <ItemDescription>条本体(柱 / 段 / 圆点)缩放,0.5 ~ 2.0 倍</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField value={config.barScale} onChange={(barScale) => setConfig({ barScale })} min={0.5} max={2} step={0.1} />
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>LED 辉光</ItemTitle>
          <ItemDescription>进度条发光,暗色壁纸下更醒目</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={config.glow} onChange={(glow) => setConfig({ glow })} />
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>低额度呼吸警示</ItemTitle>
          <ItemDescription>剩余低于 20% 时转红并呼吸闪烁</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={config.pulse} onChange={(pulse) => setConfig({ pulse })} />
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>轮询间隔(分钟)</ItemTitle>
          <ItemDescription>定时查询各账号额度,失败自动沿用上次结果</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField value={config.refreshMin} onChange={(refreshMin) => setConfig({ refreshMin })} min={1} max={1440} />
        </ItemActions>
      </Item>

      <h2 className="text-sm font-medium text-muted-foreground">外观</h2>

      <Item>
        <ItemContent>
          <ItemTitle>背景</ItemTitle>
          <ItemDescription>玻璃舱底色与不透明度</ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={appearance.bgColor}
              onChange={(e) => setAppearance({ bgColor: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
              title="背景色"
            />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              透明
              <NumberField value={appearance.bgOpacity} onChange={(bgOpacity) => setAppearance({ bgOpacity })} min={0} max={1} step={0.05} />
            </div>
          </div>
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>警告级别颜色</ItemTitle>
          <ItemDescription>颜色只表示额度状态,不区分账号:健康 &gt;50% / 紧张 20–50% / 告急 &lt;20%</ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                value={appearance.colorOk}
                onChange={(e) => setAppearance({ colorOk: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              健康
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                value={appearance.colorWarn}
                onChange={(e) => setAppearance({ colorWarn: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              紧张
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                value={appearance.colorLow}
                onChange={(e) => setAppearance({ colorLow: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              告急
            </label>
          </div>
        </ItemActions>
      </Item>

      <Item>
        <ItemContent>
          <ItemTitle>辉光</ItemTitle>
          <ItemDescription>强度决定发光半径;默认跟随警告色,可改为固定色</ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              强度
              <NumberField value={appearance.glowIntensity} onChange={(glowIntensity) => setAppearance({ glowIntensity })} min={0} max={1} step={0.05} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              跟随警告色
              <Switch checked={appearance.glowFollowsLevel} onChange={(glowFollowsLevel) => setAppearance({ glowFollowsLevel })} />
            </label>
            {!appearance.glowFollowsLevel && (
              <input
                type="color"
                value={appearance.glowColor}
                onChange={(e) => setAppearance({ glowColor: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-background p-0.5"
                title="固定辉光色"
              />
            )}
          </div>
        </ItemActions>
      </Item>

      <h2 className="text-sm font-medium text-muted-foreground">数据源</h2>
      {sorted.map((meta) => {
        const cfg = config.providers.find((p) => p.id === meta.id);
        if (!cfg) return null;
        const placeholder = meta.kind === "placeholder";
        return (
          <Item key={meta.id}>
            <ItemContent>
              <ItemTitle>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                {meta.name}
              </ItemTitle>
              <ItemDescription>{meta.hint}</ItemDescription>

              {meta.kind === "apikey" && cfg.enabled && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder={meta.keyPlaceholder ?? "sk-…"}
                      value={cfg.apiKey ?? ""}
                      onChange={(e) => setProvider(meta.id, { apiKey: e.target.value })}
                      className="h-8 flex-1 rounded-lg border border-input bg-background px-2 font-mono text-xs outline-none focus:border-ring"
                    />
                    <Button variant="outline" size="sm" disabled={testing === meta.id} onClick={() => void testConnection(meta)}>
                      {testing === meta.id ? "测试中…" : "测试连接"}
                    </Button>
                  </div>
                  {meta.needsBudget && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      月度预算(余额换算进度的基准)
                      <NumberField
                        value={cfg.budget ?? meta.defaultBudget ?? 100}
                        onChange={(budget) => setProvider(meta.id, { budget })}
                        min={1}
                        max={100000}
                      />
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Key 以明文保存在本机 keyboo.json,请勿在共用电脑上填写</div>
                </div>
              )}

            </ItemContent>
            <ItemActions>
              {placeholder ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">即将支持</span>
              ) : (
                <Switch checked={cfg.enabled} onChange={(enabled) => setProvider(meta.id, { enabled })} />
              )}
            </ItemActions>
          </Item>
        );
      })}
    </div>
  );
};
