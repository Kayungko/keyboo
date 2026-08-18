import { AlignmentPicker, Item, ItemActions, ItemContent, ItemDescription, ItemTitle, NumberField, Segmented, SelectField } from "@/components/ui";
import { NumberScrubber } from "@/components/ui/number-scrubber";
import { Toggle } from "@/components/ui/toggle";
import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore, type Alignment } from "@/stores/useStyleStore";
import { ComputerIcon, KeyboardIcon, KeyframesDoubleIcon, KeyframesDoubleRemoveIcon, Link02Icon, ParagraphSpacingIcon, TextAlignLeftIcon, Time03Icon, Unlink02Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export const AppearanceSettings = () => {
  const appearance = useStyleStore((state) => state.appearance);
  const setAppearance = useStyleStore((state) => state.setAppearance);
  const lingerDurationMs = useEventStore((state) => state.lingerDurationMs);
  const setLingerDurationMs = useEventStore((state) => state.setLingerDurationMs);

  const [marginLinked, setMarginLinked] = useState(appearance.marginX === appearance.marginY);
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  useEffect(() => {
    availableMonitors().then((list) => {
      if (!appearance.monitor && list.length > 1) {
        setAppearance({ monitor: list[0].name });
      }
      setMonitors(list);
    });
  }, []);

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">外观</h1>

      <h2 className="text-sm font-medium text-muted-foreground">模式</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={KeyboardIcon} size="1em" /> 显示模式
          </ItemTitle>
          <ItemDescription>浮动键帽只显示按下的键，整键盘常驻显示全部键位</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Segmented
            options={[
              { value: "floating", label: "浮动键帽" },
              { value: "keyboard", label: "整键盘" },
            ]}
            value={appearance.displayMode}
            onChange={(displayMode) => setAppearance({ displayMode })}
          />
        </ItemActions>
      </Item>

      <h2 className="text-sm font-medium text-muted-foreground">位置</h2>
      {monitors.length > 1 && (
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={ComputerIcon} size="1em" /> 显示器
            </ItemTitle>
            <ItemDescription>更改按键可视化所在的显示器</ItemDescription>
          </ItemContent>
          <ItemActions>
            <SelectField
              width="w-36"
              placeholder="选择显示器"
              value={appearance.monitor ?? ""}
              onChange={(monitor) => setAppearance({ monitor })}
              options={monitors.map((m, i) => ({
                value: m.name ?? i.toString(),
                label: `显示器 ${i + 1} (${m.size.width}×${m.size.height})`,
              }))}
            />
          </ItemActions>
        </Item>
      )}

      <Item variant="muted">
        <ItemContent className="self-start">
          <ItemTitle>
            <HugeiconsIcon icon={TextAlignLeftIcon} size="1em" /> 对齐方式
          </ItemTitle>
          <ItemDescription>按键可视化在屏幕上的位置</ItemDescription>
        </ItemContent>
        <ItemActions>
          <AlignmentPicker
            className="h-28 w-32"
            value={appearance.alignment}
            onChange={(alignment: Alignment) => setAppearance({ alignment })}
            disabledOptions={["center"]}
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={ParagraphSpacingIcon} size="1em" /> 边距
          </ItemTitle>
          <ItemDescription>与屏幕边缘的距离</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberScrubber
            value={appearance.marginX}
            onChange={(marginX) => {
              setAppearance({ marginX });
              if (marginLinked) setAppearance({ marginY: marginX });
            }}
            min={0}
            max={400}
            step={1}
            icon={<span className="ml-0.5 text-xs font-medium">X</span>}
            className="w-20"
          />
          <Toggle
            pressed={marginLinked}
            onPressedChange={(pressed) => {
              setMarginLinked(pressed);
              if (pressed) setAppearance({ marginY: appearance.marginX });
            }}
            ariaLabel="边距联动"
          >
            <HugeiconsIcon icon={marginLinked ? Link02Icon : Unlink02Icon} size="1em" />
          </Toggle>
          <NumberScrubber
            value={appearance.marginY}
            onChange={(marginY) => setAppearance({ marginY })}
            min={0}
            max={400}
            step={1}
            icon={<span className="ml-0.5 text-xs font-medium">Y</span>}
            className="w-20"
            disabled={marginLinked}
          />
        </ItemActions>
      </Item>

      <h2 className="text-sm font-medium text-muted-foreground">动画</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Time03Icon} size="1em" /> 停留时长
          </ItemTitle>
          <ItemDescription className="max-w-84">按键在屏幕上保留的时长（单位：秒）</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField
            value={lingerDurationMs / 1000}
            onChange={(v) => setLingerDurationMs(v * 1000)}
            step={0.5}
            min={0.5}
            max={30}
            className="w-32"
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={KeyframesDoubleIcon} size="1em" /> 动画效果
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Segmented
            options={[
              { value: "none", label: "无" },
              { value: "fade", label: "淡入淡出" },
              { value: "zoom", label: "缩放" },
              { value: "float", label: "上浮" },
              { value: "slide", label: "滑入" },
            ]}
            value={appearance.animation}
            onChange={(animation) => setAppearance({ animation })}
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={KeyframesDoubleRemoveIcon} size="1em" /> 动画速度
          </ItemTitle>
          <ItemDescription>数值越大，动画越慢</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField
            value={appearance.animationDuration}
            onChange={(animationDuration) => setAppearance({ animationDuration })}
            step={0.05}
            min={0.05}
            max={1}
            className="w-32"
          />
        </ItemActions>
      </Item>

      <h2 className="text-sm font-medium text-muted-foreground">直播</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Video01Icon} size="1em" /> OBS 色键
          </ItemTitle>
          <ItemDescription>用纯色填充整个背景，供 OBS 等直播软件色键抠像</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Segmented
            options={[
              { value: "none", label: "关闭" },
              { value: "magenta", label: "品红" },
              { value: "green", label: "绿色" },
            ]}
            value={appearance.chromaKey}
            onChange={(chromaKey) => setAppearance({ chromaKey })}
          />
        </ItemActions>
      </Item>
    </div>
  );
};
