// Keyboo 设置窗口(布局与交互对齐 Keyviz)

import { ThemeModeToggle } from "@/components/ui/theme-mode-toggle";
import { KeybooLogo } from "@/components/KeybooLogo";
import { ComputerIcon, HappyIcon, InformationSquareIcon, KeyboardIcon, Mouse09Icon, Settings03Icon, BatteryCharging01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { listen } from "@tauri-apps/api/event";
import { Toaster, toast } from "sonner";
import { useEffect, useState } from "react";
import { COMPANION_STORE_NAME, useCompanionStore } from "@/stores/useCompanionStore";
import { EVENT_STORE_NAME, useEventStore } from "@/stores/useEventStore";
import { STYLE_STORE_NAME, useStyleStore } from "@/stores/useStyleStore";
import { QUOTA_STORE_NAME, useQuotaStore } from "@/stores/useQuotaStore";
import { startSyncSender } from "@/stores/sync";
import { UPDATE_AVAILABLE_EVENT, checkForUpdate, getAutoCheck, updaterAvailable, useAppVersion } from "@/lib/updater";
import { AboutPage } from "./settings/about";
import { AppearanceSettings } from "./settings/appearance";
import { CompanionSettings } from "./settings/companion";
import { GeneralSettings } from "./settings/general";
import { KeycapSettings } from "./settings/keycap";
import { MouseSettings } from "./settings/mouse";
import { QuotaSettings } from "./settings/quota";

const sideBar = [
  { id: "general", label: "常规", icon: Settings03Icon },
  { id: "appearance", label: "外观", icon: ComputerIcon },
  { id: "keycap", label: "键帽", icon: KeyboardIcon },
  { id: "mouse", label: "鼠标", icon: Mouse09Icon },
  { id: "companion", label: "伙伴", icon: HappyIcon },
  { id: "quota", label: "AI 额度", icon: BatteryCharging01Icon },
];

// 同一版本只提示一次(设置窗口可能多次挂载/重复收到广播)
const notifiedVersions = new Set<string>();

export default function Settings() {
  const [activeTab, setActiveTab] = useState(sideBar[0].id);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const version = useAppVersion();

  // 新版本提示:覆盖层启动静默检查发现新版会广播;设置窗口打开时再补查一次
  // (设置窗口晚于覆盖层创建,可能错过广播)
  useEffect(() => {
    const notify = (newVersion: string) => {
      if (notifiedVersions.has(newVersion)) return;
      notifiedVersions.add(newVersion);
      setUpdateAvailable(true);
      toast.info(`发现新版本 v${newVersion}`, {
        description: "前往「关于」页面下载更新",
        action: { label: "查看", onClick: () => setActiveTab("about") },
      });
    };
    let unlisten: (() => void) | undefined;
    void listen<{ version: string }>(UPDATE_AVAILABLE_EVENT, (event) => {
      notify(event.payload.version);
    }).then((un) => { unlisten = un; });
    if (updaterAvailable()) {
      void getAutoCheck()
        .then((enabled) => (enabled ? checkForUpdate() : null))
        .then((update) => { if (update) notify(update.version); })
        .catch(() => {});
    }
    return () => unlisten?.();
  }, []);

  // 设置窗口是状态写入方:把变更同步给覆盖层窗口。
  // StrictMode 下 effect 双跑,必须返回清理函数,否则订阅重复、事件双发
  useEffect(() => {
    const unsubscribers = [
      startSyncSender(EVENT_STORE_NAME, useEventStore, [
        "filter", "allowedKeys", "showEventHistory", "maxHistory", "lingerDurationMs",
        "dragThreshold", "toggleShortcut",
        "showKeyboardEvents", "showMouseEvents", "showMouseEffects",
      ]),
      startSyncSender(STYLE_STORE_NAME, useStyleStore, [
        "appearance", "layout", "color", "modifier", "text", "border", "background", "mouse",
        "experimental",
      ]),
      // stats 也同步:设置页重置统计时即时通知覆盖层清零
      startSyncSender(COMPANION_STORE_NAME, useCompanionStore, ["config", "stats"]),
      startSyncSender(QUOTA_STORE_NAME, useQuotaStore, ["config"]),
    ];
    return () => unsubscribers.forEach((un) => un());
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 侧边栏 */}
      <div className="flex w-44 flex-col gap-y-1 rounded-xl p-2">
        <div className="m-2 mb-2 flex items-center gap-x-2">
          <KeybooLogo size={32} className="shrink-0 rounded-lg" />
          <div className="flex flex-col gap-y-0.5">
            <h1 className="text-sm font-semibold">Keyboo</h1>
            <p className="text-xs text-gray-400">{version ? `v${version}` : ""}</p>
          </div>
        </div>
        {sideBar.map((item) => (
          <a key={item.id} onClick={() => setActiveTab(item.id)} className="cursor-pointer">
            <div
              className={`flex items-center gap-x-2 rounded-md p-2 text-sm transition-colors ${
                activeTab === item.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <HugeiconsIcon icon={item.icon} size="1.1em" strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span>{item.label}</span>
            </div>
          </a>
        ))}
        <div className="mt-auto flex items-center gap-2">
          <a onClick={() => setActiveTab("about")} className="flex-1 cursor-pointer">
            <div
              className={`flex items-center gap-x-2 rounded-md p-2 text-sm transition-colors ${
                activeTab === "about"
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <span className="relative">
                <HugeiconsIcon icon={InformationSquareIcon} size="1.1em" strokeWidth={activeTab === "about" ? 2.5 : 2} />
                {updateAvailable && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-keyboo" />
                )}
              </span>
              <span>关于</span>
            </div>
          </a>
          <ThemeModeToggle />
        </div>
      </div>

      <div className="w-px bg-border" />

      {/* 内容区 */}
      <div className="relative flex-1 overflow-y-auto">
        {activeTab === "general" && <GeneralSettings />}
        {activeTab === "appearance" && <AppearanceSettings />}
        {activeTab === "keycap" && <KeycapSettings />}
        {activeTab === "mouse" && <MouseSettings />}
        {activeTab === "companion" && <CompanionSettings />}
        {activeTab === "quota" && <QuotaSettings />}
        {activeTab === "about" && <AboutPage />}
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
