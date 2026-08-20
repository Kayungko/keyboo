// AI 额度轮询:覆盖层窗口常驻,固定 15s watchdog 心跳 + 到期检查。
//
// 为什么是 watchdog 而不是「按 refreshMin 重建 setInterval」:refreshMin 会被 sync
// 随时改动,重建 interval 要处理一堆分支;watchdog 每跳读 getState(),配置变更
// 下一跳自然生效,零重建,StrictMode 双挂载经 cleanup 天然安全。
//
// 挂载位置:必须由 Visualization 在「暂停/静默提前 return 之前」调用——
// 暂停时 CompanionLayer 不渲染,轮询不能跟着死(进度条 UI 随伙伴隐藏,但数据持续更新)。

import { useQuotaStore, type QuotaProviderConfig, type QuotaSnapshot } from "@/stores/useQuotaStore";
import { QUERY } from "./providers";
import { useEffect, useRef } from "react";

const WATCHDOG_MS = 15_000;

let inflight = false;
let lastPolledAt = 0;

const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** 单 provider 查询容错:失败保留旧值标 stale,不清空 */
async function querySafe(cfg: QuotaProviderConfig): Promise<QuotaSnapshot> {
  const query = QUERY[cfg.id];
  const prev = useQuotaStore.getState().snapshots[cfg.id];
  if (!query) {
    return { id: cfg.id, pct: prev?.pct ?? null, label: prev?.label ?? "", updatedAt: Date.now(), error: "未注册", stale: true };
  }
  try {
    const reading = await query(cfg);
    return {
      id: cfg.id,
      pct: reading.pct == null ? null : clampPct(reading.pct),
      label: reading.label,
      updatedAt: Date.now(),
    };
  } catch (e) {
    return {
      id: cfg.id,
      pct: prev?.pct ?? null,
      label: prev?.label ?? "",
      updatedAt: prev?.updatedAt ?? Date.now(),
      error: e instanceof Error ? e.message : String(e),
      stale: !!prev,
    };
  }
}

async function pollOnce(force = false) {
  const s = useQuotaStore.getState();
  if (!s.config.enabled || !s.loaded) return;
  const targets = s.config.providers.filter((p) => p.enabled && QUERY[p.id]);
  if (targets.length === 0) return;
  const now = Date.now();
  if (!force && now - lastPolledAt < s.config.refreshMin * 60_000) return;
  if (inflight) return;
  inflight = true;
  lastPolledAt = now;
  try {
    const results = await Promise.all(targets.map((p) => querySafe(p)));
    useQuotaStore.getState().applySnapshots(results);
  } finally {
    inflight = false;
  }
}

/** 覆盖层调用:启动即查 + 15s 心跳;providers 签名变化立即重查 */
export function useQuotaPoll() {
  const sig = useQuotaStore((s) => JSON.stringify(s.config.providers));
  const mountedRef = useRef(false);

  useEffect(() => {
    void pollOnce(true);
    const id = window.setInterval(() => void pollOnce(), WATCHDOG_MS);
    return () => window.clearInterval(id);
  }, []);

  // 设置页改完 provider(开关/key/预算)立即重查;mountedRef 跳首帧
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    void pollOnce(true);
  }, [sig]);
}

/** 启动时 loadQuotaPersist 完成后补一次强制查询——
 *  useQuotaPoll 挂载时的首查往往早于 loaded,会被跳过 */
export const forcePoll = () => pollOnce(true);
