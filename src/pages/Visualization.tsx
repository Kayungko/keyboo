// 覆盖层主页面:接线输入事件、同步、静默模式与状态角标

import { KeyboardLayout } from "@/components/KeyboardLayout";
import { KeyOverlay } from "@/components/KeyOverlay";
import { MouseOverlay } from "@/components/MouseOverlay";
import { MouseTrail } from "@/components/MouseTrail";
import type { EventPayload } from "@/lib/types";
import { EVENT_STORE_NAME, useEventStore } from "@/stores/useEventStore";
import { STYLE_STORE_NAME, useStyleStore } from "@/stores/useStyleStore";
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
    ];

    const timer = setInterval(tick, 250);

    return () => {
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
      {badgeLayer}
    </div>
  );
}
