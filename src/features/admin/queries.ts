/**
 * TanStack Query hooks：每个 admin 端点一个 key 工厂 + hook。
 * 定型 M1 的轮询/失效模式（docs/react-refactor-plan.md §6-M1）：
 *   · 列表类 staleTime 0（切 tab 即取新，与旧行为一致）
 *   · 写操作成功后精确 invalidate 相关 key
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminApi, adminGet,
  statsSchema, devicesSchema, messagesSchema, qaSchema, qaTrendSchema, qaTopicsSchema, leadsSchema,
  configSchema, themeSchema, genderSchema, voiceSchema, greetingSchema,
  contentListSchema, contentOneSchema, kbSchema, variantSchema,
  type MessagesRes, type VariantRes,
} from '../../lib/api/admin';

export const qk = {
  stats: ['admin', 'stats'] as const,
  devices: (limit: number, offset: number, q: string) => ['admin', 'devices', { limit, offset, q }] as const,
  messages: (params: Record<string, string | number>) => ['admin', 'messages', params] as const,
  qa: ['admin', 'qa'] as const,
  qaTrend: (days: number) => ['admin', 'qaTrend', days] as const,
  qaTopics: (limit: number) => ['admin', 'qaTopics', limit] as const,
  leads: (days: number) => ['admin', 'leads', days] as const,
  config: ['admin', 'config'] as const,
  theme: ['admin', 'theme'] as const,
  gender: ['admin', 'gender'] as const,
  voice: ['admin', 'voice'] as const,
  greeting: ['admin', 'greeting'] as const,
  contentList: ['admin', 'contentList'] as const,
  contentOne: (key: string) => ['admin', 'contentOne', key] as const,
  kb: ['admin', 'kb'] as const,
};

/* ── 概览 ── */
export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: () => adminGet('/api/admin/stats', statsSchema) });
}

/* ── 设备台账 ── */
export function useDevices(limit: number, offset: number, q: string) {
  return useQuery({
    queryKey: qk.devices(limit, offset, q),
    queryFn: () => adminGet(
      `/api/admin/devices?limit=${limit}&offset=${offset}` + (q ? `&q=${encodeURIComponent(q)}` : ''),
      devicesSchema,
    ),
  });
}

export function useBlockDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { device_hash: string; blocked: boolean }) =>
      adminApi('/api/admin/devices/block', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'devices'] });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

/* ── 留言审核 ── */
export interface MsgFilter { q: string; status: string; device: string; focus: string; limit: number; offset: number; }

export function msgQueryString(f: MsgFilter): string {
  const p: string[] = [];
  if (f.q) p.push('q=' + encodeURIComponent(f.q));
  if (f.status) p.push('status=' + encodeURIComponent(f.status));
  if (f.device) p.push('device_hash=' + encodeURIComponent(f.device));
  if (f.focus) p.push('focus=' + encodeURIComponent(f.focus));
  p.push('limit=' + f.limit, 'offset=' + f.offset);
  return p.join('&');
}

export function useMessages(f: MsgFilter) {
  const qs = msgQueryString(f);
  return useQuery({
    queryKey: qk.messages({ q: f.q, status: f.status, device: f.device, focus: f.focus, limit: f.limit, offset: f.offset }),
    queryFn: () => adminGet('/api/admin/messages?' + qs, messagesSchema) as Promise<MessagesRes>,
  });
}

export function useSetMessageStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      adminApi('/api/admin/messages/status', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'messages'] });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

export function useReplyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { messageId?: string; id?: string; text?: string }) =>
      adminApi<{ replies: Array<{ id: string; author: string; text: string; created_at?: number | null; status?: string }> }>('/api/admin/messages/reply', {
        method: v.id ? 'DELETE' : 'POST',
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'messages'] });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

/* ── 问答看板 ── */
export function useQa() { return useQuery({ queryKey: qk.qa, queryFn: () => adminGet('/api/admin/qa', qaSchema) }); }
export function useQaTrend(days = 14) {
  return useQuery({ queryKey: qk.qaTrend(days), queryFn: () => adminGet(`/api/admin/qa/trend?days=${days}`, qaTrendSchema) });
}
export function useQaTopics(limit = 200) {
  return useQuery({ queryKey: qk.qaTopics(limit), queryFn: () => adminGet(`/api/admin/qa/topics?limit=${limit}`, qaTopicsSchema) });
}

/* ── 线索（提问记录里挑招聘方 / 合作方）── */
export function useLeads(days = 30) {
  return useQuery({ queryKey: qk.leads(days), queryFn: () => adminGet(`/api/admin/leads?days=${days}`, leadsSchema) });
}

/* ── 模型与提示词 / 主题 / 套装 ── */
export function useConfig() { return useQuery({ queryKey: qk.config, queryFn: () => adminGet('/api/admin/config', configSchema) }); }
export function useSaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; model: string; prompt: string }) =>
      adminApi('/api/admin/config', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.config }),
  });
}
export function useTheme() { return useQuery({ queryKey: qk.theme, queryFn: () => adminGet('/api/admin/theme', themeSchema) }); }
export function useSetTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { theme: string }) => adminApi('/api/admin/theme', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.theme }),
  });
}
export function useGender() { return useQuery({ queryKey: qk.gender, queryFn: () => adminGet('/api/admin/gender', genderSchema) }); }
export function useSetGender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { gender: string }) => adminApi('/api/admin/gender', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.gender }),
  });
}

/* ── AI 语音 ── */
export function useVoice() { return useQuery({ queryKey: qk.voice, queryFn: () => adminGet('/api/admin/voice', voiceSchema) }); }
export function usePickVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { voice: number; gender: string }) => {
      const d = await adminApi<unknown>('/api/admin/voice', { method: 'POST', body: JSON.stringify(v) });
      const { voicePickSchema } = await import('../../lib/api/admin');
      return voicePickSchema.parse(d);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.voice }),
  });
}
export function useGreeting() { return useQuery({ queryKey: qk.greeting, queryFn: () => adminGet('/api/admin/greeting', greetingSchema) }); }
export function useSaveGreeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { text?: string; reset?: boolean }) =>
      adminApi('/api/admin/greeting', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.greeting }),
  });
}
export async function previewVoiceReq(voice: number, text: string) {
  const { voicePreviewSchema } = await import('../../lib/api/admin');
  return voicePreviewSchema.parse(
    await adminApi<unknown>('/api/admin/voice/preview', { method: 'POST', body: JSON.stringify({ voice, text }) }),
  );
}

/* ── 站点数据 ── */
export function useContentList() {
  return useQuery({ queryKey: qk.contentList, queryFn: () => adminGet('/api/admin/site-content', contentListSchema) });
}
export function useContentOne(key: string) {
  return useQuery({
    queryKey: qk.contentOne(key),
    queryFn: () => adminGet('/api/admin/site-content?key=' + encodeURIComponent(key), contentOneSchema),
    enabled: !!key,
  });
}
export function useSaveContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; text: string }) =>
      adminApi('/api/admin/site-content', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.contentList });
      qc.invalidateQueries({ queryKey: qk.contentOne(v.key) });
    },
  });
}
export function useResetContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      adminApi('/api/admin/site-content?key=' + encodeURIComponent(key), { method: 'DELETE' }),
    onSuccess: (_d, key) => {
      qc.invalidateQueries({ queryKey: qk.contentList });
      qc.invalidateQueries({ queryKey: qk.contentOne(key) });
    },
  });
}

/* ── 知识库 ── */
export function useKb() { return useQuery({ queryKey: qk.kb, queryFn: () => adminGet('/api/admin/kb', kbSchema) }); }
export function useRebuildKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi('/api/admin/kb', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb }),
  });
}

/* ── 变体生成 ── */
export function useVariant() {
  return useMutation({
    mutationFn: (v: { jd: string; rewrite: boolean }) =>
      adminApi<unknown>('/api/admin/variant', { method: 'POST', body: JSON.stringify(v) })
        .then((d) => variantSchema.parse(d) as VariantRes),
  });
}
