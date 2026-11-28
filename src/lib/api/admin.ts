/**
 * Admin API 客户端 + zod schema 首批（M1，docs/react-refactor-plan.md §5.6 / §6-M1）
 *
 * 契约与 functions/api/admin/** 一一对应（后端 JSDoc 即真源）；schema 宽松校验
 * （passthrough），字段缺失报类型错、多字段不拦——避免后端加字段即崩。
 *
 * 可移植边界：本文件属 lib 层，禁止 import astro（eslint 强制）。
 */
import { z } from 'zod';

/* ── 公共 ── */
const num = z.number().nullable().optional();
const ts = z.union([z.number(), z.string()]).nullable().optional();
/* qa_logs.empty 库里存 0/1 整数，前端按 truthy 判断；兼容布尔与数字 */
const flag = z.union([z.boolean(), z.number()]).optional();

/* ── schemas ── */
export const statsSchema = z.object({
  stats: z.object({
    pv: num, uv: num, uv24: num, devices: num, messages: num,
    today: num, hidden: num, pending_replies: num, blocked_devices: num,
  }).passthrough(),
}).passthrough();

export const devicesSchema = z.object({
  total: z.number().default(0),
  legacyMessages: z.number().default(0),
  devices: z.array(z.object({
    device_hash: z.string(),
    first_seen: ts,
    last_seen: ts,
    messages: z.number().default(0),
    hidden: z.number().default(0),
    last_text: z.string().nullable().optional(),
    status: z.string(),
  }).passthrough()).default([]),
}).passthrough();

export const replySchema = z.object({
  id: z.string(),
  author: z.string(),
  text: z.string(),
  created_at: ts,
  status: z.string().optional(),
}).passthrough();

export const repliesResSchema = z.object({
  replies: z.array(replySchema).default([]),
  ok: z.boolean().optional(),
}).passthrough();

export const messagesSchema = z.object({
  total: z.number().default(0),
  messages: z.array(z.object({
    id: z.string(),
    device_hash: z.string(),
    name: z.string().nullable().optional(),
    text: z.string(),
    status: z.string(),
    created_at: ts,
    reply_count: z.number().default(0),
    owner_replied: z.boolean().optional(),
    replies: z.array(replySchema).default([]),
  }).passthrough()).default([]),
}).passthrough();

export const qaSchema = z.object({
  totals: z.object({
    total: num, last7: num, empty: num, empty_rate: num, ms_avg: num,
  }).passthrough(),
  top_questions: z.array(z.object({ q: z.string(), n: z.number() }).passthrough()).default([]),
  top_hits: z.array(z.object({ id: z.string(), n: z.number() }).passthrough()).default([]),
  recent: z.array(z.object({
    ts, query: z.string(), hit_count: z.number().default(0), ms: num, empty: flag,
  }).passthrough()).default([]),
}).passthrough();

/* 线索：/api/admin/leads 把 qa_logs 里的意向提问按人聚合后的结果 */
export const leadsSchema = z.object({
  days: z.number().default(30),
  total_leads: z.number().default(0),
  stats: z.object({
    total: num, hire: num, collab: num, jobseek: num, contact: num,
    strong: num, weak: num, last7: num, presets: num, presetOnly: num, scanned: num,
  }).passthrough(),
  leads: z.array(z.object({
    ip: z.string(),
    intentKey: z.string(),
    intentLabel: z.string(),
    priority: z.number(),
    weak: z.boolean().default(false),
    count: z.number().default(0),
    presetClicks: z.number().default(0),
    firstTs: ts,
    lastTs: ts,
    queries: z.array(z.object({ ts, q: z.string(), intent: z.string() }).passthrough()).default([]),
    signals: z.array(z.string()).default([]),
    followUp: z.string().default(''),
  }).passthrough()).default([]),
}).passthrough();

export const qaTrendSchema = z.object({  series: z.array(z.object({
    date: z.string(), label: z.string(), total: z.number().default(0), empty: z.number().default(0),
  }).passthrough()).default([]),
}).passthrough();

export const qaTopicsSchema = z.object({
  topics: z.array(z.object({
    topic: z.string(), count: z.number().default(0), empty_rate: z.number().default(0),
    examples: z.array(z.string()).default([]),
  }).passthrough()).default([]),
  suggest: z.array(z.object({
    topic: z.string(), count: z.number().default(0), empty_rate: z.number().default(0),
  }).passthrough()).default([]),
}).passthrough();

export const configSchema = z.object({
  modules: z.array(z.object({
    key: z.string(), title: z.string(), note: z.string(),
    model: z.string(), prompt: z.string(),
    is_default: z.boolean().optional(), updated_at: ts,
  }).passthrough()).default([]),
}).passthrough();

export const themeSchema = z.object({
  theme: z.string().default(''),
  themes: z.array(z.object({ id: z.string(), name: z.string(), note: z.string() }).passthrough()).default([]),
}).passthrough();
export const genderSchema = themeSchema;

export const voiceSchema = z.object({
  voices: z.array(z.object({
    id: z.number(), name: z.string(), note: z.string(), type: z.string(), gender: z.string(),
  }).passthrough()).default([]),
  default_female_voice: z.number().default(101001),
  default_male_voice: z.number().default(101013),
  female_voice: z.number().default(101001),
  male_voice: z.number().default(101013),
  female_is_default: z.boolean().default(true),
  male_is_default: z.boolean().default(true),
  name: z.string().default(''),
  max_chars: z.number().default(150),
  upstream: z.string().default(''),
}).passthrough();

export const voicePickSchema = z.object({
  voice: z.number(), name: z.string().default(''), is_default: z.boolean().default(false),
}).passthrough();

export const voicePreviewSchema = z.object({
  mime: z.string().default('audio/mpeg'), audio: z.string(), name: z.string().default(''),
}).passthrough();

export const greetingSchema = z.object({
  text: z.string().default(''), max_chars: z.number().default(150), is_default: z.boolean().default(true),
}).passthrough();

export const contentListSchema = z.object({
  keys: z.array(z.object({
    key: z.string(), configured: z.boolean().default(false), size: z.number().default(0),
  }).passthrough()).default([]),
}).passthrough();

export const contentOneSchema = z.object({
  text: z.string().default(''), configured: z.boolean().default(false), updated_at: ts,
}).passthrough();

export const kbSchema = z.object({
  count: z.number().default(0), terms: z.number().default(0), updated_at: ts,
  stale: z.boolean().default(false), worker_ready: z.boolean().default(true),
  kb_version: z.string().default(''),
}).passthrough();

export const variantSchema = z.object({
  html: z.string().default(''),
  stats: z.object({
    bullets_before: num, bullets_after: num, bullets_dropped: num,
    projects: num, projects_total: num, bytes: num, top_score: num,
    skills_order: z.array(z.string()).default([]),
    rewrite: z.object({
      requested: z.boolean().default(false), model: z.string().optional(),
      rewritten: z.number().default(0), rejected: z.number().default(0),
      chars_delta: z.number().default(0), reasons: z.array(z.string()).default([]),
      reason: z.string().optional(),
    }).passthrough().default({ requested: false, rewritten: 0, rejected: 0, chars_delta: 0, reasons: [] }),
  }).passthrough(),
}).passthrough();

export const authMethodsSchema = z.object({
  ok: z.boolean().default(true),
  wechat: z.object({ qr: z.boolean().default(false), mp: z.boolean().default(false) }).passthrough(),
  inWechat: z.boolean().default(false),
  mini: z.boolean().default(false),
  email: z.object({
    enabled: z.boolean().default(true), count: z.number().default(0), hint: z.string().optional(),
  }).passthrough(),
}).passthrough();

export const loginCodeSchema = z.object({
  ok: z.boolean().default(true), email: z.string().optional(), cooldown: z.number().default(60),
}).passthrough();

export const miniQrSchema = z.object({
  ok: z.boolean().default(true), ticket: z.string().default(''), image: z.string().default(''),
}).passthrough();

/* ── 推导类型 ── */
export type Stats = z.infer<typeof statsSchema>['stats'];
export type DevicesRes = z.infer<typeof devicesSchema>;
export type DeviceRow = DevicesRes['devices'][number];
export type MessagesRes = z.infer<typeof messagesSchema>;
export type Message = MessagesRes['messages'][number];
export type Reply = z.infer<typeof replySchema>;
export type QaRes = z.infer<typeof qaSchema>;
export type QaTrendRes = z.infer<typeof qaTrendSchema>;
export type QaTopicsRes = z.infer<typeof qaTopicsSchema>;
export type LeadsRes = z.infer<typeof leadsSchema>;
export type Lead = LeadsRes['leads'][number];
export type ConfigRes = z.infer<typeof configSchema>;
export type ConfigModule = ConfigRes['modules'][number];
export type ThemeRes = z.infer<typeof themeSchema>;
export type VoiceRes = z.infer<typeof voiceSchema>;
export type VoiceRow = VoiceRes['voices'][number];
export type GreetingRes = z.infer<typeof greetingSchema>;
export type ContentListRes = z.infer<typeof contentListSchema>;
export type ContentKey = ContentListRes['keys'][number];
export type ContentOneRes = z.infer<typeof contentOneSchema>;
export type KbRes = z.infer<typeof kbSchema>;
export type VariantRes = z.infer<typeof variantSchema>;
export type AuthMethods = z.infer<typeof authMethodsSchema>;

/* ── 客户端 ──
   X-Admin-Request 防 CSRF + 401 兜底跳登录，与旧 admin.js 行为逐字对齐。 */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function toLogin() {
  const next = location.pathname + location.search;
  location.replace('/login?next=' + encodeURIComponent(next));
}

export async function adminApi<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers || {});
  if (opts.body) headers.set('Content-Type', 'application/json');
  if ((opts.method || 'GET').toUpperCase() !== 'GET') headers.set('X-Admin-Request', '1');
  const r = await fetch(path, { ...opts, headers, credentials: 'include' });
  if (r.status === 401) { toLogin(); throw new ApiError('unauthorized', 401); }
  const d: unknown = await r.json().catch(() => ({}));
  const obj = d as { ok?: boolean; message?: string; error?: string };
  if (!r.ok || obj?.ok === false) {
    throw new ApiError(obj?.message || obj?.error || ('HTTP ' + r.status), r.status);
  }
  return d as T;
}

/* 带校验的便捷封装 */
export async function adminGet<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
  return schema.parse(await adminApi<unknown>(path));
}
