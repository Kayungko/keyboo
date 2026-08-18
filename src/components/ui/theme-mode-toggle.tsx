// 主题切换(浅色 / 深色 / 跟随系统)

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "keyboo-theme";

export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** 在首帧渲染前调用,避免深色模式先闪一帧浅色 */
export function applyInitialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored === "light" || stored === "dark" ? stored : "system");
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || "system",
  );

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(THEME_KEY, mode);
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
