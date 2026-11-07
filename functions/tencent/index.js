'use strict';

/**
 * 简历 AI 助手 —— 云函数入口（腾讯云 CloudBase，Node.js 运行时）
 *
 * 职责：CORS 白名单 → 限流 → 意图拦截 → TF-IDF 检索（与 knowledge/ 产物同源）
 *      → 组装提示词 → 调 CloudBase 内置大模型网关 → 返回 JSON + 结构化日志。
 *
 * 零第三方依赖：只用 Node 内置 https / crypto / fs。
 * 知识库随包部署在 ./kb/，由 scripts/build_kb.py --sync-functions 生成。
 *
 * 环境变量：
 *   AI_API_KEY       必填，CloudBase「服务端 API Key」（只放平台环境变量，不进代码）
 *   AI_BASE_URL      可选，默认本环境 AI 网关
 *   AI_MODEL         可选，默认 hy3（体验版唯一可套餐抵扣的模型）
 *   ALLOWED_ORIGINS  可选，逗号分隔，默认 https://shenge-work.github.io
 *   LOG_ENABLED      可选，默认 true
 *   LOG_SALT         可选，IP 盐化用
 */

var https = require('https');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var promptLib = require('./prompt.js');

var KB_DIR = path.join(__dirname, 'kb');

var AI_BASE = (process.env.AI_BASE_URL ||
  'https://resume-ai-d9g7zghnxda2ee2cb.api.tcloudbasegateway.com/v1/ai/cloudbase').replace(/\/+$/, '');
// 优先读平台「API Key 设置」自动注入的 CLOUDBASE_APIKEY，其次才是手工配置的 AI_API_KEY
var AI_KEY = process.env.AI_API_KEY || process.env.CLOUDBASE_APIKEY || '';
var AI_MODEL = process.env.AI_MODEL || 'hy3';
var LOG_ENABLED = String(process.env.LOG_ENABLED || 'true') !== 'false';
var LOG_SALT = process.env.LOG_SALT || 'resume-ai-salt';

var DEFAULT_ORIGINS = ['https://shenge-work.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

var MAX_QUESTION_CHARS = 200;
var TOP_K = 4;
var SCORE_FLOOR = 0.01;
var MAX_ANSWER_CHARS = 700;
var RATE_WINDOW_MS = 60 * 1000;
var RATE_LIMIT_PER_WINDOW = 20;
var RATE_LIMIT_PER_DAY = 200;

// ---------------------------------------------------------------- 知识库装载

var KB = null;

function loadKB() {
  if (KB) return KB;
  var chunks = JSON.parse(fs.readFileSync(path.join(KB_DIR, 'chunks.json'), 'utf8'));
  var vectors = JSON.parse(fs.readFileSync(path.join(KB_DIR, 'vectors.json'), 'utf8'));
  var meta = JSON.parse(fs.readFileSync(path.join(KB_DIR, 'kb-meta.json'), 'utf8'));
  if (meta.provider !== 'tfidf') {
    throw new Error('kb provider 不受支持：' + meta.provider + '（函数端仅实现 tfidf 口径）');
  }
  var vidx = Object.create(null);
  for (var i = 0; i < meta.vocab.length; i++) vidx[meta.vocab[i]] = i;
  var byId = Object.create(null);
  for (var j = 0; j < chunks.length; j++) byId[chunks[j].id] = chunks[j];
  KB = {
    chunks: chunks,
    byId: byId,
    items: vectors.items,
    idf: meta.idf,
    vidx: vidx,
    scale: meta.quant.scale,
    dim: meta.dim,
    count: meta.count
  };
  return KB;
}

// ---------------------------------------------------------------- 分词与检索
// 与 scripts/build_kb.py 的 tokenize / fit_tfidf / quantize_int8 严格同口径

var CJK_RE = /[\u4e00-\u9fff]+/g;
var WORD_RE = /[a-z0-9][a-z0-9+#./]*/g;

function tokenize(text) {
  var out = [];
  var low = String(text || '').toLowerCase();
  var m;
  CJK_RE.lastIndex = 0;
  while ((m = CJK_RE.exec(low)) !== null) {
    var s = m[0];
    if (s.length === 1) {
      out.push(s);
    } else {
      for (var i = 0; i < s.length - 1; i++) out.push(s.substr(i, 2));
    }
  }
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(low)) !== null) {
    var w = m[0].replace(/^[.\/-]+/, '').replace(/[.\/-]+$/, '');
    if (w.length >= 2) out.push('#' + w);
  }
  return out;
}

/** 查询向量（L2 归一化），返回 { vec, hits } */
function queryVector(text, kb) {
  var toks = tokenize(text);
  var cnt = Object.create(null);
  var total = 0;
  for (var i = 0; i < toks.length; i++) {
    var idx = kb.vidx[toks[i]];
    if (idx !== undefined) {
      cnt[idx] = (cnt[idx] || 0) + 1;
      total++;
    }
  }
  var vec = new Float64Array(kb.dim);
  for (var k in cnt) vec[Number(k)] = (cnt[k] / (total || 1)) * kb.idf[Number(k)];
  var norm = 0;
  for (var j = 0; j < vec.length; j++) norm += vec[j] * vec[j];
  norm = Math.sqrt(norm);
  if (norm > 0) for (var n = 0; n < vec.length; n++) vec[n] = vec[n] / norm;
  return { vec: vec, hits: total };
}

/** 关键词兜底：按 query bigram 在块内的命中比例打分（与前端 provider=none 同一算法） */
function keywordScore(text, kb, topk) {
  var terms = tokenize(text);
  if (!terms.length) return [];
  var hits = [];
  for (var i = 0; i < kb.chunks.length; i++) {
    var low = String(kb.chunks[i].text).toLowerCase();
    var n = 0;
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      if (term.charAt(0) === '#') term = term.slice(1);
      if (low.indexOf(term) !== -1) n++;
    }
    if (n) hits.push({ score: n / terms.length, id: kb.chunks[i].id });
  }
  hits.sort(function (a, b) { return b.score - a.score; });
  return hits.slice(0, topk || TOP_K);
}

function retrieve(question) {
  var kb = loadKB();
  var q = queryVector(question, kb);
  var top = [];
  if (q.hits > 0) {
    for (var i = 0; i < kb.items.length; i++) {
      var item = kb.items[i];
      var s = 0;
      for (var k = 0; k < item.idx.length; k++) s += q.vec[item.idx[k]] * (item.val[k] / kb.scale);
      top.push({ score: s, id: item.id });
    }
    top.sort(function (a, b) { return b.score - a.score; });
    top = top.slice(0, TOP_K);
  }
  if (!top.length || top[0].score < SCORE_FLOOR) {
    var kw = keywordScore(question, kb, TOP_K);
    if (!kw.length) return { hits: [], fallback: true, top1: 0, vocabHits: q.hits };
    return { hits: kw, fallback: true, top1: kw[0].score, vocabHits: q.hits };
  }
  return { hits: top, fallback: false, top1: top[0].score, vocabHits: q.hits };
}

// ---------------------------------------------------------------- 模型调用

function postJSON(urlStr, headers, payloadObj, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var body = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    headers['Content-Length'] = body.length;
    var req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST', headers: headers, timeout: timeoutMs },
      function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var text = Buffer.concat(chunks).toString('utf8');
          var json = null;
          try { json = JSON.parse(text); } catch (e) { /* 保留原文 */ }
          resolve({ status: res.statusCode, text: text, json: json });
        });
      }
    );
    req.on('timeout', function () { req.destroy(new Error('upstream timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callModel(systemPrompt, history, question) {
  var messages = [{ role: 'system', content: systemPrompt }];
  var h = Array.isArray(history) ? history.slice(-4) : [];
  for (var i = 0; i < h.length; i++) {
    var m = h[i];
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    var c = promptLib.scrub(String(m.content || '')).slice(0, 400);
    if (c) messages.push({ role: m.role, content: c });
  }
  messages.push({ role: 'user', content: question });

  return postJSON(
    AI_BASE + '/chat/completions',
    { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_KEY },
    {
      model: AI_MODEL,
      messages: messages,
      max_tokens: 800,
      temperature: 0.3,
      thinking: { type: 'disabled' }   // 实测关思考：reasoning_tokens 归零，延迟与成本都显著下降
    },
    25000
  );
}

function extractAnswer(resp) {
  if (!resp.json) return '';
  var ch = (resp.json.choices && resp.json.choices[0]) || null;
  if (!ch || !ch.message) return '';
  return String(ch.message.content || '').trim();
}

// ---------------------------------------------------------------- 限流（实例内内存，尽力而为）

var buckets = Object.create(null);

function rateLimited(key) {
  var now = Date.now();
  var b = buckets[key];
  if (!b || now - b.windowStart > RATE_WINDOW_MS) {
    b = buckets[key] = { windowStart: now, windowCount: 0, dayStart: now, dayCount: 0 };
  }
  if (now - b.dayStart > 24 * 60 * 60 * 1000) {
    b.dayStart = now;
    b.dayCount = 0;
  }
  b.windowCount++;
  b.dayCount++;
  return b.windowCount > RATE_LIMIT_PER_WINDOW || b.dayCount > RATE_LIMIT_PER_DAY;
}

// ---------------------------------------------------------------- HTTP 适配

function headerOf(headers, name) {
  if (!headers) return '';
  var lower = name.toLowerCase();
  for (var k in headers) {
    if (String(k).toLowerCase() === lower) return String(headers[k] || '');
  }
  return '';
}

function clientIp(event, headers) {
  var xff = headerOf(headers, 'x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  var real = headerOf(headers, 'x-real-ip');
  if (real) return real;
  return event.clientIP || event.clientIp || 'unknown';
}

function ipHash(ip) {
  return crypto.createHash('sha256').update(String(ip) + '|' + LOG_SALT).digest('hex').slice(0, 16);
}

function corsHeaders(origin) {
  var allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function reply(status, origin, obj) {
  return {
    statusCode: status,
    headers: corsHeaders(origin),
    body: JSON.stringify(obj),
    isBase64Encoded: false
  };
}

function parseBody(event) {
  var raw = event.body;
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  var text = String(raw);
  if (event.isBase64Encoded) text = Buffer.from(text, 'base64').toString('utf8');
  try { return JSON.parse(text); } catch (e) { return null; }
}

function logLine(obj) {
  if (!LOG_ENABLED) return;
  try { console.log('[chat_log] ' + JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
}

// ---------------------------------------------------------------- 主流程

exports.main = async function (event) {
  event = event || {};
  var headers = event.headers || {};
  var origin = headerOf(headers, 'origin');
  var method = String(event.httpMethod || event.method || 'POST').toUpperCase();
  var started = Date.now();

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '', isBase64Encoded: false };
  }
  if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
    return reply(403, origin, { ok: false, error: 'origin_denied', message: '来源不在白名单' });
  }

  var body = parseBody(event);
  if (!body || typeof body !== 'object') {
    return reply(400, origin, { ok: false, error: 'bad_request', message: '请求体不是合法 JSON' });
  }
  var question = String(body.question || '').trim();
  if (!question) {
    return reply(400, origin, { ok: false, error: 'bad_request', message: '缺少 question' });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return reply(400, origin, { ok: false, error: 'bad_request', message: '问题太长了，请控制在 ' + MAX_QUESTION_CHARS + ' 字内' });
  }

  var ip = clientIp(event, headers);
  var iph = ipHash(ip);
  if (rateLimited(iph)) {
    logLine({ ts: started, ip_hash: iph, q: '', a: '', channel: 'tencent', tag: 'rate_limited' });
    return reply(429, origin, { ok: false, error: 'rate_limited', message: '问得有点快，稍等几秒再试' });
  }

  var cls = promptLib.classifyInput(question);
  var suspect = cls.action === 'suspect';
  if (cls.action === 'sensitive') {
    logLine({ ts: started, ip_hash: iph, q: question, a: promptLib.SENSITIVE_REPLY, channel: 'tencent', top_ids: [], top1_score: 0, fallback: true, latency_ms: Date.now() - started, blocked: 'sensitive:' + cls.reason });
    return reply(200, origin, { ok: true, answer: promptLib.SENSITIVE_REPLY, sources: [], top1_score: 0, fallback: true });
  }
  if (cls.action === 'offtopic') {
    logLine({ ts: started, ip_hash: iph, q: question, a: promptLib.OFFTOPIC_REPLY, channel: 'tencent', top_ids: [], top1_score: 0, fallback: true, latency_ms: Date.now() - started, blocked: 'offtopic:' + cls.reason });
    return reply(200, origin, { ok: true, answer: promptLib.OFFTOPIC_REPLY, sources: [], top1_score: 0, fallback: true });
  }

  var ret;
  try {
    ret = retrieve(question);
  } catch (e) {
    return reply(500, origin, { ok: false, error: 'kb_error', message: '知识库装载失败' });
  }

  if (!ret.hits.length) {
    logLine({ ts: started, ip_hash: iph, q: question, a: promptLib.NO_MATCH_REPLY, channel: 'tencent', top_ids: [], top1_score: 0, fallback: true, latency_ms: Date.now() - started, model_called: false, suspect: suspect });
    return reply(200, origin, { ok: true, answer: promptLib.NO_MATCH_REPLY, sources: [], top1_score: 0, fallback: true, no_match: true });
  }

  if (!AI_KEY) {
    return reply(500, origin, { ok: false, error: 'server_misconfig', message: '函数缺少 AI_API_KEY 环境变量' });
  }

  var kb = loadKB();
  var ctxChunks = [];
  var sources = [];
  for (var i = 0; i < ret.hits.length; i++) {
    var ch = kb.byId[ret.hits[i].id];
    if (!ch) continue;
    ctxChunks.push(ch);
    sources.push({ id: ch.id, title: ch.title, score: Number(ret.hits[i].score.toFixed(4)) });
  }

  var answer = '';
  try {
    var resp = await callModel(promptLib.buildSystem(ctxChunks), body.history, question);
    if (resp.status >= 200 && resp.status < 300) {
      answer = extractAnswer(resp);
    } else if (resp.json) {
      answer = '';
    }
  } catch (e) {
    answer = '';
  }

  if (!answer) {
    // 模型侧失败 → 纯检索降级：直接把最相关的知识块原文给出去，不让用户看到空白
    var fallbackText = (kb.byId[ret.hits[0].id] || {}).text || promptLib.NO_MATCH_REPLY;
    fallbackText = promptLib.scrub(fallbackText).slice(0, MAX_ANSWER_CHARS);
    logLine({ ts: started, ip_hash: iph, q: question, a: fallbackText, channel: 'tencent', top_ids: ret.hits.map(function (h) { return h.id; }), top1_score: ret.top1, fallback: true, latency_ms: Date.now() - started, model_called: true, degraded: true, suspect: suspect });
    return reply(200, origin, { ok: true, answer: fallbackText, sources: sources, top1_score: ret.top1, fallback: ret.fallback, degraded: true });
  }

  answer = promptLib.scrub(answer).slice(0, MAX_ANSWER_CHARS);
  logLine({ ts: started, ip_hash: iph, q: question, a: answer, channel: 'tencent', top_ids: ret.hits.map(function (h) { return h.id; }), top1_score: ret.top1, fallback: ret.fallback, latency_ms: Date.now() - started, model_called: true, model: AI_MODEL, suspect: suspect });
  return reply(200, origin, { ok: true, answer: answer, sources: sources, top1_score: ret.top1, fallback: ret.fallback });
};

// 作为容器入口直接 `node index.js` 运行时，起 HTTP 服务（CloudBase HTTP 云函数模式）
if (require.main === module) {
  require('./server.js');
}
