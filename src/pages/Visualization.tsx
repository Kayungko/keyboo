// 覆盖层主页面:接线输入事件、同步、静默模式与状态角标

import { KeyboardLayout } from "@/components/KeyboardLayout";
import { KeyOverlay } from "@/components/KeyOverlay";
import { MouseOverlay } from "@/components/MouseOverlay";
import { MouseTrail } from "@/components/MouseTrail";
import { CompanionLayer } from "@/components/CompanionLayer";
import type { EventPayload } from "@/lib/types";
import { COMPANION_STORE_NAME, loadCompanionPersist, useCompanionStore } from "@/stores/useCompanionStore";
import { EVENT_STORE_NAME, useEventStore } from "@/stores/useEventStore";
import { STYLE_STORE_NAME, useStyleStore } from "@/stores/useStyleStore";
import { QUOTA_STORE_NAME, loadQuotaPersist, useQuotaStore } from "@/stores/useQuotaStore";
import { useQuotaPoll, forcePoll } from "@/lib/quota/poll";
import { listenSync } from "@/stores/sync";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// 状态角标显示时长
const STATUS_BADGE_MS = 1500;

export function Visualization() {
  const monitor = useStyleStore((s) => s.appearance.monitor);
  const chromaKey = useStyleStore((s) => s.appearance.chromaKey);
  const displayMode = useStyleStore((s) => s.appearance.displayMode);
  const onEvent = useEventStore((s) => s.onEvent);
  const tick = useEventStore((s) => s.tick);

  const [listening, setListening] = useState(true);
  const [silent, setSilent] = useState(false);
  const silentRef = useRef(false);
  const [badge, setBadge] = useState<string | null>(null);
  const badgeTimer = useRef<number | null>(null);

  // AI 额度轮询:必须在暂停/静默提前 return 之前调用(hooks 规则),
  // 暂停时进度条 UI 随伙伴隐藏,但 snapshots 持续更新
  useQuotaPoll();

  const showBadge = (text: string) => {
    setBadge(text);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = window.setTimeout(() => setBadge(null), STATUS_BADGE_MS);
  };

  useEffect(() => {
    const unlisteners = [
      // 输入事件:静默模式下直接丢弃(输入敏感内容时不显示也不回放)
      listen<EventPayload>("input-event", (event) => {
        if (silentRef.current) return;
        onEvent(event.payload);
      }),
      // 设置窗口开/关:打开时暂停 linger 清理方便预览
      listen<boolean>("settings-window", (event) => {
        useEventStore.setState({ settingsOpen: event.payload });
      }),
      // 监听开关(托盘 + 全局快捷键):暂停时清空运行时状态,避免键帽残留
      listen<boolean>("listening-toggle", (event) => {
        setListening(event.payload);
        if (!event.payload) useEventStore.getState().resetRuntime();
        showBadge(event.payload ? "已恢复监听" : "已暂停监听");
      }),
      // 静默模式:进入静默同样清空运行时状态
      listen<boolean>("silent-toggle", (event) => {
        silentRef.current = event.payload;
        setSilent(event.payload);
        if (event.payload) useEventStore.getState().resetRuntime();
        showBadge(event.payload ? "静默模式已开启" : "静默模式已关闭");
      }),
      // 双窗口状态同步
      listenSync(EVENT_STORE_NAME, useEventStore.setState),
      listenSync(STYLE_STORE_NAME, useStyleStore.setState),
      listenSync(COMPANION_STORE_NAME, useCompanionStore.setState),
      listenSync(QUOTA_STORE_NAME, useQuotaStore.setState),
    ];

    // 伙伴配置/统计从磁盘加载(覆盖层是统计写盘方);额度配置同样启动读盘,
    // 读盘完成后补一次强制查询(挂载时的首查早于 loaded 会被跳过)
    void loadCompanionPersist();
    void loadQuotaPersist().then(() => void forcePoll());

    const timer = setInterval(tick, 250);

    // 首帧渲染后再显示覆盖层,避免 WebView 未就绪时的窗体闪烁
    // (Rust 侧另有 2s 兜底 show)
    const raf = requestAnimationFrame(() => {
      invoke("show_main_window").catch(() => {});
    });

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      unlisteners.forEach((p) => p.then((un) => un()));
    };
  }, []);

  // 跟随设置切换显示器
  useEffect(() => {
    if (!monitor) return;
    invoke("set_main_window_monitor", { monitorName: monitor }).catch((error) => {
      console.error("切换显示器失败:", error);
    });
  }, [monitor]);

  // OBS 色键:背景填充纯色供直播软件抠像;关闭时保持透明
  const chromaBackground =
    chromaKey === "magenta" ? "#FF00FF"
      : chromaKey === "green" ? "#00FF00"
        : undefined;

  const badgeLayer = (
    <AnimatePresence>
      {badge && (
        <motion.div
          className="absolute bottom-6 right-6 px-3.5 py-1.5 rounded-full bg-black/70 text-white text-sm pointer-events-none select-none"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {badge}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // 暂停或静默:隐藏全部可视化,仅保留状态角标
  if (!listening || silent) {
    return (
      <div className="w-screen h-screen relative overflow-hidden" style={{ backgroundColor: chromaBackground }}>
        {badgeLayer}
      </div>
    );
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden" style={{ backgroundColor: chromaBackground }}>
      <MouseTrail />
      <MouseOverlay />
      {displayMode === "keyboard" ? <KeyboardLayout /> : <KeyOverlay />}
      <CompanionLayer />
      {badgeLayer}
    </div>
  );
}
