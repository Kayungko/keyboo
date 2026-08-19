// 浏览器预览 mock:@tauri-apps/api/window
export interface MockMonitor {
  name: string | null;
  size: { width: number; height: number };
  position: { x: number; y: number };
  scaleFactor: number;
}

export function getCurrentWindow() {
  // 预览按"设置窗口"身份运行:persist 的 isSenderWindow 为 true,交互可写内存
  return {
    label: "settings",
    setTitle: async () => {},
    setFocus: async () => {},
    show: async () => {},
    availableMonitors: async () => mockMonitors(),
  };
}

export function mockMonitors(): MockMonitor[] {
  return [
    { name: "\\\\.\\DISPLAY1", size: { width: 2560, height: 1440 }, position: { x: 0, y: 0 }, scaleFactor: 1 },
    { name: "\\\\.\\DISPLAY2", size: { width: 2560, height: 1440 }, position: { x: 2560, y: 0 }, scaleFactor: 1 },
  ];
}

export async function availableMonitors(): Promise<MockMonitor[]> {
  return mockMonitors();
}

export async function currentMonitor(): Promise<MockMonitor | null> {
  return mockMonitors()[0];
}

export async function primaryMonitor(): Promise<MockMonitor | null> {
  return mockMonitors()[0];
}
