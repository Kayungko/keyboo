// 浏览器预览 mock:@tauri-apps/api/core
// 仅在 vite.browser.config.ts 的 alias 下生效,不进入 Tauri 构建。
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 自定义形象导入:预览模式下直接把选中的路径(blob: URL)回传,
  // 配合 convertFileSrc 原样返回,即可在浏览器里预览导入流程
  if (cmd === "import_companion_image") return (args?.path as string) as T;
  // 其余 command 静默成功
  return undefined as T;
}

export async function convertFileSrc(url: string): Promise<string> {
  return url;
}
