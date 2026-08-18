// 主题切换(浅色 / 深色 / 跟随系统)

import { useEffect, useState } from "react";
import { load } from "@tauri-apps/plugin-store";

type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "keyboo-theme";
const STORE_THEME_KEY = "theme";

const isThemeMode = (v: unknown): v is ThemeMode => v === "light" || v === "dark" || v === "system";

// 持久化:localStorage 做首帧同步缓存(首帧前读取避免深色闪白),
// plugin-store 做可靠落盘(与其余设置统一,避免 WebView 存储被清导致主题丢失)。
let themeStorePromise: ReturnType<typeof load> | null = null;
const getThemeStore = () => (themeStorePromise ??= load("keyboo.json", { autoSave: false, defaults: {} }));

export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** 在首帧渲染前调用,避免深色模式先闪一帧浅色 */
export function applyInitialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(isThemeMode(stored) ? stored : "system");
}

/** 写入主题:同步缓存 + 可靠落盘 */
export async function persistTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  const store = await getThemeStore();
  await store.set(STORE_THEME_KEY, mode);
  await store.save();
}

/** 从 plugin-store 恢复主题(覆盖可能丢失的 localStorage 缓存) */
export async function restoreTheme() {
  try {
    const store = await getThemeStore();
    const stored = await store.get<string>(STORE_THEME_KEY);
    if (isThemeMode(stored)) {
      localStorage.setItem(THEME_KEY, stored);
      applyTheme(stored);
    }
  } catch {
    // 首次启动无条目或读取失败:保持 localStorage 缓存值即可
  }
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || "system",
  );

  useEffect(() => {
    applyTheme(mode);
    void persistTheme(mode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => mode === "system" && applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [mode]);

  return { mode, setMode: setModeState };
}

export function ThemeModeToggle() {
  const { mode, setMode } = useThemeMode();
  const [open, setOpen] = useState(false);

  const options: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="切换主题"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "💻"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-28 rounded-lg border border-border bg-background p-1 shadow-lg">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setMode(option.value); setOpen(false); }}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  mode === option.value ? "bg-accent text-accent-foreground" : "hover:bg-secondary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
