// Keyboo 设置窗口

import { AlignmentPicker, ColorField, Item, NumberField, Section, Segmented, SelectField, Switch } from "@/components/ui";
import { EVENT_STORE_NAME, useEventStore } from "@/stores/useEventStore";
import { STYLE_STORE_NAME, useStyleStore } from "@/stores/useStyleStore";
import { startSyncSender } from "@/stores/sync";
import { availableMonitors } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const VERSION = "0.1.0";

const TABS = [
  { id: "general", label: "常规" },
  { id: "appearance", label: "外观" },
  { id: "mouse", label: "鼠标" },
  { id: "about", label: "关于" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Settings() {
  const [tab, setTab] = useState<TabId>("general");

  // 设置窗口是状态写入方:把变更同步给覆盖层窗口
  useEffect(() => {
    startSyncSender(EVENT_STORE_NAME, useEventStore, ["filter", "showHistory", "maxHistory", "lingerMs"]);
    startSyncSender(STYLE_STORE_NAME, useStyleStore, ["appearance", "text", "color", "border", "background", "mouse"]);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 侧边栏 */}
      <div className="flex w-40 flex-col gap-1 border-r border-border p-3">
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-keyboo text-sm font-bold text-white">K</div>
          <div>
            <div className="text-sm font-semibold">Keyboo</div>
            <div className="text-xs text-muted-foreground">键啵 v{VERSION}</div>
          </div>
        </div>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "rounded-lg bg-accent px-3 py-2 text-left text-sm font-medium text-accent-foreground"
                : "rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "general" && <GeneralSettings />}
        {tab === "appearance" && <AppearanceSettings />}
        {tab === "mouse" && <MouseSettings />}
        {tab === "about" && <AboutPage />}
      </div>
    </div>
  );
}

// ─── 常规 ───

function GeneralSettings() {
  const filter = useEventStore((s) => s.filter);
  const setFilter = useEventStore((s) => s.setFilter);
  const showHistory = useEventStore((s) => s.showHistory);
  const setShowHistory = useEventStore((s) => s.setShowHistory);
  const maxHistory = useEventStore((s) => s.maxHistory);
  const setMaxHistory = useEventStore((s) => s.setMaxHistory);
  const lingerMs = useEventStore((s) => s.lingerMs);
  const setLingerMs = useEventStore((s) => s.setLingerMs);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">常规</h1>
      <Section title="按键过滤">
        <Item title="过滤模式" description="组合键模式只显示修饰键开头的按键,避免录入文字时刷屏">
          <Segmented
            options={[
              { value: "none", label: "关闭" },
              { value: "hotkeys", label: "组合键" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </Item>
      </Section>
      <Section title="历史">
        <Item title="保留历史按键" description="在屏幕上保留之前按下的按键组">
          <Switch checked={showHistory} onChange={setShowHistory} />
        </Item>
        <Item title="最大组数">
          <NumberField value={maxHistory} onChange={setMaxHistory} min={2} max={12} disabled={!showHistory} />
        </Item>
        <Item title="停留时长(秒)">
          <NumberField value={lingerMs / 1000} onChange={(v) => setLingerMs(v * 1000)} min={0.5} max={30} step={0.5} disabled={!showHistory} />
        </Item>
      </Section>
      <Section title="快捷键">
        <Item title="显示 / 隐藏" description="全局快捷键,随时开关可视化(可在托盘中手动暂停)">
          <span className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium">Shift + F10</span>
        </Item>
      </Section>
    </div>
  );
}

// ─── 外观 ───

function AppearanceSettings() {
  const appearance = useStyleStore((s) => s.appearance);
  const setAppearance = useStyleStore((s) => s.setAppearance);
  const text = useStyleStore((s) => s.text);
  const setText = useStyleStore((s) => s.setText);
  const keycapColor = useStyleStore((s) => s.color);
  const setKeycapColor = useStyleStore((s) => s.setColor);
  const background = useStyleStore((s) => s.background);
  const setBackground = useStyleStore((s) => s.setBackground);
  const [monitors, setMonitors] = useState<{ name: string; width: number; height: number }[]>([]);

  useEffect(() => {
    availableMonitors().then((list) => {
      setMonitors(list.map((m, i) => ({ name: m.name ?? `显示器 ${i + 1}`, width: m.size.width, height: m.size.height })));
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">外观</h1>
      <Section title="键帽">
        <Item title="样式" description="极简为纯文字,标准为实体键帽">
          <Segmented
            options={[
              { value: "minimal", label: "极简" },
              { value: "standard", label: "标准" },
            ]}
            value={appearance.keyStyle}
            onChange={(keyStyle) => setAppearance({ keyStyle })}
          />
        </Item>
        <Item title="文字大小">
          <NumberField value={text.size} onChange={(size) => setText({ size })} min={14} max={72} />
        </Item>
        <Item title="文字颜色">
          <ColorField value={text.color} onChange={(color) => setText({ color })} />
        </Item>
        <Item title="键帽颜色" description="标准样式的主色">
          <ColorField value={keycapColor.color} onChange={(color) => setKeycapColor({ color })} />
        </Item>
      </Section>
      <Section title="位置">
        {monitors.length > 1 && (
          <Item title="显示器" description="可视化所在的屏幕">
            <SelectField
              options={monitors.map((m) => ({ value: m.name, label: `${m.name} (${m.width}×${m.height})` }))}
              value={appearance.monitor ?? monitors[0]?.name ?? ""}
              onChange={(monitor) => setAppearance({ monitor })}
              width="w-44"
            />
          </Item>
        )}
        <Item title="对齐位置" description="按键浮层在屏幕上的位置">
          <AlignmentPicker value={appearance.alignment} onChange={(alignment) => setAppearance({ alignment })} />
        </Item>
        <Item title="横向边距">
          <NumberField value={appearance.marginX} onChange={(marginX) => setAppearance({ marginX })} min={0} max={400} step={10} />
        </Item>
        <Item title="纵向边距">
          <NumberField value={appearance.marginY} onChange={(marginY) => setAppearance({ marginY })} min={0} max={400} step={10} />
        </Item>
      </Section>
      <Section title="动画">
        <Item title="效果">
          <SelectField
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
        </Item>
        <Item title="时长(秒)" description="数值越大动画越慢">
          <NumberField value={appearance.animationDuration} onChange={(animationDuration) => setAppearance({ animationDuration })} min={0.05} max={1} step={0.05} />
        </Item>
      </Section>
      <Section title="背景">
        <Item title="按键组背景" description="给按键组加一块半透明底板">
          <Switch checked={background.enabled} onChange={(enabled) => setBackground({ enabled })} />
        </Item>
      </Section>
    </div>
  );
}

// ─── 鼠标 ───

function MouseSettings() {
  const mouse = useStyleStore((s) => s.mouse);
  const setMouse = useStyleStore((s) => s.setMouse);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">鼠标</h1>
      <Section title="点击圆环">
        <Item title="显示点击" description="按下鼠标时显示圆环动画,释放时扩散涟漪">
          <Switch checked={mouse.showClicks} onChange={(showClicks) => setMouse({ showClicks })} />
        </Item>
        <Item title="圆环大小">
          <NumberField value={mouse.size} onChange={(size) => setMouse({ size })} min={40} max={400} step={10} disabled={!mouse.showClicks} />
        </Item>
        <Item title="颜色">
          <ColorField value={mouse.color} onChange={(color) => setMouse({ color })} />
        </Item>
        <Item title="常显圆环" description="不点击时也围绕光标显示圆环">
          <Switch checked={mouse.keepHighlight} onChange={(keepHighlight) => setMouse({ keepHighlight })} disabled={!mouse.showClicks} />
        </Item>
      </Section>
      <Section title="按键指示器">
        <Item title="显示指示器" description="光标旁显示当前按键 / 滚轮状态图标">
          <Switch checked={mouse.showIndicator} onChange={(showIndicator) => setMouse({ showIndicator })} />
        </Item>
        <Item title="大小">
          <NumberField value={mouse.indicatorSize} onChange={(indicatorSize) => setMouse({ indicatorSize })} min={20} max={120} step={2} disabled={!mouse.showIndicator} />
        </Item>
        <Item title="横向偏移">
          <NumberField value={mouse.offsetX} onChange={(offsetX) => setMouse({ offsetX })} min={-200} max={200} step={2} disabled={!mouse.showIndicator} />
        </Item>
        <Item title="纵向偏移">
          <NumberField value={mouse.offsetY} onChange={(offsetY) => setMouse({ offsetY })} min={-200} max={200} step={2} disabled={!mouse.showIndicator} />
        </Item>
      </Section>
    </div>
  );
}

// ─── 关于 ───

function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">关于</h1>
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-secondary py-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-keyboo text-2xl font-bold text-white">K</div>
        <div className="text-xl font-semibold">Keyboo 键啵</div>
        <div className="text-sm text-muted-foreground">v{VERSION} · 桌面按键可视化与打字伙伴</div>
      </div>
      <Item title="许可证" description="Keyboo 是 MIT 许可的自由软件">
        <span className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium">MIT</span>
      </Item>
      <Item title="下一步" description="打字伙伴:记录你的敲字总数,角色随打字成长(开发中)" />
    </div>
  );
}
