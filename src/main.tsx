import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import { applyInitialTheme, restoreTheme } from "./components/ui/theme-mode-toggle";

// 首帧前应用主题,避免深色模式闪烁(先用 localStorage 同步缓存)
applyInitialTheme();
// 异步从 plugin-store 恢复权威主题(覆盖可能丢失的 localStorage 缓存)
void restoreTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
