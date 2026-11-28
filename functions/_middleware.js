/* ──────────────────────────────────────────────────────────────────────
   全站边缘防护中间件（Cloudflare Pages Functions）
   ──────────────────────────────────────────────────────────────────────
   根目录 _middleware.js 会拦截整个站点，包括静态文件。这里做四件事：

   ① 挡采集器：常见爬虫 / AI 训练爬虫 / 无头浏览器 / 命令行 HTTP 工具
      的 UA 直接 403；搜索引航（Googlebot / Bingbot 等）放行，不影响收录。
   ② 挡扫描：wp-login、.env、.git、phpmyadmin 之类蜜罐路径直接 404；
      函数源码目录 /functions、/db、/scripts 一律不外露。
   ③ 挡盗取：/data/*.json 等数据文件要求同源信号（Sec-Fetch-Site 或本站
      Referer），跨站抓取 / 直连脚本一律 403；简历证书额外要求签名头
      X-Cert-Token（由 /api/deliver 在服务端读取时附带），没有签名一律 404。
   ④ 防刷：/api/* 按 IP 做边缘限流，对话 / JD 匹配 / 变体改写 / 投递这类
      重资源接口额度更紧；同时统一补安全响应头（noindex / nosniff /
      frame-ancestors / Referrer-Policy / Permissions-Policy）。

   所有失败路径都 fail-open 或 fail-silent，宁可不拦也不能把正常访问打死。
   ────────────────────────────────────────────────────────────────────── */

import {
  allowedOrigins, certToken, ipTag, isAllowedOrigin, limit, minuteKey,
} from './lib/guard.js';
import { isAdmin } from './lib/admin-auth.js';
import { injectResumePhone, resumePhone } from './lib/resume-inject.js';

/* ── ① UA 黑名单：按小写子串匹配 ─────────────────────────────────── */
export const BLOCKED_UA = [
  /* AI 训练 / 语料采集 */
  'gptbot', 'chatgpt-user', 'oai-searchbot', 'ccbot', 'claudebot', 'claude-web',
  'anthropic-ai', 'google-extended', 'bytespider', 'petalbot', 'img2dataset',
  'cohere-ai', 'diffbot', 'youbot', 'omgilibot', 'facebookbot',
  /* 商业 SEO / 数据转售 */
  'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'blexbot', 'dataforseo',
  'serpstatbot', 'megaindex', 'zoominfobot', 'seokicks', 'screaming frog',
  'linkdexbot', 'grapeshot', 'barkrowler', 'sistrix',
  /* 脚本 / 命令行 / 无头浏览器 */
  'python-requests', 'python-urllib', 'python-httpx', 'aiohttp', 'httpx/',
  'scrapy', 'curl/', 'wget/', 'libwww-perl', 'go-http-client', 'java/',
  'okhttp', 'node-fetch', 'axios/', 'got (', 'undici',
  'headlesschrome', 'phantomjs', 'puppeteer', 'playwright', 'selenium',
  'electron/', 'jsdom',
  /* 扫描器 */
  'sqlmap', 'nikto', 'nuclei', 'masscan', 'zgrab', 'nmap', 'acunetix',
  'netsparker', 'wpscan', 'dirbuster', 'gobuster', 'feroxbuster',
];

/* 明确放行的搜索引擎（即便未来名单误加也不误伤收录） */
export const ALLOWED_UA = ['googlebot', 'bingbot', 'baiduspider', 'sogou web spider', '360spider', 'yisouspider'];

export function isBlockedUA(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return false;                       // 无 UA 交给后面的同源判定
  if (ALLOWED_UA.some((k) => s.indexOf(k) >= 0)) return false;
  return BLOCKED_UA.some((k) => s.indexOf(k) >= 0);
}

/* ── ② 蜜罐 / 源码路径 ───────────────────────────────────────────── */
const BLOCKED_PATH = [
  /^\/wp-(?:admin|login|content|includes|json)/i,
  /^\/xmlrpc\.php/i,
  /^\/phpmyadmin/i,
  /^\/pma\//i,
  /^\/\.(?:env|git|svn|hg|aws|ssh|htaccess|htpasswd|DS_Store|idea|vscode)/i,
  /^\/(?:config|backup|database|dump|shell|cmd|eval|test)\.(?:php|asp|aspx|jsp)$/i,
  /^\/(?:vendor|node_modules)\//i,
  /^\/(?:actuator|cgi-bin|solr|jenkins|console)\//i,
  /^\/(?:functions|db|scripts|templates|tests)\//i,   // 源码目录不外露
];

export function isBlockedPath(pathname) {
  const p = String(pathname || '/');
  return BLOCKED_PATH.some((re) => re.test(p));
}

/* ── ③ 敏感数据路径 ─────────────────────────────────────────────── */
const DATA_PREFIX = ['/data/', '/rag/', '/knowledge/', '/docs/'];
const CERT_PREFIX = '/assets/resume/certificates/';
/* 简历文档：需要把占位手机号换成云端真号码 */
const RESUME_DOC_PATHS = ['/resume'];

export function isDataPath(pathname) {
  return DATA_PREFIX.some((p) => pathname.indexOf(p) === 0);
}

export function isCertPath(pathname) {
  return pathname.indexOf(CERT_PREFIX) === 0;
}

/* 同源信号：浏览器会带 Sec-Fetch-Site；老客户端退化看 Referer。
   直连脚本 / 采集器两样都没有 → 判为不可信。
   'none' 表示地址栏直接打开，允许（人也需要能查看 JSON）。 */
export function hasSameSiteSignal(request, selfOrigin) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site === 'same-origin' || site === 'none') return true;
  if (site) return false;                      // same-site / cross-site
  const ref = request.headers.get('Referer') || '';
  if (!ref) return false;
  try {
    return new URL(ref).origin === selfOrigin;
  } catch (e) {
    return false;
  }
}

/* ── ③.5 后台守卫：/admin 与 /login ──────────────────────────────
   后台所有路由（含静态资源）都要求有效会话；没有就 302 到 /login?next=…
   已经登录的人再打开 /login，直接送回控制台，避免重复登录。
   这里挡的是「页面」这一层：就算有人在地址栏猜路径，也拿不到后台 HTML。
   接口层 /api/admin/* 另有各自的 requireAdmin 校验，两层互不依赖。 */
const ADMIN_PREFIX = '/admin';
const LOGIN_PATHS = ['/login', '/login/', '/login.html'];
const ASSET_EXT = /\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|glb|gltf|woff2?|ttf|otf|wasm|mp4|webm|json|txt)$/i;

export function isAdminPath(pathname) {
  const p = String(pathname || '');
  return p === ADMIN_PREFIX || p.indexOf(ADMIN_PREFIX + '/') === 0;
}

export function isLoginPath(pathname) {
  return LOGIN_PATHS.indexOf(String(pathname || '')) >= 0;
}

/* HTML 文档（需要 no-store）与静态资源的区分：资源未登录时给 404，不塞登录页 HTML */
function isAdminDoc(pathname) {
  const p = String(pathname || '');
  if (p === ADMIN_PREFIX || p === ADMIN_PREFIX + '/' || p === LOGIN_PATHS[0] || p === LOGIN_PATHS[1]) return true;
  if (p.indexOf(ADMIN_PREFIX + '/') === 0) return !ASSET_EXT.test(p);
  return p === LOGIN_PATHS[2];
}

function redirectTo(location) {
  return new Response(null, {
    status: 302,
    headers: Object.assign({}, BASE_HEADERS, {
      Location: location,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    }),
  });
}

/* ── ④ API 边缘限流 ─────────────────────────────────────────────── */
const HEAVY_API = [
  '/api/chat', '/api/jd', '/api/variant', '/api/kb', '/api/deliver', '/api/deliver-preview',
  /* 试听每次都要连云函数合成，按重接口限流；/api/voice 只读一个整数，走轻桶 */
  '/api/admin/voice/preview',
];
const HEAVY_MIN_LIMIT = 20;
const HEAVY_DAY_LIMIT = 200;
const LIGHT_MIN_LIMIT = 120;

async function throttleApi(request, env, pathname) {
  const heavy = HEAVY_API.some((p) => pathname === p || pathname.indexOf(p + '/') === 0);
  const tag = await ipTag(request, env, 12);
  const bucket = (heavy ? 'api:heavy:' : 'api:light:') + tag;
  const hit = await limit(env, [
    { bucket, window: minuteKey(), limit: heavy ? HEAVY_MIN_LIMIT : LIGHT_MIN_LIMIT, ttl: 120 },
    heavy ? { bucket: 'api:heavy:day:' + tag, window: 'd' + new Date().toISOString().slice(0, 10), limit: HEAVY_DAY_LIMIT, ttl: 172800 } : null,
  ]);
  return hit ? 'rate_limited' : '';
}

/* ── 响应头 ─────────────────────────────────────────────────────── */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "frame-ancestors 'self'",
};

function isPrivatePath(pathname) {
  return pathname.indexOf('/api/') === 0 || isDataPath(pathname) || isCertPath(pathname);
}

/* 后台页面的 CSP 比公开站更严：不许被嵌套，也不许外链任何脚本；
   例外有两组：3D 渲染器需要的 gstatic 解码器与 blob worker（跟旧后台 _headers 一致），
   以及 AI 语音试听：接口返回 base64 mp3，前端用 data: URL 播 <audio>，
   必须显式放行 media-src data:，否则继承 default-src 'self' 会直接拦掉（表现为「播放失败」）。 */
const ADMIN_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.gstatic.com; worker-src 'self' blob:; connect-src 'self' blob: https://www.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const LOGIN_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function withHeaders(res, pathname) {
  let out;
  try {
    out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
  } catch (e) {
    return res;
  }
  const h = out.headers;
  for (const k of Object.keys(BASE_HEADERS)) {
    if (!h.has(k)) h.set(k, BASE_HEADERS[k]);
  }
  if (isPrivatePath(pathname)) {
    h.set('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex');
  }
  if (isAdminPath(pathname) || isLoginPath(pathname)) {
    h.set('X-Frame-Options', 'DENY');
    h.set('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex');
    /* 登录页 URL 可能带 openid（未放行时回显给站长），别让它跟着 Referer 出去 */
    h.set('Referrer-Policy', 'no-referrer');
    /* CSP / no-store 只对文档生效：静态资源（含 800KB 的 GLB）仍走正常缓存 */
    if (isAdminDoc(pathname)) {
      h.set('Content-Security-Policy', isLoginPath(pathname) ? LOGIN_CSP : ADMIN_CSP);
      h.set('Cache-Control', 'no-store');
    }
  }
  return out;
}

function deny(status) {
  return new Response(status === 404 ? 'Not Found' : 'Forbidden', {
    status,
    headers: Object.assign({}, BASE_HEADERS, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    }),
  });
}

/* ── 入口 ───────────────────────────────────────────────────────── */
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (isBlockedPath(path)) return deny(404);
  if (isBlockedUA(request.headers.get('User-Agent'))) return deny(403);

  /* 简历页：仓库里是脱敏副本（手机号是占位串），真号码从 D1 注入后再返回。
     只处理 HTML 文档；/resume.html 的 308 跳转原样放行给 Pages。 */
  if (RESUME_DOC_PATHS.indexOf(path) >= 0 && (request.method === 'GET' || request.method === 'HEAD')) {
    const resp = await next();
    const ct = resp.headers.get('Content-Type') || '';
    if (resp.ok && ct.indexOf('text/html') >= 0 && request.method === 'GET') {
      const phone = await resumePhone(env);
      if (phone) {
        const html = injectResumePhone(await resp.text(), phone);
        const headers = new Headers(resp.headers);
        headers.set('Cache-Control', 'public, max-age=300');
        headers.set('X-Content-Source', 'cloud');
        return new Response(html, { status: resp.status, headers });
      }
    }
    return resp;
  }

  /* 后台：先验会话，再放行页面；一步都不能省 */
  if (isAdminPath(path)) {
    if (!(await isAdmin(request, env))) {
      if (!isAdminDoc(path) && ASSET_EXT.test(path)) return deny(404);
      const next = path + url.search;
      return redirectTo('/login?next=' + encodeURIComponent(next));
    }
  } else if (isLoginPath(path)) {
    if (await isAdmin(request, env)) return redirectTo('/admin/');
  }

  if (isCertPath(path)) {
    const token = request.headers.get('X-Cert-Token') || '';
    const expect = await certToken(env, path);
    if (!expect || token !== expect) return deny(404);
  } else if (isDataPath(path)) {
    if (!hasSameSiteSignal(request, url.origin)) return deny(403);
  }

  if (path.indexOf('/api/') === 0) {
    const blocked = await throttleApi(request, env, path);
    if (blocked) {
      const origin = request.headers.get('Origin') || '';
      const allow = allowedOrigins(env);
      const headers = Object.assign({}, BASE_HEADERS, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      });
      if (isAllowedOrigin(origin, allow)) headers['Access-Control-Allow-Origin'] = origin;
      return new Response(JSON.stringify({ ok: false, error: blocked, message: '请求过于频繁，请稍后再试' }), {
        status: 429,
        headers,
      });
    }
  }

  const res = await next();
  return withHeaders(res, path);
}

