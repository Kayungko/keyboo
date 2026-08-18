import { emit, listen } from "@tauri-apps/api/event";
import type { UseBoundStore, StoreApi } from "zustand";

const SYNC_CHANNEL = "keyboo-sync";

interface SyncPayload {
  store: string;
  key: string;
  value: unknown;
}

/** 设置窗口:把顶层状态键的变更广播给覆盖层窗口 */
export function startSyncSender(
  storeName: string,
  useStore: UseBoundStore<StoreApi<any>>,
  stateKeys: string[],
) {
  useStore.subscribe((state, prev) => {
    for (const key of stateKeys) {
      if (state[key] !== prev[key]) {
        void emit(SYNC_CHANNEL, { store: storeName, key, value: state[key] } satisfies SyncPayload);
      }
    }
  });
}

/** 覆盖层窗口:接收设置窗口的状态变更 */
export async function listenSync(
  storeName: string,
  setState: (partial: Record<string, unknown>) => void,
) {
  return listen<SyncPayload>(SYNC_CHANNEL, (event) => {
    const { store, key, value } = event.payload;
    if (store !== storeName) return;
    setState({ [key]: value });
  });
}
