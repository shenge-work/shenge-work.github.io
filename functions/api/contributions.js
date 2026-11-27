/* /api/contributions —— 实时 GitHub 贡献数据（Pages Function）
   ──────────────────────────────────────────────────────────────
   原来的 data/contributions.json 由 Actions 每天写仓库，而线上 /data/*
   走 D1 的 site_content 快照（只在 11-25 灌过一次），于是统计行永远是旧的。
   这里改为访客滚到联系板块时按访问现拉 GitHub 公开贡献日历：

     GitHub 公开页面 → 解析 data-date/data-count → 站点既有 JSON 形状
     SITE_KV 缓存 5 分钟（不配 KV 也能跑，只是每次现拉）

   不需要 token：GitHub 的公开贡献日历本身就是公开的；token 留在 Actions
   那条每日蛇图生成链路里，绝不进前端。GitHub 偶发失败时回退 D1 / 静态兜底，
   页面不会因此白屏。
   ────────────────────────────────────────────────────────────── */
import {
  DEFAULT_LOGIN, CACHE_PREFIX, CACHE_TTL, fromDays, payloadFromSvg,
} from '../lib/contributions.js';
import { readContent } from '../lib/site-content.js';

const GH_CALENDAR = 'https://github.com/users/';
const UA = 'shenge-work.github.io-contributions/1.0';

let inflight = null;

async function fetchLive(login) {
  if (!inflight) {
    inflight = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const url = GH_CALENDAR + encodeURIComponent(login) + '/contributions';
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('github_http_' + res.status);
        const text = await res.text();
        return payloadFromSvg(text, login);
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

async function storedPayload(env, request, login) {
  const row = await readContent(env, 'contributions').catch(() => null);
  if (row) {
    try {
      const raw = JSON.parse(row.payload);
      const payload = fromDays(raw.days, login, row.updated_at || raw.updatedAt, raw.total);
      if (payload.days.length) return payload;
    } catch (e) { /* 脏数据继续走静态兜底 */ }
  }
  const origin = new URL(request.url).origin;
  const res = await fetch(origin + '/data/fallback/contributions.json', {
    headers: { 'Sec-Fetch-Site': 'same-origin', 'User-Agent': UA },
  }).catch(() => null);
  if (res && res.ok) {
    try {
      const raw = await res.json();
      const payload = fromDays(raw.days, login, raw.updatedAt, raw.total);
      if (payload.days.length) return payload;
    } catch (e) { /* 兜底也坏了就整体失败 */ }
  }
  return null;
}

function respond(payload, source, maxAge) {
  const body = Object.assign({}, payload, { source });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? 'public, max-age=' + maxAge : 'no-store',
      'X-Contributions-Source': source,
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const login = String(env.GH_LOGIN || DEFAULT_LOGIN);
  const kv = env.SITE_KV;
  const key = CACHE_PREFIX + login;

  if (kv) {
    try {
      const hit = await kv.get(key, 'json');
      if (hit && hit.payload && hit.fetchedAt &&
          Date.now() - new Date(hit.fetchedAt).getTime() < CACHE_TTL * 1000) {
        return respond(hit.payload, 'cache', 60);
      }
    } catch (e) { /* KV 不可用就现拉 */ }
  }

  let payload = null;
  try {
    payload = await fetchLive(login);
  } catch (e) {
    payload = await storedPayload(env, request, login);
    if (payload) return respond(payload, 'stale', 0);
    return new Response(JSON.stringify({ error: 'contributions_unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (kv) {
    try {
      await kv.put(key, JSON.stringify({ fetchedAt: new Date().toISOString(), payload }), {
        expirationTtl: CACHE_TTL,
      });
    } catch (e) { /* 缓存失败不影响本次响应 */ }
  }
  return respond(payload, 'live', 60);
}
