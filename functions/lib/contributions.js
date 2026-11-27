/* GitHub 贡献日历解析（纯函数，Pages Function 与单测共用）
   ──────────────────────────────────────────────────────────────
   GitHub 公开的 /users/<login>/contributions 返回一份日历 SVG，
   每个格子是带 data-date / data-count / data-level 的 <g> 元素；
   不需要 token，也不会把 token 暴露到前端或仓库。

   这里把它转成站点既有的 data/contributions.json 结构，
   让前端统计行和蛇图网格共用同一份数据：
     { username, updatedAt, range, total, currentStreak, longestStreak, days, weeks }

   weeks 固定 53 列 × 7 行（周日为首行），列内缺日期补 null，
   与 Platane/snk 生成的 53×7 viewBox 坐标一一对应。
   ────────────────────────────────────────────────────────────── */

export const DEFAULT_LOGIN = 'shenge-work';
export const CACHE_PREFIX = 'contrib:live:v1:';
export const CACHE_TTL = 300; // 5 分钟：GitHub 日历本身也有分钟级延迟，再短没有意义

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/* GitHub 日历格子三种写法都要认：
   ① 现在的 HTML：<td data-date data-level id="contribution-day-component-r-c">，
      计数在紧随其后的 <tool-tip for="同一个 id">N contributions on ...</tool-tip>；
   ② 早年的 SVG：<rect/g ...><title>N contributions ...</title></g>；
   ③ 自带 data-count 属性的实现。 */
const DAY_RE = /<(g|rect|td)\b([^>]*\bdata-date="\d{4}-\d{2}-\d{2}"[^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
const TOOLTIP_RE = /<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g;
const TITLE_COUNT_RE = /(No|\d[\d,]*)\s+contributions?\b/i;
const DAY_ID_RE = /\bid="([^"]+)"/;

function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

export function levelForCount(count, rawLevel) {
  if (rawLevel !== null && rawLevel !== undefined && rawLevel !== '') {
    const n = Number(rawLevel);
    if (Number.isInteger(n) && n >= 0 && n <= 4) return n;
  }
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 11) return 3;
  return 4;
}

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/* 从 GitHub 日历 HTML/SVG 里抽出日期格子；属性顺序不固定，
   贡献数可能在属性、内联 <title> 或外部 <tool-tip> 文本里。 */
export function parseDays(svg) {
  const text = String(svg || '');
  const tips = new Map();
  let tip;
  TOOLTIP_RE.lastIndex = 0;
  while ((tip = TOOLTIP_RE.exec(text)) !== null) {
    const forId = attr(tip[1], 'for');
    const m = tip[2].replace(/<[^>]*>/g, ' ').match(TITLE_COUNT_RE);
    if (forId && m) {
      tips.set(forId, m[1].toLowerCase() === 'no' ? 0 : Number(m[1].replace(/,/g, '')));
    }
  }

  const byDate = new Map();
  let match;
  DAY_RE.lastIndex = 0;
  while ((match = DAY_RE.exec(text)) !== null) {
    const attrs = match[2] || '';
    const body = match[4] || '';
    const date = attr(attrs, 'data-date');
    if (!date || !DATE_RE.test(date)) continue;
    const countRaw = attr(attrs, 'data-count');
    let count;
    if (countRaw !== null && /^\d+$/.test(countRaw)) {
      count = Number(countRaw);
    } else {
      const idMatch = attrs.match(DAY_ID_RE);
      const tipCount = idMatch && tips.has(idMatch[1]) ? tips.get(idMatch[1]) : null;
      const title = body.match(TITLE_COUNT_RE);
      count = tipCount !== null ? tipCount
        : title ? (title[1].toLowerCase() === 'no' ? 0 : Number(title[1].replace(/,/g, '')))
          : 0;
    }
    byDate.set(date, {
      date,
      count,
      level: levelForCount(count, attr(attrs, 'data-level')),
    });
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* 口径与 GitHub 一致：今天还没提交不中断当前连续天数，从昨天往前数 */
export function calcStreaks(days) {
  const counts = days.map((d) => Number(d.count) || 0);
  let longest = 0;
  let run = 0;
  for (const c of counts) {
    run = c > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  let current = 0;
  let i = counts.length - 1;
  if (i >= 0 && counts[i] === 0) i -= 1;
  while (i >= 0 && counts[i] > 0) {
    current += 1;
    i -= 1;
  }
  return { currentStreak: current, longestStreak: longest };
}

/* 53 列 × 7 行，周日为第一行，起始列按首日所在周的周日对齐 */
export function buildWeeks(days) {
  if (!days.length) return [];
  const first = new Date(days[0].date + 'T00:00:00Z');
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const last = new Date(days[days.length - 1].date + 'T00:00:00Z');
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = [];
  for (
    let cursor = start;
    cursor.getTime() <= last.getTime();
    cursor = new Date(cursor.getTime() + 7 * DAY_MS)
  ) {
    const col = [];
    for (let row = 0; row < 7; row += 1) {
      const date = new Date(cursor.getTime() + row * DAY_MS);
      col.push(byDate.get(isoDay(date)) || null);
    }
    weeks.push(col);
  }
  return weeks;
}

/* 统一组装前端需要的形状；total 缺省按 days 求和，避免 D1 旧快照与格子对不上 */
export function fromDays(days, login, updatedAt, total) {
  const clean = (Array.isArray(days) ? days : [])
    .filter((d) => d && DATE_RE.test(String(d.date || '')))
    .map((d) => ({
      date: String(d.date),
      count: Math.max(0, Number(d.count) || 0),
      level: levelForCount(d.count, d.level),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const streaks = calcStreaks(clean);
  const sum = clean.reduce((n, d) => n + d.count, 0);
  return {
    username: String(login || DEFAULT_LOGIN),
    updatedAt: updatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    range: {
      from: clean.length ? clean[0].date : '',
      to: clean.length ? clean[clean.length - 1].date : '',
    },
    total: Number.isFinite(Number(total)) ? Number(total) : sum,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    days: clean,
    weeks: buildWeeks(clean),
  };
}

/* 从 GitHub 日历 SVG 直接生成完整 payload */
export function payloadFromSvg(svg, login, updatedAt) {
  const days = parseDays(svg);
  if (days.length < 300) {
    throw new Error('contributions_svg_too_short:' + days.length);
  }
  return fromDays(days, login, updatedAt);
}
