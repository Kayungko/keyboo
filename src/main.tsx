import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import { applyInitialTheme } from "./components/ui/theme-mode-toggle";

// 首帧前应用主题,避免深色模式闪烁
applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
