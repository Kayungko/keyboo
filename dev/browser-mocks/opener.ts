// 浏览器预览 mock:@tauri-apps/plugin-opener
export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener");
}

export async function openPath(_path: string): Promise<void> {}
