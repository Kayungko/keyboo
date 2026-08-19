import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemHeader, ItemTitle, NumberField, Switch } from "@/components/ui";
import { CustomFilter } from "@/components/ui/custom-filter";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ShortcutRecorder } from "@/components/ui/shortcut-recorder";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { useCompanionStore } from "@/stores/useCompanionStore";
import { ArrowHorizontalIcon, ArrowVerticalIcon, FilterHorizontalIcon, FilterIcon, LayerIcon, MagicWand01Icon, ToggleOnIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";

export const GeneralSettings = () => {
  const filter = useEventStore((state) => state.filter);
  const setFilter = useEventStore((state) => state.setFilter);
  const allowedKeys = useEventStore((state) => state.allowedKeys);
  const showEventHistory = useEventStore((state) => state.showEventHistory);
  const setShowEventHistory = useEventStore((state) => state.setShowEventHistory);
  const maxHistory = useEventStore((state) => state.maxHistory);
  const setMaxHistory = useEventStore((state) => state.setMaxHistory);
  const toggleShortcut = useEventStore((state) => state.toggleShortcut);
  const setToggleShortcut = useEventStore((state) => state.setToggleShortcut);

  const flexDirection = useStyleStore((state) => state.appearance.flexDirection);
  const setAppearance = useStyleStore((state) => state.setAppearance);
  const experimental = useStyleStore((state) => state.experimental);
  const setExperimental = useStyleStore((state) => state.setExperimental);

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">常规</h1>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={FilterIcon} size="1em" /> 按键过滤
          </ItemTitle>
          <ItemDescription>
            {filter === "none" && "未启用过滤，显示所有按键"}
            {filter === "modifiers" && "仅显示修饰键与组合键"}
            {filter === "custom" && `已启用自定义过滤，允许显示 ${allowedKeys.length} 个按键`}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {filter === "custom" && (
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" size="icon-sm">
                  <HugeiconsIcon icon={FilterHorizontalIcon} />
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>自定义过滤</DrawerTitle>
                  <DrawerDescription>选择要显示的按键，按住 Ctrl 并点击按键可整组启用或禁用同类按键</DrawerDescription>
                </DrawerHeader>
                <CustomFilter />
              </DrawerContent>
            </Drawer>
          )}
          <ToggleGroup
            size="sm"
            value={filter}
            onValueChange={(value) => setFilter(value as typeof filter)}
          >
            <ToggleGroupItem value="none">关闭</ToggleGroupItem>
            <ToggleGroupItem value="modifiers">组合键</ToggleGroupItem>
            <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
          </ToggleGroup>
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={LayerIcon} size="1em" /> 历史记录
          </ItemTitle>
          <ItemDescription>在屏幕上保留之前按下的按键</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={showEventHistory} onChange={setShowEventHistory} />
        </ItemActions>
      </Item>

      <div className={cn("flex flex-col gap-4 md:flex-row", showEventHistory ? "" : "pointer-events-none opacity-50", "transition-opacity")}>
        <Item variant="muted" className="flex-[7]">
          <ItemContent>
            <ItemTitle>排列方向</ItemTitle>
          </ItemContent>
          <ItemActions>
            <ToggleGroup
              size="sm"
              value={flexDirection}
              onValueChange={(value) => setAppearance({ flexDirection: value as "row" | "column" })}
            >
              <ToggleGroupItem value="row">
                <HugeiconsIcon icon={ArrowHorizontalIcon} strokeWidth={2} size={10} /> 横向
              </ToggleGroupItem>
              <ToggleGroupItem value="column">
                <HugeiconsIcon icon={ArrowVerticalIcon} strokeWidth={2} /> 纵向
              </ToggleGroupItem>
            </ToggleGroup>
          </ItemActions>
        </Item>
        <Item variant="muted" className="flex-[5]">
          <ItemContent>
            <ItemTitle>最大数量</ItemTitle>
          </ItemContent>
          <ItemActions className="max-w-20">
            <NumberField value={maxHistory} onChange={setMaxHistory} min={2} max={12} />
          </ItemActions>
        </Item>
      </div>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={MagicWand01Icon} size="1em" /> 实验性功能
          </ItemTitle>
          <ItemDescription>开启后显示实验性功能入口(如伙伴的 3D 原型形象),默认关闭</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={experimental}
            onChange={(v) => {
              setExperimental(v);
              // 关闭时若正停在实验性形象上,回落到稳定形象
              if (!v && useCompanionStore.getState().config.skin === "blob3d") {
                useCompanionStore.getState().setConfig({ skin: "blob" });
              }
            }}
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemHeader className="flex-col items-start">
          <ItemTitle>
            <HugeiconsIcon icon={ToggleOnIcon} size="1em" /> 显隐快捷键
          </ItemTitle>
          <ItemDescription>用于显示/隐藏按键可视化的全局快捷键，点击右侧框进行设置</ItemDescription>
        </ItemHeader>
        <ItemContent>
          <ShortcutRecorder
            value={toggleShortcut}
            onChange={(shortcut) => {
              setToggleShortcut(shortcut);
              invoke("set_toggle_shortcut", { shortcut }).catch((e) => console.error(e));
            }}
          />
        </ItemContent>
      </Item>
    </div>
  );
};
