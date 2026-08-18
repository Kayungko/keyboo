import { ColorField, Item, ItemActions, ItemContent, ItemDescription, ItemGrid, ItemTitle, NumberField, Switch } from "@/components/ui";
import { NumberScrubber } from "@/components/ui/number-scrubber";
import { Toggle } from "@/components/ui/toggle";
import { useEventStore } from "@/stores/useEventStore";
import { useStyleStore } from "@/stores/useStyleStore";
import { ArrowExpand02Icon, Cursor01Icon, CursorCircleSelection01Icon, CursorEdit01Icon, CursorMagicSelection03FreeIcons, Drag03Icon, Link02Icon, MouseLeftClick05Icon, PaintBoardIcon, SparklesIcon, Unlink02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

export const MouseSettings = () => {
  const mouse = useStyleStore((state) => state.mouse);
  const setMouseStyle = useStyleStore((state) => state.setMouse);
  const dragThreshold = useEventStore((state) => state.dragThreshold);
  const setDragThreshold = useEventStore((state) => state.setDragThreshold);

  // 初始状态跟随实际配置:X === Y 时视为联动,避免硬编码 true 覆盖用户已拆分的偏移
  const [offsetLinked, setOffsetLinked] = useState(() => mouse.indicatorOffsetX === mouse.indicatorOffsetY);

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">鼠标</h1>

      <h2 className="text-sm font-medium text-muted-foreground">光标高亮</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={CursorMagicSelection03FreeIcons} size="1em" /> 显示点击
          </ItemTitle>
          <ItemDescription>按下鼠标时显示圆环动画，释放时扩散涟漪</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={mouse.showClicks} onChange={(showClicks) => setMouseStyle({ showClicks })} />
        </ItemActions>
      </Item>

      <ItemGrid>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={CursorCircleSelection01Icon} size="1em" /> 大小
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <NumberField step={10} className="w-32" value={mouse.size} onChange={(size) => setMouseStyle({ size })} min={40} max={400} disabled={!mouse.showClicks} />
          </ItemActions>
        </Item>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={PaintBoardIcon} size="1em" /> 颜色
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <ColorField className="w-32" value={mouse.color} onChange={(color) => setMouseStyle({ color })} disabled={!mouse.showClicks} />
          </ItemActions>
        </Item>
      </ItemGrid>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Cursor01Icon} size="1em" /> 常显高亮
          </ItemTitle>
          <ItemDescription>始终在光标周围显示圆环</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={mouse.keepHighlight}
            onChange={(keepHighlight) => setMouseStyle({ keepHighlight })}
            disabled={!mouse.showClicks}
          />
        </ItemActions>
      </Item>

      <h2 className="mt-2 text-sm font-medium text-muted-foreground">按键指示器</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={MouseLeftClick05Icon} size="1em" /> 显示指示器
          </ItemTitle>
          <ItemDescription>光标旁显示当前按键 / 滚轮状态图标</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={mouse.showIndicator} onChange={(showIndicator) => setMouseStyle({ showIndicator })} />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Cursor01Icon} size="1em" /> 常驻指示器
          </ItemTitle>
          <ItemDescription>始终在光标旁显示图标</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={mouse.keepIndicator}
            onChange={(keepIndicator) => setMouseStyle({ keepIndicator })}
            disabled={!mouse.showIndicator}
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={CursorEdit01Icon} size="1em" /> 大小
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <NumberField
            className="w-32"
            value={mouse.indicatorSize}
            onChange={(indicatorSize) => setMouseStyle({ indicatorSize })}
            min={20}
            max={120}
            step={2}
            disabled={!mouse.showIndicator}
          />
        </ItemActions>
      </Item>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={ArrowExpand02Icon} size="1em" /> 偏移
          </ItemTitle>
          <ItemDescription>光标与指示器之间的距离</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberScrubber
            value={mouse.indicatorOffsetX}
            onChange={(indicatorOffsetX) => {
              setMouseStyle({ indicatorOffsetX });
              if (offsetLinked) setMouseStyle({ indicatorOffsetY: indicatorOffsetX });
            }}
            min={-200}
            max={200}
            step={1}
            icon={<span className="ml-0.5 text-xs font-medium">X</span>}
            className="w-20"
            disabled={!mouse.showIndicator}
          />
          <Toggle
            pressed={offsetLinked}
            onPressedChange={(pressed) => {
              setOffsetLinked(pressed);
              if (pressed) setMouseStyle({ indicatorOffsetY: mouse.indicatorOffsetX });
            }}
            ariaLabel="偏移联动"
          >
            <HugeiconsIcon icon={offsetLinked ? Link02Icon : Unlink02Icon} size="1em" />
          </Toggle>
          <NumberScrubber
            value={mouse.indicatorOffsetY}
            onChange={(indicatorOffsetY) => setMouseStyle({ indicatorOffsetY })}
            min={-200}
            max={200}
            step={1}
            icon={<span className="ml-0.5 text-xs font-medium">Y</span>}
            className="w-20"
            disabled={offsetLinked || !mouse.showIndicator}
          />
        </ItemActions>
      </Item>

      <h2 className="mt-2 text-sm font-medium text-muted-foreground">事件</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Drag03Icon} size="1em" /> 拖拽阈值
          </ItemTitle>
          <ItemDescription>移动超过该距离（像素）时显示拖拽事件</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NumberField className="w-32" value={dragThreshold} onChange={setDragThreshold} min={1} max={500} />
        </ItemActions>
      </Item>

      <h2 className="mt-2 text-sm font-medium text-muted-foreground">移动轨迹</h2>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={SparklesIcon} size="1em" /> 显示轨迹
          </ItemTitle>
          <ItemDescription>鼠标移动时绘制渐隐的彩色轨迹，适合录制演示</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={mouse.showTrail} onChange={(showTrail) => setMouseStyle({ showTrail })} />
        </ItemActions>
      </Item>

      <Item variant="muted" className={mouse.showTrail ? "" : "pointer-events-none opacity-50"}>
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={PaintBoardIcon} size="1em" /> 颜色
          </ItemTitle>
          <ItemDescription>拖尾的颜色与透明度</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ColorField
            className="w-56"
            value={mouse.trailColor}
            onChange={(trailColor) => setMouseStyle({ trailColor })}
            disabled={!mouse.showTrail}
          />
        </ItemActions>
      </Item>

      <ItemGrid>
        <Item variant="muted" className={mouse.showTrail ? "" : "pointer-events-none opacity-50"}>
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={CursorEdit01Icon} size="1em" /> 粗细
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <NumberField
              className="w-32"
              value={mouse.trailWidth}
              onChange={(trailWidth) => setMouseStyle({ trailWidth })}
              min={2}
              max={24}
              step={1}
              disabled={!mouse.showTrail}
            />
          </ItemActions>
        </Item>
        <Item variant="muted" className={mouse.showTrail ? "" : "pointer-events-none opacity-50"}>
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={Cursor01Icon} size="1em" /> 消散时长(秒)
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <NumberField
              className="w-32"
              value={mouse.trailFadeMs / 1000}
              onChange={(value) => setMouseStyle({ trailFadeMs: value * 1000 })}
              min={0.1}
              max={3}
              step={0.1}
              disabled={!mouse.showTrail}
            />
          </ItemActions>
        </Item>
      </ItemGrid>
    </div>
  );
};
