/* 提问记录 → 线索
   ──────────────────────────────────────────────────────────────
   问「你什么时候能到岗」「方便电话聊吗」「他对 Kubernetes 熟吗」的人，和问
   「你会做饭吗」的人不是同一类。线索页要做的，是把前者从 qa_logs 里挑出来，
   按人（同一 IP 哈希）聚成一条，附一句能直接发出去的话。

   为什么用规则不用模型：
     · 数据量小（一次问答几十条），调模型算意图的收益远低于成本；
     · 线索误判的代价比漏判高——把普通访客标成「招聘方」会让人白花时间跟进，
       所以命中要在页面上写清「命中了哪些词」，可复核、可推翻；
     · 规则改一行就生效，不用等模型版本。

   为什么要单独处理「快捷问题」：数字分身下面那排按钮会原样落库
   （你主导过哪些 0→1 系统？/ 你的 Agent 架构经验？/ 技术栈与方向？/ 怎么联系你？），
   线上 64 条记录里绝大部分是这四句。点一下按钮的成本是零，不能当成意向；
   但它们出现在一个人的记录里，说明他确实在翻看——记为活跃度，不记为线索。

   只看 query，不看 answer：访客问什么就是什么，答案是我们自己的话术，混进去会污染判断。
   ────────────────────────────────────────────────────────────── */

/* 意图词表。label 给后台显示，priority 越小越该先跟进。
   words 里用最简单的中文子串匹配，英文按小写整词包含。
   contact 是弱意图：只说明「这人想联系我」，没说明为什么要联系，所以排最后。 */
export const INTENTS = [
  {
    key: 'hire',
    label: '招聘',
    priority: 1,
    hint: '像是招聘方在摸候选人的底，优先回。',
    words: [
      '到岗', '入职', '期望薪资', '期望多少', '薪资要求', '多少薪', 'package', '薪资',
      '发份简历', '简历发我', '要一份简历', '简历', '面试', '面试官', 'offer', '背调',
      '候选人', '猎头', '岗位', '任职要求', '招人', '招聘', '团队情况', '团队在',
      '排期', '什么时候能来', '能不能来', '可以来', 'base 在', 'base在哪',
      '换工作', '考虑机会', '看机会', '聊聊吗', '电话聊', '方便沟通',
    ],
  },
  {
    key: 'collab',
    label: '合作 / 外包',
    priority: 2,
    hint: '像是有具体活儿要落地，问价与排期是信号。',
    words: [
      '报价', '多少钱', '费用', '预算', '外包', '接活', '接私活', '兼职',
      '帮我们做', '帮我做', '定制', '合作', '项目需求', '能做吗', '可以接吗',
      '开发一个', '搭一个', '驻场',
    ],
  },
  {
    key: 'jobseek',
    label: '求职询问',
    priority: 3,
    hint: '访客在问「你这儿招不招人」，是求职者而不是招聘方。',
    words: [
      '招人吗', '招不招', '还招吗', '有没有岗位', '有没有 hc', 'hc', '内推',
      '接受内推', '招实习生', '实习机会', '校招', '社招',
    ],
  },
  {
    key: 'contact',
    label: '想联系',
    priority: 4,
    hint: '只说明他想要个联系方式，没说到具体事由，当弱线索看。',
    weak: true,
    words: [
      '怎么联系', '联系方式', '留个联系', '邮箱', '微信', '加个好友', '加微信',
      '发邮件', 'mail', '电话多少',
    ],
  },
];

/* 否命题：句子里带这些，说明是在「否认/转述」，不该算线索（例：「我不接受外包」）。 */
const NEGATIONS = ['不招', '不接', '不做外包', '没有岗位', '不内推', '别内推', '不招人'];

/* 快捷问题：数字分身下面那排按钮的原文，点一下原样进 qa_logs。
   比对比对前先抹掉空白和标点，避免「怎么联系你?」漏判。 */
export const PRESETS = [
  '你主导过哪些 0→1 系统？',
  '你的 Agent 架构经验？',
  '技术栈与方向？',
  '怎么联系你？',
];

const squash = (s) => String(s || '').toLowerCase().replace(/[\s？?。.，,！!、~～\-—_"'“”]/g, '');
const PRESET_KEYS = PRESETS.map(squash);

export function isPreset(query) {
  const q = squash(query);
  if (!q) return false;
  return PRESET_KEYS.includes(q);
}

/* 第三人称提问：本人不会用「他/她」问自己的经历，出现这种问法基本是外部在打听。
   带「你」的排除掉，避免「你怎么看他的架构」这种对话式误判。 */
const THIRD_PARTY = ['他', '她', '此人', '这个人', '本人', '候选人'];

/* 单条提问打分：返回命中的最强意图（priority 最小），没有就 null。
   signals 保留命中的词，后台据此解释「为什么把它算成线索」。 */
export function classify(query) {
  const raw = String(query || '').trim();
  const q = raw.toLowerCase();
  if (!q) return null;
  if (NEGATIONS.some((n) => q.includes(n))) return null;

  let best = null;
  for (const intent of INTENTS) {
    const signals = intent.words.filter((w) => q.includes(w.toLowerCase()));
    if (!signals.length) continue;
    /* 命中词越多越可信；同分取 priority 小的 */
    const score = signals.length;
    if (!best || score > best.score || (score === best.score && intent.priority < best.intent.priority)) {
      best = { intent, score, signals };
    }
  }

  /* 第三人称打听：没有别的词也认，归招聘（外部在评估这个人）；
     已经命中合作/招聘的更不必改，只有落到 contact 或无命中时才升级。
     「其他」里的「他」不是人称，先抹掉再判。 */
  const q2 = q.replace(/其他/g, '');
  const third = !q2.includes('你') && THIRD_PARTY.some((w) => q2.includes(w));
  if (third && (!best || best.intent.key === 'contact')) {
    const hire = INTENTS.find((i) => i.key === 'hire');
    best = { intent: hire, score: Math.max(best ? best.score : 0, 1), signals: ['第三人称提问'] };
  }

  return best && {
    key: best.intent.key,
    label: best.intent.label,
    priority: best.intent.priority,
    weak: !!best.intent.weak,
    score: best.score,
    signals: best.signals,
  };
}

/* 聚合：同一 ip_hash 的意向问题算一个人。
   没有 ip_hash 的（老数据/本地调试）单独成条，避免全塞进一个「未知」桶。 */
export function buildLeads(rows) {
  const leads = [];
  const byIp = new Map();
  const stats = { total: 0, hire: 0, collab: 0, jobseek: 0, contact: 0, strong: 0, weak: 0, last7: 0, presets: 0, scanned: rows.length };
  const weekAgo = Date.now() - 7 * 86400000;
  /* 点过快捷问题但没留下意向的人：不生成线索，但要知道有多少人在翻 */
  const presetOnly = new Set();
  const presetCount = new Map();

  for (const row of rows) {
    const ip = String(row.ip_hash || '').trim();
    if (isPreset(row.query)) {
      stats.presets += 1;
      if (ip) {
        presetOnly.add(ip);
        presetCount.set(ip, (presetCount.get(ip) || 0) + 1);
      }
      continue;
    }

    const hit = classify(row.query);
    if (!hit) continue;
    if (hit.key === 'contact') stats.weak += 1;
    else stats.strong += 1;
    stats.total += 1;
    stats[hit.key] += 1;
    if (Number(row.ts) >= weekAgo) stats.last7 += 1;

    const key = ip || 'single:' + row.ts + ':' + hit.key;
    let lead = byIp.get(key);
    if (!lead) {
      lead = {
        ip: ip || '(无哈希)',
        intentKey: hit.key,
        intentLabel: hit.label,
        priority: hit.priority,
        weak: hit.weak,
        count: 0,
        presetClicks: 0,
        firstTs: Number(row.ts) || 0,
        lastTs: Number(row.ts) || 0,
        queries: [],
        signals: [],
      };
      byIp.set(key, lead);
      leads.push(lead);
    }
    lead.count += 1;
    lead.lastTs = Math.max(lead.lastTs, Number(row.ts) || 0);
    lead.firstTs = Math.min(lead.firstTs || Number(row.ts) || 0, Number(row.ts) || 0);
    /* 只保留最近 8 句，够看出他在打什么主意；再多页面也放不下 */
    if (lead.queries.length < 8) {
      lead.queries.push({ ts: Number(row.ts) || 0, q: String(row.query || '').slice(0, 120), intent: hit.label });
    }
    for (const s of hit.signals) if (!lead.signals.includes(s)) lead.signals.push(s);
    /* 同一个人问过更紧急的意图（先问报价又问到岗），整条线索按最优先的算 */
    if (hit.priority < lead.priority) {
      lead.priority = hit.priority;
      lead.intentKey = hit.key;
      lead.intentLabel = hit.label;
      lead.weak = hit.weak;
    }
  }

  /* 只点过快捷按钮、没留下任何意向的，算「在翻但没表态」，不进线索列表 */
  for (const lead of leads) {
    /* 同一 IP 点过几次快捷问题，顺带提一下：他在认真看，不是误点进来 */
    if (lead.ip && presetCount.has(lead.ip)) {
      lead.presetClicks = presetCount.get(lead.ip);
      presetOnly.delete(lead.ip);   // 留下了意向的人不算「只点按钮」
    }
  }
  stats.presetOnly = presetOnly.size;

  leads.sort((a, b) => a.priority - b.priority || b.lastTs - a.lastTs);
  return { leads, stats };
}

/* 跟进话术：按意图给一句能直接用的话，省得对着「报价」两个字想半天怎么回。
   只做模板，不做生成——这里要是再调一次模型，就为了写一句话，不划算。 */
export function followUp(lead) {
  const q = lead && lead.queries && lead.queries[0] ? lead.queries[0].q : '';
  const quoted = q ? '（当时问的是「' + q + '」）' : '';
  if (lead.intentKey === 'hire') {
    return '你好，刚看到你在站内问了这块' + quoted +
      '。我目前在看 AI Agent 方向的机会，方便说下岗位和团队情况吗？简历可以直接发你，也可以约个电话聊。';
  }
  if (lead.intentKey === 'collab') {
    return '你好，看到你问了' + quoted +
      '。这类需求我可以接，方便说下大概范围、期望交付时间和预算吗？我按工作量给你一个方案和报价。';
  }
  if (lead.intentKey === 'contact') {
    return '你好，看到你在站内要联系方式' + quoted +
      '。邮箱 hi@chenpeisheng.cn 一直可用，也可以直接回我一句话说下你想了解什么，简历和项目细节我按需发你。';
  }
  return '你好，看到你在站内问了' + quoted +
    '。我这边有合适的内推资源可以对接，也可以把简历给你，方便的话留个联系方式。';
}

/* 全部线索导成一段纯文本，方便贴到备忘录/飞书里跟进 */
export function toText(leads) {
  return leads.map((l) => {
    const when = new Date(l.lastTs).toISOString().slice(0, 16).replace('T', ' ');
    const weak = l.weak ? '（弱）' : '';
    return '[' + l.intentLabel + weak + '] ' + when + ' · IP ' + l.ip + ' · ' + l.count + ' 条\n' +
      l.queries.map((x) => '  - ' + x.q).join('\n') + '\n  话术：' + followUp(l);
  }).join('\n\n');
}
