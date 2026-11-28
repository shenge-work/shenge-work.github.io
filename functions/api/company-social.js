/* ──────────────────────────────────────────────────────────────────────
   公司档案互动 API · Cloudflare Pages Function（路由 /api/company-social）
   ──────────────────────────────────────────────────────────────────────
   每份公司档案详情页（company.html?c=id / 简历抽屉）共用这一套：
     · 小眼睛浏览量：同一「设备 + UA」对同一档案只计一次；
     · 档案点赞：同一设备可点一次 / 再点取消；
     · 评论与回复：顶层评论 + 楼中回复，公开可见，按时间正序；
     · 评论点赞：同一设备对每条评论可点一次 / 再点取消。

   设备唯一化（用户口径：设备哈希值 + 设备 + 浏览器 UA）：
     前端 localStorage 生成随机 device id，并把平台 / 屏幕 / 语言 / 时区等
     组成指纹一起发来；服务端把 device id + 指纹 + UA 拼成 HMAC-SHA256
     （pepper = DEVICE_HASH_PEPPER），只存 32 位十六进制哈希，不存原文。
     清缓存 / 换浏览器 = 新设备；同一人的手机与电脑算两台，这是预期行为。

   接口：
     GET  /api/company-social?c=<id>
          → { ok, views, likes, liked, comments:[{id,name,text,ts,likes,liked,
             replies:[...]}] }
     POST /api/company-social { c, action }
          action = view | like | unlike | comment | reply | commentLike | commentUnlike
          comment/reply 另需 { name?, text, parentId? }；commentLike 需 { id }
     OPTIONS → 204 CORS 预检

   存储：D1（绑定名 DB，表结构见 db/schema.sql）
     company_views / company_likes / company_comments / company_comment_likes
     限流复用 rate_limits（bucket 形如 cs:ip:<hash>、cs:day）

   设计取舍：
     · GET 公开只读，无需设备头；写操作必须带合法 X-Device-Id；
     · 浏览量用 INSERT OR IGNORE + meta.changes 判断新访客，避免读改写漂移；
     · 点赞是「切换」语义（toggle），前端不必先查状态；
     · Origin 有则校验、无则放行（curl / 服务端调用不带 Origin）；
     · 不接 Turnstile：留言墙已有该能力，本接口仅做长度/限流/去重的基础防护。
   ────────────────────────────────────────────────────────────────────── */

import { secretValue } from '../lib/secret.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const DEFAULT_ORIGINS = [
  'https://chenpeisheng.cn',
  'https://shenge-work.pages.dev',
  '*.shenge-work.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8866',
  'http://127.0.0.1:8866',
  'http://localhost:8877',
  'http://127.0.0.1:8877',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const MAX_TEXT = 500;
const MIN_TEXT = 2;
const MAX_NAME = 24;
const MAX_REPLIES_PER_COMMENT = 200;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_LIMIT = 120;
const DAY_LIMIT = 200;
const DUP_WINDOW_MS = 10 * 1000;
const VIEW_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, allow) {
  const o = String(origin || '').trim();
  if (!o) return false;
  const host = o.replace(/^https?:\/\//, '');
  return allow.some((rule) => {
    if (rule === o) return true;
    if (rule.indexOf('*.') === 0) {
      const suffix = rule.slice(1);
      return host.length > suffix.length && host.slice(-suffix.length) === suffix;
    }
    return false;
  });
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Device-Fp',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, extra, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extra || {}),
  });
}

/* 纯文本净化：去标签 / 控制字符，压缩空白，按「字符」而非字节截断。
   参考 wall.js 的 clean()，这里额外去掉零宽字符，避免用不可见字符绕过去重。 */
function clean(raw, max) {
  return String(raw == null ? '' : raw)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function companyIdOf(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  return CID_RE.test(s) ? s : '';
}

function ipOf(request) {
  const xff = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  return (xff.split(',')[0] || 'unknown').trim();
}

async function sha256hex(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'unknown';
  }
}

/* 设备 + 指纹 + UA → 不可逆 32 位哈希。
   与留言墙同一 pepper：换 pepper 等于所有设备重新计数。 */
async function visitorHashOf(request, env) {
  const did = String(request.headers.get('X-Device-Id') || '').trim();
  if (!DEVICE_RE.test(did)) return '';
  const fp = clean(request.headers.get('X-Device-Fp'), 300);
  const ua = clean(request.headers.get('User-Agent'), 300);
  const pepper = secretValue(env, ['DEVICE_HASH_PEPPER'], 'dev-only-pepper-change-me');
  if (!pepper) return '';
  const raw = did + '|' + fp + '|' + ua;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch (e) {
    /* 极老运行时没有 subtle：退化为 SHA-256 前缀，仍不可还原原文 */
    return (await sha256hex(raw)) + (await sha256hex(pepper)).slice(0, 16);
  }
}

/* 固定窗口限流：条件 UPDATE 只在未达上限时自增，被拒请求不写库。 */
async function gate(db, bucket, window, limit, ttlSeconds) {
  const ttl = Math.max(60, ttlSeconds);
  const expires = Date.now() + ttl * 1000;
  const row = await db.prepare(
    `INSERT INTO rate_limits (bucket, window, count, expires_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (bucket, window) DO UPDATE SET
       count = rate_limits.count + 1,
       expires_at = excluded.expires_at
     WHERE rate_limits.count < ?
     RETURNING count`
  ).bind(bucket, window, expires, limit).first();
  return row ? Number(row.count) : null;
}

function newId(prefix, now) {
  return prefix + now.toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── 读取：浏览量 / 点赞数 / 评论树（含「本机是否已赞」） ── */
async function readState(db, cid, vh) {
  const views = await db.prepare('SELECT COUNT(*) AS n FROM company_views WHERE company_id = ?')
    .bind(cid).first();
  const likes = await db.prepare('SELECT COUNT(*) AS n FROM company_likes WHERE company_id = ?')
    .bind(cid).first();
  const liked = vh
    ? !!(await db.prepare('SELECT 1 AS hit FROM company_likes WHERE company_id = ? AND visitor_hash = ?')
      .bind(cid, vh).first())
    : false;

  const rows = await db.prepare(
    `SELECT id, parent_id, name, text, created_at, likes_count
       FROM company_comments
      WHERE company_id = ? AND status = 'visible'
      ORDER BY created_at ASC`
  ).bind(cid).all();

  const myLikes = vh
    ? await db.prepare(
        `SELECT comment_id FROM company_comment_likes WHERE visitor_hash = ?`
      ).bind(vh).all()
    : { results: [] };
  const likedIds = new Set((myLikes.results || []).map((r) => r.comment_id));

  const comments = [];
  const byId = Object.create(null);
  for (const r of (rows.results || [])) {
    const item = {
      id: r.id,
      name: r.name,
      text: r.text,
      ts: Number(r.created_at) || 0,
      likes: Number(r.likes_count) || 0,
      liked: likedIds.has(r.id),
      replies: [],
    };
    byId[r.id] = item;
    if (r.parent_id && byId[r.parent_id]) byId[r.parent_id].replies.push(item);
    else comments.push(item);
  }
  return {
    ok: true,
    views: views ? Number(views.n) || 0 : 0,
    likes: likes ? Number(likes.n) || 0 : 0,
    liked: liked,
    comments: comments,
  };
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin, allowedOrigins(env))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const allow = allowedOrigins(env);
  if (origin && !isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, {}, 403);
  }
  const cors = corsHeaders(origin && isAllowedOrigin(origin, allow) ? origin : '');
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'db_not_bound' }, cors, 503);

  const cid = companyIdOf(new URL(request.url).searchParams.get('c'));
  if (!cid) return json({ ok: false, error: 'bad_request', message: '缺少档案 id' }, cors, 400);

  const vh = await visitorHashOf(request, env);
  try {
    return json(await readState(db, cid, vh), cors);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}

export async function onRequestPost({ request, env, ctx }) {
  const origin = request.headers.get('Origin');
  const allow = allowedOrigins(env);
  if (origin && !isAllowedOrigin(origin, allow)) {
    return json({ ok: false, error: 'origin_not_allowed' }, {}, 403);
  }
  const cors = corsHeaders(origin ? origin : '');
  const db = env.DB;
  if (!db) return json({ ok: false, error: 'db_not_bound' }, cors, 503);

  const vh = await visitorHashOf(request, env);
  if (!vh) {
    return json({ ok: false, error: 'device_required', message: '设备标识缺失或格式不合法' }, cors, 400);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'bad_request', message: '请求体不是合法 JSON' }, cors, 400);
  }
  const cid = companyIdOf(body.c);
  if (!cid) return json({ ok: false, error: 'bad_request', message: '缺少档案 id' }, cors, 400);
  const action = String(body.action || '').trim();
  const allowed = ['view', 'like', 'unlike', 'comment', 'reply', 'commentLike', 'commentUnlike'];
  if (allowed.indexOf(action) < 0) {
    return json({ ok: false, error: 'bad_request', message: '未知操作' }, cors, 400);
  }

  const now = Date.now();
  const ipKey = await sha256hex(ipOf(request));
  const win = Math.floor(now / IP_WINDOW_MS);
  const winEnd = (win + 1) * IP_WINDOW_MS;
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const dayEnd = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);

  try {
    /* 浏览不计入写限流（量最大、只读语义），其余写操作按 IP + 天双限 */
    if (action !== 'view') {
      const ipOk = await gate(db, 'cs:ip:' + ipKey, String(win), IP_LIMIT,
        Math.ceil((winEnd - now) / 1000) + 60);
      if (ipOk === null) {
        return json({ ok: false, error: 'rate_limited', message: '操作有点频繁，稍后再试' }, cors, 429);
      }
      const dayOk = await gate(db, 'cs:day', dayKey, DAY_LIMIT,
        Math.ceil((dayEnd - now) / 1000) + 3600);
      if (dayOk === null) {
        return json({ ok: false, error: 'rate_limited', message: '今日互动已达上限，明天再来' }, cors, 429);
      }
    }

    if (action === 'view') {
      /* 过期记录顺手清理；INSERT OR IGNORE 后用 changes 判断是不是新访客 */
      await db.prepare('DELETE FROM company_views WHERE last_seen < ?')
        .bind(now - VIEW_TTL_MS).run();
      const ins = await db.prepare(
        `INSERT OR IGNORE INTO company_views (company_id, visitor_hash, first_seen, last_seen)
         VALUES (?, ?, ?, ?)`
      ).bind(cid, vh, now, now).run();
      const isNew = !!(ins && ins.meta && ins.meta.changes > 0);
      if (!isNew) {
        await db.prepare('UPDATE company_views SET last_seen = ? WHERE company_id = ? AND visitor_hash = ?')
          .bind(now, cid, vh).run();
      }
      const state = await readState(db, cid, vh);
      return json(Object.assign(state, { counted: true, isNew: isNew }), cors);
    }

    if (action === 'like' || action === 'unlike') {
      if (action === 'like') {
        await db.prepare(
          'INSERT OR IGNORE INTO company_likes (company_id, visitor_hash, created_at) VALUES (?, ?, ?)'
        ).bind(cid, vh, now).run();
      } else {
        await db.prepare('DELETE FROM company_likes WHERE company_id = ? AND visitor_hash = ?')
          .bind(cid, vh).run();
      }
      return json(await readState(db, cid, vh), cors);
    }

    if (action === 'commentLike' || action === 'commentUnlike') {
      const id = String(body.id || '').trim();
      if (!DEVICE_RE.test(id)) {
        return json({ ok: false, error: 'bad_request', message: '评论 id 不合法' }, cors, 400);
      }
      const target = await db.prepare(
        `SELECT id FROM company_comments WHERE id = ? AND company_id = ? AND status = 'visible'`
      ).bind(id, cid).first();
      if (!target) return json({ ok: false, error: 'not_found', message: '评论不存在' }, cors, 404);
      if (action === 'commentLike') {
        const ins = await db.prepare(
          `INSERT OR IGNORE INTO company_comment_likes (comment_id, visitor_hash, created_at)
           VALUES (?, ?, ?)`
        ).bind(id, vh, now).run();
        if (ins && ins.meta && ins.meta.changes > 0) {
          await db.prepare('UPDATE company_comments SET likes_count = likes_count + 1 WHERE id = ?')
            .bind(id).run();
        }
      } else {
        const del = await db.prepare(
          'DELETE FROM company_comment_likes WHERE comment_id = ? AND visitor_hash = ?'
        ).bind(id, vh).run();
        if (del && del.meta && del.meta.changes > 0) {
          await db.prepare(
            'UPDATE company_comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?'
          ).bind(id).run();
        }
      }
      return json(await readState(db, cid, vh), cors);
    }

    /* comment / reply */
    const text = clean(body.text, MAX_TEXT);
    if (!text) return json({ ok: false, error: 'bad_request', message: '内容不能为空' }, cors, 400);
    if (Array.from(text).length < MIN_TEXT) {
      return json({ ok: false, error: 'bad_request', message: '再多写两个字吧（至少 2 个字）' }, cors, 400);
    }
    const name = clean(body.name, MAX_NAME) || '匿名访客';
    let parentId = '';
    if (action === 'reply') {
      parentId = String(body.parentId || '').trim();
      if (!DEVICE_RE.test(parentId)) {
        return json({ ok: false, error: 'bad_request', message: '回复目标不合法' }, cors, 400);
      }
      const parent = await db.prepare(
        `SELECT id FROM company_comments
          WHERE id = ? AND company_id = ? AND parent_id IS NULL AND status = 'visible'`
      ).bind(parentId, cid).first();
      if (!parent) return json({ ok: false, error: 'not_found', message: '要回复的评论不存在' }, cors, 404);
      const cnt = await db.prepare(
        'SELECT COUNT(*) AS n FROM company_comments WHERE parent_id = ?'
      ).bind(parentId).first();
      if (cnt && Number(cnt.n) >= MAX_REPLIES_PER_COMMENT) {
        return json({ ok: false, error: 'full', message: '这条评论的回复已满' }, cors, 409);
      }
    }

    /* 同设备短时间重复提交：直接返回现状，不新增 */
    const dup = await db.prepare(
      `SELECT 1 AS hit FROM company_comments
        WHERE visitor_hash = ? AND text = ? AND created_at > ? LIMIT 1`
    ).bind(vh, text, now - DUP_WINDOW_MS).first();
    if (dup) {
      return json(Object.assign({ duplicate: true }, await readState(db, cid, vh)), cors, 200);
    }

    const id = newId('cc', now);
    await db.prepare(
      `INSERT INTO company_comments
         (id, company_id, parent_id, name, text, visitor_hash, created_at, likes_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'visible')`
    ).bind(id, cid, parentId || null, name, text, vh, now).run();

    /* 浏览也顺手记一次：发评论的人大概率看过这页，且同样按设备去重 */
    await db.prepare(
      `INSERT OR IGNORE INTO company_views (company_id, visitor_hash, first_seen, last_seen)
       VALUES (?, ?, ?, ?)`
    ).bind(cid, vh, now, now).run();

    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(Promise.resolve());
    return json(await readState(db, cid, vh), cors, 201);
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, cors, 500);
  }
}
