import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemGrid, ItemTitle, NumberField, Switch } from "@/components/ui";
import { HappyIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect } from "react";
import { levelOf, loadCompanionPersist, titleOf, useCompanionStore } from "@/stores/useCompanionStore";

export const CompanionSettings = () => {
  const config = useCompanionStore((state) => state.config);
  const setConfig = useCompanionStore((state) => state.setConfig);
  const stats = useCompanionStore((state) => state.stats);
  const resetStats = useCompanionStore((state) => state.resetStats);

  // 统计由覆盖层窗口写盘,设置窗口打开时读一次最新值
  useEffect(() => {
    void loadCompanionPersist();
  }, []);

  const level = levelOf(stats.totalChars);

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">伙伴</h1>

      <h2 className="text-sm font-medium text-muted-foreground">打字伙伴</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={HappyIcon} size="1em" /> 启用伙伴
          </ItemTitle>
          <ItemDescription>桌面右下角的黑白小团子,陪你打字、吃经验成长</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={config.enabled} onChange={(enabled) => setConfig({ enabled })} />
        </ItemActions>
      </Item>

      <div className={config.enabled ? "" : "pointer-events-none opacity-50"}>
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
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>皮肤</ItemTitle>
            <ItemDescription>黑白小团子(更多皮肤后期扩展)</ItemDescription>
          </ItemContent>
        </Item>
      </div>

      <h2 className="mt-2 text-sm font-medium text-muted-foreground">成长统计</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>当前等级</ItemTitle>
        </ItemContent>
        <ItemActions>
          <span className="text-sm font-medium">
            Lv.{level} {titleOf(level)}
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
            <ItemTitle>今日字数</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{stats.todayChars}</span>
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
            <ItemTitle>总字数</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">{stats.totalChars}</span>
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
  );
};
