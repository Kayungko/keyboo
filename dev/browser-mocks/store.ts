// 浏览器预览 mock:@tauri-apps/plugin-store
// 内存 store:会话内读写有效,刷新即空(预览不持久化,避免污染真实配置)
interface MockStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

const stores = new Map<string, Map<string, unknown>>();

export async function load(name: string, _opts?: unknown): Promise<MockStore> {
  let data = stores.get(name);
  if (!data) {
    data = new Map();
    stores.set(name, data);
  }
  return {
    get: async <T>(key: string) => data!.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      data!.set(key, value);
    },
    delete: async (key: string) => {
      data!.delete(key);
    },
    save: async () => {},
  };
}
