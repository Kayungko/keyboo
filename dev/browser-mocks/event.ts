// 浏览器预览 mock:@tauri-apps/api/event
// 内存事件总线:预览内 emit/listen 可互通(双窗口同步在单页内无害地空转)
type Handler = (event: { payload: unknown }) => void;

const bus = new Map<string, Set<Handler>>();

export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> {
  let set = bus.get(event);
  if (!set) {
    set = new Set();
    bus.set(event, set);
  }
  set.add(handler as Handler);
  return () => set!.delete(handler as Handler);
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  bus.get(event)?.forEach((h) => h({ payload }));
}
