// 在线更新:GitHub Releases 作为唯一更新源(tauri-plugin-updater)。
// 版本显示统一走 getVersion(),不再硬编码。

import { getVersion } from "@tauri-apps/api/app";
import { emit } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { load } from "@tauri-apps/plugin-store";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";

/** 发现新版本时广播给所有窗口(覆盖层静默检查 → 设置窗口提示) */
export const UPDATE_AVAILABLE_EVENT = "update-available";

/** 自动检查开关在 keyboo.json 中的键 */
const AUTO_CHECK_KEY = "keyboo-auto-check-update";

// 非 Tauri 环境(浏览器预览 dev/browser-mocks)下降级
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 在线更新是否可用:仅 Tauri 生产构建支持(dev 模式无签名产物,无法安装) */
export const updaterAvailable = () => isTauri && !import.meta.env.DEV;

// ─── 版本 ───

/** 应用版本号(来自 tauri.conf.json,构建时注入);非 Tauri 环境回退占位 */
export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (!isTauri) {
      setVersion("preview");
      return;
    }
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);
  return version;
}

// ─── 自动检查开关(plugin-store 直读,与主题存储同模式) ───

let appStorePromise: ReturnType<typeof load> | null = null;
const getAppStore = () => (appStorePromise ??= load("keyboo.json", { autoSave: false, defaults: {} }));

export async function getAutoCheck(): Promise<boolean> {
  try {
    const store = await getAppStore();
    return (await store.get<boolean>(AUTO_CHECK_KEY)) ?? true;
  } catch {
    return true;
  }
}

export async function setAutoCheck(enabled: boolean) {
  const store = await getAppStore();
  await store.set(AUTO_CHECK_KEY, enabled);
  await store.save();
}

// ─── 检查 / 下载 / 安装 ───

/** 检查更新:有新版返回 Update,已是最新返回 null;网络等错误抛出由调用方提示 */
export function checkForUpdate(): Promise<Update | null> {
  return check();
}

export interface DownloadProgress {
  downloaded: number;
  total?: number;
}

/** 下载并安装更新,通过回调汇报进度 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
) {
  let downloaded = 0;
  let total: number | undefined;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        downloaded = 0;
        total = event.data.contentLength;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        break;
      case "Finished":
        break;
    }
    onProgress?.({ downloaded, total });
  });
}

/** 重启应用以完成更新 */
export function relaunchApp(): Promise<void> {
  return relaunch();
}

// ─── 启动静默检查(覆盖层窗口调用) ───

// StrictMode 双挂载防重:模块级标记保证只查一次
let silentCheckDone = false;

/** 覆盖层启动时静默检查;发现新版本广播事件,失败不打扰用户 */
export async function silentCheckAndNotify(): Promise<void> {
  if (!updaterAvailable() || silentCheckDone) return;
  silentCheckDone = true;
  if (!(await getAutoCheck())) return;
  try {
    const update = await check();
    if (update) {
      await emit(UPDATE_AVAILABLE_EVENT, { version: update.version });
    }
  } catch {
    // 静默检查:网络不可达/无 release 等一律静默
  }
}
