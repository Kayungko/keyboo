// AI 额度 provider 注册表与查询适配器。
//
// 数据源分三类:
// - apikey:用户填 key,官方/半官方余额端点,一次 Bearer GET(端点见 research-apikey-providers.md);
// - local:订阅类,读本机 AI CLI 已有登录态(Rust command read_local_credential,白名单路径),
//   走标准 OAuth refresh 后查额度(端点见 research-subscription-providers.md);
// - placeholder:v2 预留(Claude Code/Copilot/Cursor/Windsurf),设置页禁用显示「即将支持」。
//
// 所有远程响应逐层可选链 + 数值清洗;任何异常 throw 出去,由 poll.ts 的 querySafe
// 统一转成 snapshot 的 error/stale(失败保留旧值,不清空)。

import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { QuotaProviderConfig } from "@/stores/useQuotaStore";

export type ProviderKind = "apikey" | "local" | "placeholder";

export interface ProviderMeta {
  id: string;
  name: string;
  kind: ProviderKind;
  /** 品牌色(VU 归属点 / 气泡 dot) */
  color: string;
  /** 余额类需要预算基准换算百分比 */
  needsBudget?: boolean;
  /** 预算缺省值(CNY 100 / USD 20) */
  defaultBudget?: number;
  keyPlaceholder?: string;
  hint?: string;
}

export interface QuotaReading {
  pct: number | null;
  label: string;
}

export type QueryFn = (cfg: QuotaProviderConfig) => Promise<QuotaReading>;

export const THRESHOLD = { ok: "#34d399", warn: "#fbbf24", low: "#f87171" };
export const colorOfPct = (pct: number) => (pct < 20 ? THRESHOLD.low : pct < 50 ? THRESHOLD.warn : THRESHOLD.ok);

export const PROVIDERS: ProviderMeta[] = [
  { id: "openrouter", name: "OpenRouter", kind: "apikey", color: "#6566f1", needsBudget: true, defaultBudget: 20, keyPlaceholder: "sk-or-v1-…", hint: "官方额度接口" },
  { id: "deepseek", name: "DeepSeek", kind: "apikey", color: "#4d6bfe", needsBudget: true, defaultBudget: 100, keyPlaceholder: "sk-…", hint: "官方余额接口" },
  { id: "moonshot", name: "Moonshot Kimi", kind: "apikey", color: "#1a1a1a", needsBudget: true, defaultBudget: 100, keyPlaceholder: "sk-…", hint: "官方余额接口" },
  { id: "siliconflow", name: "硅基流动", kind: "apikey", color: "#ee7621", needsBudget: true, defaultBudget: 100, keyPlaceholder: "sk-…", hint: "接口未显式文档化,结构变化自动降级" },
  { id: "stability", name: "Stability AI", kind: "apikey", color: "#7d8cff", needsBudget: true, defaultBudget: 20, keyPlaceholder: "sk-…", hint: "官方 credits 接口" },
  { id: "codex", name: "Codex CLI", kind: "local", color: "#10a37f", hint: "读取本机 ~/.codex 登录态,显示周额度剩余" },
  { id: "gemini-cli", name: "Gemini CLI", kind: "local", color: "#4285f4", hint: "读取本机 ~/.gemini 登录态,显示每日配额剩余" },
  { id: "claude-code", name: "Claude Code", kind: "placeholder", color: "#d97757", hint: "即将支持(本机凭据在 Windows 凭据管理器,链路实测中)" },
  { id: "copilot", name: "GitHub Copilot", kind: "placeholder", color: "#8957e5", hint: "即将支持(device flow 授权)" },
  { id: "cursor", name: "Cursor", kind: "placeholder", color: "#8b8bff", hint: "即将支持" },
  { id: "windsurf", name: "Windsurf", kind: "placeholder", color: "#00b8d4", hint: "即将支持" },
];

export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id);

// ─── 工具 ───

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

async function getJson(url: string, key: string): Promise<any> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    connectTimeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/** 解码 JWT payload(不验签,仅取声明字段)。
 *  注意:JWT 是 base64url(无 padding),长度未必是 4 的倍数,
 *  atob 遇到非 4 倍数长度会抛异常——必须先补全 padding 再解码。 */
function jwtPayload(token: string): any {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

// ─── apikey 适配器 ───

const budgetOf = (cfg: QuotaProviderConfig, fallback: number) =>
  typeof cfg.budget === "number" && cfg.budget > 0 ? cfg.budget : fallback;

const queryOpenRouter: QueryFn = async (cfg) => {
  const key = cfg.apiKey ?? "";
  // 优先 key 级限额(创建 key 时设置的 credit limit)
  const keyInfo = await getJson("https://openrouter.ai/api/v1/auth/key", key);
  const d = keyInfo?.data;
  const limit = num(d?.limit);
  const remaining = num(d?.limit_remaining);
  if (limit != null && limit > 0 && remaining != null) {
    return { pct: clampPct((remaining / limit) * 100), label: `$${remaining.toFixed(2)} / $${limit.toFixed(2)}` };
  }
  // 回退:账户 credits 差值,按预算换算
  const credits = await getJson("https://openrouter.ai/api/v1/credits", key);
  const total = num(credits?.data?.total_credits) ?? 0;
  const usage = num(credits?.data?.total_usage) ?? 0;
  const balance = Math.max(0, total - usage);
  const budget = budgetOf(cfg, 20);
  return { pct: clampPct((balance / budget) * 100), label: `$${balance.toFixed(2)}` };
};

const queryDeepSeek: QueryFn = async (cfg) => {
  const json = await getJson("https://api.deepseek.com/user/balance", cfg.apiKey ?? "");
  const info = (json?.balance_infos as any[])?.[0];
  const balance = num(info?.total_balance);
  if (balance == null) throw new Error("响应结构变化");
  const symbol = info?.currency === "USD" ? "$" : "¥";
  return { pct: clampPct((balance / budgetOf(cfg, 100)) * 100), label: `${symbol}${balance.toFixed(2)}` };
};

const queryMoonshot: QueryFn = async (cfg) => {
  const json = await getJson("https://api.moonshot.cn/v1/users/me/balance", cfg.apiKey ?? "");
  const balance = num(json?.data?.available_balance);
  if (balance == null) throw new Error("响应结构变化");
  return { pct: clampPct((balance / budgetOf(cfg, 100)) * 100), label: `¥${balance.toFixed(2)}` };
};

const querySiliconFlow: QueryFn = async (cfg) => {
  const json = await getJson("https://api.siliconflow.cn/v1/user/info", cfg.apiKey ?? "");
  const balance = num(json?.data?.balance);
  if (balance == null) throw new Error("响应结构变化");
  return { pct: clampPct((balance / budgetOf(cfg, 100)) * 100), label: `¥${balance.toFixed(2)}` };
};

const queryStability: QueryFn = async (cfg) => {
  const json = await getJson("https://api.stability.ai/v1/user/balance", cfg.apiKey ?? "");
  const credits = num(json?.credits);
  if (credits == null) throw new Error("响应结构变化");
  return { pct: clampPct((credits / budgetOf(cfg, 20)) * 100), label: `$${credits.toFixed(2)}` };
};

// ─── local(订阅类本机登录态)适配器 ───

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const queryCodex: QueryFn = async () => {
  const raw = await invoke<string>("read_local_credential", { kind: "codex" });
  const auth = JSON.parse(raw);
  let access: string | undefined = auth?.tokens?.access_token;
  const idToken: string | undefined = auth?.tokens?.id_token;
  const refresh: string | undefined = auth?.tokens?.refresh_token;
  if (!access) throw new Error("auth.json 缺少 token,请在 Codex CLI 重新登录");

  // access token 过期则先 refresh(JWT exp 判定;端点接受 JSON body)
  const payload = jwtPayload(access);
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() && refresh) {
    const res = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: CODEX_CLIENT_ID,
      }),
      connectTimeout: 10000,
    });
    if (!res.ok) throw new Error(`token 刷新失败 HTTP ${res.status},请在 Codex CLI 重新登录`);
    const tok = await res.json();
    access = tok?.access_token ?? access;
  }

  // account_id 优先读 auth.json 的 tokens.account_id(新版 Codex 直接落盘该字段);
  // 回退到 JWT 声明解析(auth_data.account_id / https://api.openai.com/auth.chatgpt_account_id)
  const idPayload = jwtPayload(idToken ?? "");
  const accessTokenPayload = jwtPayload(access ?? "");
  const accountId: string | undefined =
    auth?.tokens?.account_id ??
    idPayload?.auth_data?.account_id ??
    idPayload?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
    accessTokenPayload?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
    accessTokenPayload?.auth_data?.account_id;

  const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: "application/json",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
    connectTimeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const win = json?.rate_limit?.primary_window;
  const used = num(win?.used_percent);
  if (used == null) throw new Error("响应结构变化");
  const remain = Math.round(100 - used);
  // 窗口长度按 limit_window_seconds 动态判断(当前 Codex 为 7 天=604800s,历史为 5 小时=18000s),
  // 文案据此自适应,避免额度模型再调整时写死
  const windowSec = num(win?.limit_window_seconds);
  const label = windowSec && windowSec >= 86400 ? `周额度剩 ${remain}%` : `窗口剩 ${remain}%`;
  return { pct: clampPct(remain), label };
};

const queryGemini: QueryFn = async () => {
  const raw = await invoke<string>("read_local_credential", { kind: "gemini" });
  const creds = JSON.parse(raw);
  let access: string | undefined = creds?.Token?.access_token;
  if (!access) throw new Error("oauth_creds.json 缺少 token,请在 Gemini CLI 重新登录");

  // 过期则 refresh
  const expiry = Date.parse(creds?.Token?.expiry ?? "");
  if (Number.isFinite(expiry) && expiry < Date.now() && creds?.Token?.refresh_token) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.Token.refresh_token,
        client_id: creds.Token.client_id ?? "",
        client_secret: creds.Token.client_secret ?? "",
      }).toString(),
      connectTimeout: 10000,
    });
    if (!res.ok) throw new Error(`token 刷新失败 HTTP ${res.status},请在 Gemini CLI 重新登录`);
    const tok = await res.json();
    access = tok?.access_token ?? access;
  }

  const res = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: "{}",
    connectTimeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // 取所有 bucket 里最小的剩余比例(最紧张的那个配额)
  let min: { frac: number; name: string } | null = null;
  for (const group of (json?.groups as any[]) ?? []) {
    for (const bucket of (group?.buckets as any[]) ?? []) {
      const frac = num(bucket?.remainingFraction);
      if (frac != null && (min === null || frac < min.frac)) {
        min = { frac, name: bucket?.displayName ?? "配额" };
      }
    }
  }
  if (!min) throw new Error("响应结构变化");
  return { pct: clampPct(min.frac * 100), label: `${min.name} 剩 ${Math.round(min.frac * 100)}%` };
};

// ─── 注册表 ───

export const QUERY: Record<string, QueryFn> = {
  openrouter: queryOpenRouter,
  deepseek: queryDeepSeek,
  moonshot: queryMoonshot,
  siliconflow: querySiliconFlow,
  stability: queryStability,
  codex: queryCodex,
  "gemini-cli": queryGemini,
};
