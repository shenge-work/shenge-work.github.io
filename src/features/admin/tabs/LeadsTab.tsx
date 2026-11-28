import { useLeads } from '../queries';
import { fmt, useToast } from '../toast';

/**
 * 线索：从 qa_logs 里挑出「像招聘方 / 合作方」的提问，按人聚合后可直接跟进。
 * 判定是规则命中（不需要模型），每条都写明命中了哪些词，方便人工推翻。
 */
export function LeadsTab() {
  const toast = useToast();
  const leads = useLeads(30);

  const s = leads.data?.stats;
  const rows = leads.data?.leads ?? [];

  function copy(text: string, okMsg: string) {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast(okMsg))
      .catch(() => toast('复制失败，手动选中吧', true));
  }

  function leadText(l: typeof rows[number]) {
    return `[${l.intentLabel}] ${fmt(l.lastTs)} · IP ${l.ip} · ${l.count} 条\n` +
      (l.queries || []).map((x) => `  - ${x.q}`).join('\n') +
      `\n  话术：${l.followUp || ''}`;
  }

  return (
    <section className="panel" id="panelLeads" role="tabpanel">
      <div className="stats stats-leads">
        <article className="stat"><p className="stat-num">{leads.data?.total_leads ?? '—'}</p><p className="stat-label">待跟进的人</p></article>
        <article className="stat"><p className="stat-num">{s?.hire ?? '—'}</p><p className="stat-label">招聘类</p></article>
        <article className="stat"><p className="stat-num">{s?.collab ?? '—'}</p><p className="stat-label">合作 / 外包</p></article>
        <article className="stat"><p className="stat-num">{s?.jobseek ?? '—'}</p><p className="stat-label">求职询问</p></article>
        <article className="stat"><p className="stat-num">{s?.contact ?? '—'}</p><p className="stat-label">只要联系方式</p></article>
        <article className="stat"><p className="stat-num">{s?.presetOnly ?? '—'}</p><p className="stat-label">只点了快捷问题</p></article>
      </div>

      <div className="qa-box">
        <div className="qa-box-head">
          <h2>待跟进线索</h2>
          <span className="toolbar-note">按意图优先级排；同一个人（同 IP 哈希）的意向提问已并成一条</span>
          {rows.length ? (
            <button className="btn btn-sm btn-ghost" type="button"
              onClick={() => copy(rows.map(leadText).join('\n\n'), `已复制 ${rows.length} 条线索`)}>复制全部</button>
          ) : null}
        </div>
        <ul className="qa-list lead-list">
          {rows.length ? rows.map((l, i) => (
            <li key={i} className="lead-item">
              <div className="lead-head">
                <span className={'pill lead-p' + l.priority}>{l.intentLabel}</span>
                {l.weak ? <span className="qa-n">弱</span> : null}
                <span className="qa-n">IP {l.ip} · {l.count} 条 · 最近 {fmt(l.lastTs)}</span>
                {l.presetClicks ? <span className="qa-n">还点了 {l.presetClicks} 次快捷问题</span> : null}
                <button className="btn btn-sm btn-ghost" type="button"
                  onClick={() => copy(l.followUp, '跟进话术已复制')}>复制话术</button>
              </div>
              <ul className="lead-qs">
                {(l.queries || []).map((q, j) => (
                  <li key={j}><span className="qa-q">{q.q}</span><span className="qa-n">{fmt(q.ts)}</span></li>
                ))}
              </ul>
              <p className="lead-signals">命中：{(l.signals || []).join(' / ') || '—'}</p>
            </li>
          )) : (
            <li className="empty">
              {leads.isError
                ? '线索接口不可用，稍后刷新重试'
                : '近 30 天还没有像线索的提问。有人问到岗、报价、内推这类问题就会出现在这里。'}
            </li>
          )}
        </ul>
      </div>

      <div className="qa-box">
        <div className="qa-box-head">
          <h2>判定口径</h2>
          <span className="toolbar-note">规则命中，不是模型猜的；每条线索底下能看到具体命中了哪些词</span>
        </div>
        <ul className="qa-list lead-rules">
          <li><span className="qa-q">招聘</span><span className="qa-n">到岗 / 期望薪资 / 简历 / 面试 / 候选人 / 猎头 / 背调 / 聊聊吗 …</span></li>
          <li><span className="qa-q">合作 · 外包</span><span className="qa-n">报价 / 预算 / 外包 / 接活 / 帮我们做 / 驻场 …</span></li>
          <li><span className="qa-q">求职询问</span><span className="qa-n">招人吗 / 有没有 hc / 内推 / 实习机会 …</span></li>
          <li><span className="qa-q">想联系（弱）</span><span className="qa-n">怎么联系 / 联系方式 / 邮箱 / 微信 —— 只说要联系，没说事由</span></li>
          <li><span className="qa-q">第三人称</span><span className="qa-n">用「他 / 她 / 候选人」问经历（他做过哪些 0→1 系统），按外部打听算招聘</span></li>
        </ul>
        <p className="toolbar-note">带「不招 / 不接 / 不做外包 / 不内推」这类否定的句子不算线索；只看问题，不看我们自己的回答。</p>
        <p className="toolbar-note">分身下面那排快捷问题（你主导过哪些 0→1 系统 / 你的 Agent 架构经验 / 技术栈与方向 / 怎么联系你）点一下就会进记录，成本是零，所以不单独算线索，只作为「这人在认真翻」的活跃度备注。</p>
      </div>
    </section>
  );
}
