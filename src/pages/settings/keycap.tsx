import { Button, ColorField, Item, ItemActions, ItemContent, ItemDescription, ItemGrid, ItemGroup, ItemTitle, NumberField, Segmented, Switch } from "@/components/ui";
import { AlignmentPicker } from "@/components/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useStyleStore, type Alignment, type KeycapStyle } from "@/stores/useStyleStore";
import { AlignHorizontalCenterIcon, AlignLeftIcon, AlignRightIcon, Download01Icon, PaintBoardIcon, Refresh01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

export interface KeycapTheme {
  name: string;
  primary: string;
  secondary: string;
  text: string;
}

// 内置配色方案
export const colorSchemes: KeycapTheme[] = [
  { name: "珊瑚", primary: "#ff6b6b", secondary: "#2b2b33", text: "#ffffff" },
  { name: "银色", primary: "#f8f8f8", secondary: "#dcdcdc", text: "#000000" },
  { name: "石墨", primary: "#606060", secondary: "#4b4b4b", text: "#f8f8f8" },
  { name: "青柠", primary: "#606060", secondary: "#4b4b4b", text: "#D6ED17" },
  { name: "赛博", primary: "#00B1D2", secondary: "#008ea8", text: "#FDDB27" },
  { name: "绿松石", primary: "#42EADD", secondary: "#2ec4b8", text: "#ffffff" },
  { name: "蓝色", primary: "#2196f3", secondary: "#1976d2", text: "#ffffff" },
  { name: "黄色", primary: "#FDDB27", secondary: "#dfc019", text: "#000000" },
  { name: "绿色", primary: "#66bb6a", secondary: "#43a047", text: "#ffffff" },
  { name: "粉色", primary: "#f06292", secondary: "#d81b60", text: "#ffffff" },
  { name: "红色", primary: "#ef5350", secondary: "#c62828", text: "#ffffff" },
  { name: "三色堇", primary: "#673ab7", secondary: "#4527a0", text: "#ffc107" },
  { name: "月食", primary: "#343148", secondary: "#252333", text: "#D7C49E" },
  { name: "大黄蜂", primary: "#404040", secondary: "#2e2e2e", text: "#FDDB27" },
  { name: "炭黑", primary: "#404040", secondary: "#2e2e2e", text: "#FFFFFF" },
];

export const KeycapSettings = () => {
  const appearance = useStyleStore((state) => state.appearance);
  const setAppearance = useStyleStore((state) => state.setAppearance);
  const text = useStyleStore((state) => state.text);
  const setTextStyle = useStyleStore((state) => state.setText);
  const layout = useStyleStore((state) => state.layout);
  const setLayoutStyle = useStyleStore((state) => state.setLayout);
  const modifier = useStyleStore((state) => state.modifier);
  const setModifierStyle = useStyleStore((state) => state.setModifier);
  const color = useStyleStore((state) => state.color);
  const setColorStyle = useStyleStore((state) => state.setColor);
  const border = useStyleStore((state) => state.border);
  const setBorderStyle = useStyleStore((state) => state.setBorder);
  const background = useStyleStore((state) => state.background);
  const setBackgroundStyle = useStyleStore((state) => state.setBackground);
  const importStyle = useStyleStore((state) => state.importStyle);
  const exportStyle = useStyleStore((state) => state.exportStyle);

  // 配色下拉:受控弹层(<details> 选中后不会自动关闭,改手动控制)
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("click", onClickOutside);
    return () => window.removeEventListener("click", onClickOutside);
  }, [paletteOpen]);

  const onStyleChange = (value: KeycapStyle) => {
    if (value === "minimal") {
      setTextStyle({ variant: "icon" });
      setModifierStyle({ highlight: false });
      setLayoutStyle({ showIcon: true });
    }
    setAppearance({ style: value });
  };

  const randomizeStyle = () => {
    const scheme = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
    setLayoutStyle({
      showIcon: Math.random() > 0.5,
      showSymbol: Math.random() > 0.5,
    });
    setColorStyle({
      color: scheme.primary,
      secondaryColor: scheme.secondary,
      useGradient: Math.random() > 0.5,
    });
    setBorderStyle({ color: scheme.secondary, radius: Math.random() });
    setTextStyle({ color: scheme.text });
    if (modifier.highlight) {
      const modScheme = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
      setModifierStyle({
        color: modScheme.primary,
        secondaryColor: modScheme.secondary,
        borderColor: modScheme.secondary,
        textColor: modScheme.text,
      });
    } else if (background.enabled) {
      setBackgroundStyle({ color: scheme.text });
    }
  };

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">键帽</h1>

      <h2 className="text-sm font-medium text-muted-foreground">预设</h2>
      <Item variant="muted">
        <ItemActions className="w-full">
          <Segmented
            options={[
              { value: "minimal", label: "极简" },
              { value: "laptop", label: "笔记本" },
              { value: "lowprofile", label: "矮轴" },
              { value: "pbt", label: "PBT" },
            ]}
            value={appearance.style}
            onChange={onStyleChange}
          />
          {/* 配色方案 */}
          <div className="relative" ref={paletteRef}>
            <button
              type="button"
              onClick={() => setPaletteOpen((open) => !open)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-input bg-background hover:bg-accent"
              aria-label="配色方案"
            >
              <HugeiconsIcon icon={PaintBoardIcon} />
            </button>
            {paletteOpen && (
              <div className="absolute right-0 z-30 mt-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
                {colorSchemes.map((scheme) => (
                  <button
                    key={scheme.name}
                    type="button"
                    onClick={() => {
                      setColorStyle({ color: scheme.primary, secondaryColor: scheme.secondary });
                      setBorderStyle({ color: scheme.secondary });
                      setTextStyle({ color: scheme.text });
                      setPaletteOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-xs border border-muted-foreground/20 text-center text-[10px]"
                      style={{ backgroundColor: scheme.primary, color: scheme.text }}
                    >
                      A
                    </span>
                    {scheme.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={randomizeStyle}>
            <HugeiconsIcon icon={Refresh01Icon} />
          </Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={importStyle}>
            <HugeiconsIcon icon={Download01Icon} className="mr-2" /> 导入
          </Button>
          <Button variant="outline" size="sm" onClick={exportStyle}>
            <HugeiconsIcon icon={Upload01Icon} className="mr-2" /> 导出
          </Button>
        </ItemActions>
      </Item>

      {/* 文字 */}
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger>
          <h2 className="text-sm font-medium text-muted-foreground">文字</h2>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-y-4 pt-4">
          <ItemGrid className="md:grid-cols-[240px_1fr]">
            <AlignmentPicker
              className="h-48 w-full"
              value={text.alignment}
              onChange={(alignment: Alignment) => setTextStyle({ alignment })}
            />
            <ItemGroup>
              <Item variant="muted" className="flex-[2]">
                <ItemContent>
                  <ItemTitle>大小</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <NumberField value={text.size} onChange={(size) => setTextStyle({ size })} min={8} max={72} className="w-28" />
                </ItemActions>
              </Item>
              <Item variant="muted" className="flex-[2]">
                <ItemContent>
                  <ItemTitle>显示形式</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Segmented
                    options={[
                      { value: "text", label: "完整文字" },
                      { value: "text-short", label: "缩写文字" },
                      { value: "icon", label: "仅图标" },
                    ]}
                    value={text.variant}
                    onChange={(variant) => {
                      setTextStyle({ variant });
                      if (variant === "icon") setLayoutStyle({ showIcon: true });
                    }}
                  />
                </ItemActions>
              </Item>
              <Item variant="muted" className="flex-[2]">
                <ItemContent>
                  <ItemTitle>大小写</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ToggleGroup value={text.caps} onValueChange={(caps) => setTextStyle({ caps: caps as typeof text.caps })} className="w-28">
                    <ToggleGroupItem value="uppercase" className="w-1/3">AA</ToggleGroupItem>
                    <ToggleGroupItem value="capitalize" className="w-1/3">Aa</ToggleGroupItem>
                    <ToggleGroupItem value="lowercase" className="w-1/3">aa</ToggleGroupItem>
                  </ToggleGroup>
                </ItemActions>
              </Item>
            </ItemGroup>
          </ItemGrid>
          <ItemGrid>
            <Item variant="muted" className={modifier.highlight ? "" : "col-span-2"}>
              <ItemContent>
                <ItemTitle>文字颜色</ItemTitle>
              </ItemContent>
              <ItemActions>
                <ColorField value={text.color} onChange={(color) => setTextStyle({ color })} />
              </ItemActions>
            </Item>
            {modifier.highlight && (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>修饰键颜色</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ColorField value={modifier.textColor} onChange={(textColor) => setModifierStyle({ textColor })} />
                </ItemActions>
              </Item>
            )}
          </ItemGrid>
        </CollapsibleContent>
      </Collapsible>

      {/* 布局 */}
      <Collapsible>
        <CollapsibleTrigger>
          <h2 className="text-sm font-medium text-muted-foreground">布局</h2>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-y-4 pt-4">
          <ItemGrid>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>图标</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Switch
                  checked={layout.showIcon}
                  onChange={(showIcon) => setLayoutStyle({ showIcon })}
                  disabled={text.variant === "icon"}
                />
              </ItemActions>
            </Item>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>对齐方式</ItemTitle>
              </ItemContent>
              <ItemActions>
                <ToggleGroup
                  value={layout.iconAlignment}
                  onValueChange={(iconAlignment) => setLayoutStyle({ iconAlignment: iconAlignment as typeof layout.iconAlignment })}
                  className="w-28"
                >
                  <ToggleGroupItem value="flex-start" className={cn("w-1/3", !layout.showIcon && "opacity-40")}>
                    <HugeiconsIcon icon={AlignLeftIcon} />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="center" className={cn("w-1/3", !layout.showIcon && "opacity-40")}>
                    <HugeiconsIcon icon={AlignHorizontalCenterIcon} />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="flex-end" className={cn("w-1/3", !layout.showIcon && "opacity-40")}>
                    <HugeiconsIcon icon={AlignRightIcon} />
                  </ToggleGroupItem>
                </ToggleGroup>
              </ItemActions>
            </Item>
          </ItemGrid>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>符号</ItemTitle>
              <ItemDescription>显示 !、@、# 等符号字符</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch checked={layout.showSymbol} onChange={(showSymbol) => setLayoutStyle({ showSymbol })} />
            </ItemActions>
          </Item>
          {appearance.style !== "minimal" && (
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>按压计数</ItemTitle>
                <ItemDescription>显示每个按键被按下的次数</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch checked={layout.showPressCount} onChange={(showPressCount) => setLayoutStyle({ showPressCount })} />
              </ItemActions>
            </Item>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* 颜色 */}
      {appearance.style !== "minimal" && (
        <Collapsible>
          <CollapsibleTrigger>
            <h2 className="text-sm font-medium text-muted-foreground">颜色</h2>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-y-4 pt-4">
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>高亮修饰键</ItemTitle>
                <ItemDescription>为修饰键使用不同的颜色</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch checked={modifier.highlight} onChange={(highlight) => setModifierStyle({ highlight })} />
              </ItemActions>
            </Item>
            {appearance.style !== "lowprofile" && (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>渐变</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Switch checked={color.useGradient} onChange={(useGradient) => setColorStyle({ useGradient })} />
                </ItemActions>
              </Item>
            )}
            <ItemGrid>
              <Item variant="muted" className={modifier.highlight && appearance.style !== "laptop" ? "" : "col-span-2"}>
                <ItemContent>
                  <ItemTitle>主色</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ColorField value={color.color} onChange={(color) => setColorStyle({ color })} />
                </ItemActions>
              </Item>
              {appearance.style === "laptop" ? (
                modifier.highlight && (
                  <Item variant="muted">
                    <ItemContent>
                      <ItemTitle>修饰键</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <ColorField value={modifier.color} onChange={(color) => setModifierStyle({ color })} />
                    </ItemActions>
                  </Item>
                )
              ) : (
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>副色</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <ColorField value={color.secondaryColor} onChange={(secondaryColor) => setColorStyle({ secondaryColor })} />
                  </ItemActions>
                </Item>
              )}
            </ItemGrid>
            {modifier.highlight && appearance.style !== "laptop" && (
              <ItemGrid>
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>修饰键主色</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <ColorField value={modifier.color} onChange={(color) => setModifierStyle({ color })} />
                  </ItemActions>
                </Item>
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>修饰键副色</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <ColorField value={modifier.secondaryColor} onChange={(secondaryColor) => setModifierStyle({ secondaryColor })} />
                  </ItemActions>
                </Item>
              </ItemGrid>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 边框 */}
      <Collapsible>
        <CollapsibleTrigger>
          <h2 className="text-sm font-medium text-muted-foreground">边框</h2>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-y-4 pt-4">
          <ItemGrid>
            <Item variant="muted">
              <ItemContent className="flex min-h-6 items-center justify-center">
                <ItemTitle>启用</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Switch checked={border.enabled} onChange={(enabled) => setBorderStyle({ enabled })} />
              </ItemActions>
            </Item>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>宽度</ItemTitle>
              </ItemContent>
              <ItemActions>
                <NumberField
                  min={0.5}
                  step={0.5}
                  value={border.width}
                  onChange={(width) => setBorderStyle({ width })}
                  className="max-w-20"
                  disabled={!border.enabled}
                />
              </ItemActions>
            </Item>
            <Item variant="muted" className={modifier.highlight ? "" : "col-span-2"}>
              <ItemContent>
                <ItemTitle>颜色</ItemTitle>
              </ItemContent>
              <ItemActions>
                <ColorField value={border.color} onChange={(color) => setBorderStyle({ color })} disabled={!border.enabled} />
              </ItemActions>
            </Item>
            {modifier.highlight && (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>修饰键颜色</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ColorField
                    value={modifier.borderColor}
                    onChange={(color) => setModifierStyle({ borderColor: color })}
                    disabled={!border.enabled}
                  />
                </ItemActions>
              </Item>
            )}
          </ItemGrid>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>圆角</ItemTitle>
            </ItemContent>
            <ItemActions>
              <div
                className="h-4 w-4 border-l-2 border-t-2 border-primary/50"
                style={{ borderTopLeftRadius: `${border.radius * 100}%` }}
              />
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[border.radius]}
                onValueChange={(value) => setBorderStyle({ radius: value[0] })}
                className="mx-2 h-8 w-40"
              />
              <span className="w-[4ch] text-right font-mono text-sm">{(border.radius * 100).toFixed(0)}%</span>
            </ItemActions>
          </Item>
        </CollapsibleContent>
      </Collapsible>

      {/* 背景 */}
      <Collapsible>
        <CollapsibleTrigger>
          <h2 className="text-sm font-medium text-muted-foreground">背景</h2>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-y-4 pt-4">
          <ItemGrid>
            <Item variant="muted">
              <ItemContent className="flex min-h-6 items-center justify-center">
                <ItemTitle>启用</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Switch checked={background.enabled} onChange={(enabled) => setBackgroundStyle({ enabled })} />
              </ItemActions>
            </Item>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>颜色</ItemTitle>
              </ItemContent>
              <ItemActions>
                <ColorField value={background.color} onChange={(color) => setBackgroundStyle({ color })} disabled={!background.enabled} />
              </ItemActions>
            </Item>
          </ItemGrid>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
