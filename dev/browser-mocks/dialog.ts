// 浏览器预览 mock:@tauri-apps/plugin-dialog
// 预览模式下弹真实文件选择框,返回 objectURL 模拟文件路径,
// 让自定义形象导入等流程在浏览器里可走通(刷新后失效,属预期)。

export async function open(opts?: unknown): Promise<string | null> {
  const filters = (opts as { filters?: { extensions?: string[] }[] } | undefined)?.filters;
  const exts = filters?.[0]?.extensions ?? [];
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = exts.map((e) => `.${e}`).join(",");
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    input.onchange = () => {
      const file = input.files?.[0];
      done(file ? URL.createObjectURL(file) : null);
    };
    // 取消检测:对话框关闭后窗口重获焦点,若未选文件视为取消
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => done(null), 300),
      { once: true },
    );
    input.click();
  });
}

export async function save(_opts?: unknown): Promise<string | null> {
  return null;
}
