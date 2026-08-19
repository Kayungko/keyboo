// 浏览器预览专用 vite 配置:用 mock 运行时替换全部 Tauri 模块,
// 让设置页等前端在普通浏览器里可渲染(视觉验证/设计评审用)。
// 端口 1421,与 Tauri dev(1420)互不干扰;不影响 src-tauri 构建(tsconfig 仅含 src)。
//   启动:npx vite --config vite.browser.config.ts

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const mock = (m: string) => here(`./dev/browser-mocks/${m}.ts`);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: here("./src") },
      { find: /^@tauri-apps\/api\/core$/, replacement: mock("core") },
      { find: /^@tauri-apps\/api\/window$/, replacement: mock("window") },
      { find: /^@tauri-apps\/api\/event$/, replacement: mock("event") },
      { find: /^@tauri-apps\/plugin-store$/, replacement: mock("store") },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: mock("dialog") },
      { find: /^@tauri-apps\/plugin-fs$/, replacement: mock("fs") },
      { find: /^@tauri-apps\/plugin-opener$/, replacement: mock("opener") },
    ],
  },
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
});
