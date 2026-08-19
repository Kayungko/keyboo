// 浏览器预览 mock:@tauri-apps/plugin-fs
const files = new Map<string, string>();

export async function readTextFile(path: string): Promise<string> {
  const content = files.get(path);
  if (content === undefined) throw new Error(`[preview] file not found: ${path}`);
  return content;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  files.set(path, content);
}
