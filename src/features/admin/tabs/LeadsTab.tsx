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
        <article className="stat"><p className="stat-num">{s?.total ?? '—'}</p><p className="stat-label">线索条数</p></article>
        <article className="stat"><p className="stat-num">{s?.hire ?? '—'}</p><p className="stat-label">招聘类</p></article>
        <article className="stat"><p className="stat-num">{s?.collab ?? '—'}</p><p className="stat-label">合作 / 外包</p></article>
        <article className="stat"><p className="stat-num">{s?.jobseek ?? '—'}</p><p className="stat-label">求职询问</p></article>
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
                <span className="qa-n">IP {l.ip} · {l.count} 条 · 最近 {fmt(l.lastTs)}</span>
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
          <li><span className="qa-q">招聘</span><span className="qa-n">到岗 / 期望薪资 / 简历 / 面试 / offer / 背调 / 聊聊吗 …</span></li>
          <li><span className="qa-q">合作 · 外包</span><span className="qa-n">报价 / 预算 / 外包 / 接活 / 帮我们做 / 驻场 …</span></li>
          <li><span className="qa-q">求职询问</span><span className="qa-n">招人吗 / 有没有 hc / 内推 / 实习机会 …</span></li>
        </ul>
        <p className="toolbar-note">带「不招 / 不接 / 不做外包 / 不内推」这类否定的句子不算线索；只看问题，不看我们自己的回答。</p>
      </div>
    </section>
  );
}
