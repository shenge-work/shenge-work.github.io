/**
 * 学校档案 · 面板与板块（M2）—— 复刻 js/school-profile.js 的 render() 组装序。
 * 类名结构与旧版一致（css/school-profile.css 零改动）；
 * 验证码脱敏联动核验解锁态：锁定时全板块打点，解锁后原文（redactCopy 驱动）。
 */
import { useEffect, useRef, useState } from 'react';
import { SCHOOL_META, redactCopy, type School } from './data';
import { formatExpiry, useVerifyAccess, type VerifyState } from './VerifyFlow';

/* ── 来源上标：0 = 本人自述，其余对应 sources[].id ── */
function SpSup({ n, sources }: { n?: string | number | null; sources?: School['sources'] }) {
  if (n === 0) return <sup className="sp-sup sp-sup-self">[自述]</sup>;
  if (n == null || n === '') return null;
  const hit = (sources || []).find((x) => String(x.id) === String(n));
  const title = hit ? hit.title : '资料来源 ' + n;
  if (hit && hit.url) {
    return (
      <sup className="sp-sup">
        <a href={hit.url} target="_blank" rel="noopener noreferrer" title={title}>[{n}]</a>
      </sup>
    );
  }
  return <sup className="sp-sup" title={title}>[{n}]</sup>;
}

/* ── 折叠板块（sessionStorage sp_fold_state 记忆，与旧版同键） ── */
const FOLD_KEY = 'sp_fold_state';

function readFold(): Record<string, boolean> {
  try { return JSON.parse(sessionStorage.getItem(FOLD_KEY) || '{}') || {}; } catch { return {}; }
}
function saveFold(key: string, expanded: boolean) {
  try {
    const s = readFold();
    s[key] = expanded;
    sessionStorage.setItem(FOLD_KEY, JSON.stringify(s));
  } catch { /* noop */ }
}

function SpFold({
  title, en, note, foldKey, folded, id, children,
}: {
  title: string; en: string; note?: string; foldKey: string; folded?: boolean;
  id?: string; children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(() => {
    const s = readFold();
    return Object.prototype.hasOwnProperty.call(s, foldKey) ? !!s[foldKey] : !folded;
  });
  return (
    <section id={id} className={'sp-sec sp-fold' + (expanded ? '' : ' is-folded')} data-sp-fold={foldKey}>
      <div className="sp-sec-head">
        <h2>{title}</h2><span className="sp-sec-en">{en}</span><span className="sp-sec-line"></span>
      </div>
      {note ? <p className="sp-sec-note">{note}</p> : null}
      <div className="sp-fold-clip">{children}</div>
      <button
        className="sp-fold-more" type="button" aria-expanded={expanded ? 'true' : 'false'}
        onClick={() => setExpanded((v) => {
          saveFold(foldKey, !v);
          return !v;
        })}
      >
        {expanded ? '收起板块 ↑' : '展开全部 ↓'}
      </button>
    </section>
  );
}

/* ── 学历核验块：锁定 / 解锁两态。锁定态渲染脱敏 copy，解锁后原文上桌 ── */
function VerifyBlock({
  s, state, onApply, onZoom,
}: {
  s: School; state: VerifyState; onApply: () => void;
  onZoom: (img: HTMLImageElement) => void;
}) {
  const v = s.verify || {};
  if (state.unlocked) {
    const until = state.unlocked.expiresAt ? formatExpiry(state.unlocked.expiresAt) : '24 小时后';
    return (
      <div className="sp-verify-open" data-sp-verify-open="">
        <div className="sp-verify-text">
          <p className="sp-verify-label">{v.label || '学历在线验证码'}<SpSup n={5} sources={s.sources} /></p>
          <p className="sp-verify-code">{v.code || ''}</p>
          <p className="sp-verify-tip">{v.tip || ''}</p>
          {v.url ? (
            <p className="sp-verify-tip"><a href={v.url} target="_blank" rel="noopener noreferrer">前往学信网查验 ↗</a></p>
          ) : null}
        </div>
        <img className="sp-verify-qr" src={v.qrImage || ''} alt={v.qrAlt || ''} data-sp-zoom=""
          onClick={(e) => onZoom(e.currentTarget)} />
        <p className="sp-verify-flag">✓ 已获本人批准查看 · 仅限申请用途 · 有效期至 {until}</p>
      </div>
    );
  }
  let note = '为保护隐私，学历在线验证码与二维码已加锁。若因招聘核验、背调等正当用途需要查看，请填写申请；本人核实身份后再解锁。';
  if (state.phase === 'expired') {
    note = '上次授权已于 ' + formatExpiry(state.expiredAt || Date.now()) + ' 到期，请重新申请。' + note;
  }
  return (
    <div className="sp-verify-lock" data-sp-verify-lock="">
      <div className="sp-lock-preview" aria-hidden="true">
        <div className="sp-lock-lines">
          <span className="sp-lock-label">{v.label || '学历在线验证码'}<SpSup n={5} sources={s.sources} /></span>
          <span className="sp-lock-code">•••• •••• •••• ••••</span>
          <span className="sp-lock-tip">CODE / QR LOCKED · 已加锁保护</span>
        </div>
        <span className="sp-lock-qr"><i>LOCK</i></span>
      </div>
      <div className="sp-lock-action">
        <p className={'sp-lock-note' + (state.phase === 'expired' ? ' is-expired' : '')}>{note}</p>
        <button className="sp-apply-btn" type="button" data-sp-verify-apply="" onClick={onApply}>申请查看权限 →</button>
      </div>
    </div>
  );
}

export default function SchoolPanel({ raw, schoolId }: { raw: School; schoolId: string }) {
  const { state, submit } = useVerifyAccess(schoolId, schoolId);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  const unlocked = !!state.unlocked;
  /* 渲染用数据：深拷贝（不改真相源），锁定态经统一脱敏 */
  const s = unlocked
    ? (redactCopy(raw, true) as School)
    : (redactCopy(raw, false) as School);

  /* Esc：弹窗 > 灯箱（旧版 keydown capture 语义） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalOpen) { setModalOpen(false); e.stopPropagation(); return; }
      if (zoom) { setZoom(null); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [modalOpen, zoom]);

  /* 灯箱开合的滚动锁（旧版 sp-modal-open 由弹窗专用；灯箱旧版无滚动锁，保持一致） */
  const onZoom = (img: HTMLImageElement) => {
    const src = img.getAttribute('src') || '';
    if (!src) return;
    setZoom({ src, alt: img.getAttribute('alt') || '' });
  };

  return (
    <>
      <HeadBlock s={s} />
      <KpiBlock s={s} />

      <SpFold title="学校概况" en="SCHOOL" foldKey="intro" folded>
        <SchoolIntro s={s} />
      </SpFold>
      <SpFold title="名称沿革与关键节点" en="HISTORY" foldKey="history">
        <HistoryBlock s={s} />
      </SpFold>
      <SpFold title="在校经历" en="TIMELINE" foldKey="timeline" note={s.timeline?.note}>
        <TimelineBlock s={s} />
      </SpFold>
      <SpFold title="主修课程表" en="COURSE MAP" foldKey="courses" note={s.courses?.note} folded>
        <CoursesBlock s={s} />
      </SpFold>
      <SpFold title="获奖证书" en="AWARDS" foldKey="awards">
        <AwardsBlock s={s} onZoom={onZoom} />
      </SpFold>
      <SpFold title="校园相册" en="ALBUM" foldKey="album" folded>
        <AlbumBlock s={s} unlocked={unlocked} onZoom={onZoom} />
      </SpFold>
      <SpFold title="从课程到工程" en="GROWTH" foldKey="growth" note={s.growth?.note}>
        {(s.growth?.items || []).map((it, i) => (
          <div key={i} className="sp-growth-item">
            <span className="sp-growth-course">{it.course}</span>
            <span className="sp-growth-arrow">→</span>
            <span className="sp-growth-now">{it.now}</span>
            <p className="sp-growth-text">{it.text}<SpSup n={0} /></p>
          </div>
        ))}
      </SpFold>
      <SpFold title="学历核验" en="VERIFY" foldKey="verify" id="sp-verify">
        <VerifyBlock s={s} state={state} onApply={() => setModalOpen(true)} onZoom={onZoom} />
      </SpFold>
      <SpFold title="数据说明与资料来源" en="SOURCES" foldKey="sources" folded>
        <SourcesBlock s={s} />
      </SpFold>

      <div className="sp-foot">
        <a className="sp-foot-link" href={SCHOOL_META.backToResume || 'resume.html'}>← 返回网页简历</a>
        <a className="sp-foot-link is-alt" href={SCHOOL_META.backToPortfolio || 'index.html'}>作品集主页 ↗</a>
        <button className="sp-foot-link is-alt" type="button" data-sp-print="" onClick={() => window.print()}>打印 / 存为 PDF ⎙</button>
      </div>
      <p className="sp-disclaimer">
        {SCHOOL_META.disclaimer || ''}
        {SCHOOL_META.collectedAt ? ' · 资料整理于 ' + SCHOOL_META.collectedAt : ''}
      </p>

      <AccessModal
        open={modalOpen} state={state}
        onClose={() => setModalOpen(false)}
        onSubmit={submit}
      />

      {zoom ? (
        <div
          className="sp-lightbox show" role="dialog" aria-modal="true" aria-label="图片放大预览"
          onClick={(e) => { if (e.target === e.currentTarget) setZoom(null); }}
        >
          <button className="sp-lightbox-close" type="button" aria-label="关闭大图"
            onClick={() => setZoom(null)}>×</button>
          <img id="spLightboxImg" alt="" src={zoom.src} />
        </div>
      ) : null}
    </>
  );
}

/* ── 申请弹窗（复刻旧版 accessModal：字段 / 校验 / honeypot / 提交文案一致） ── */
function AccessModal({
  open, state, onClose, onSubmit,
}: {
  open: boolean; state: VerifyState;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, onFail: (msg: string) => void, onOk: (polling: boolean) => void) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [lastFocus, setLastFocus] = useState<Element | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr('');
      setDoneText(null);
      formRef.current?.reset();
      setLastFocus(document.activeElement);
      document.body.classList.add('sp-modal-open');
      const first = formRef.current?.querySelector('input[name="name"]') as HTMLInputElement | null;
      first?.focus();
    } else {
      document.body.classList.remove('sp-modal-open');
    }
    return () => {
      document.body.classList.remove('sp-modal-open');
      if (lastFocus && (lastFocus as HTMLElement).focus) {
        try { (lastFocus as HTMLElement).focus(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* 轮询阶段的状态提示回流（批准 / 到期 / 拒绝 / 超时） */
  useEffect(() => {
    if (state.doneText) setDoneText(state.doneText);
  }, [state.doneText]);
  if (!open) return null;

  const fail = (msg: string) => { setErr(msg); setSending(false); };

  const onSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const reason = String(fd.get('reason') || '').trim();
    if (Array.from(name).length < 2) { fail('请填写姓名 / 称呼（至少 2 个字）'); return; }
    if (!fd.get('identity')) { fail('请选择你的当前身份'); return; }
    if (!fd.get('purpose')) { fail('请选择查看用途'); return; }
    if (Array.from(reason).length < 15) { fail('查看理由请至少写 15 个字，方便本人核实身份'); return; }
    if (!fd.get('consent')) { fail('请先确认信息真实、仅用于所填用途'); return; }
    setErr('');
    setSending(true);
    onSubmit(
      {
        name,
        identity: String(fd.get('identity') || ''),
        org: String(fd.get('org') || '').trim(),
        contact: String(fd.get('contact') || '').trim(),
        purpose: String(fd.get('purpose') || ''),
        reason,
        consent: true,
      },
      (msg) => fail(msg),
      (polling) => {
        setSending(false);
        setDoneText(polling
          ? '申请已提交。请留在此页等待：本人核验身份后批准，学历核验板块会自动解锁，无需刷新。授权仅对当前设备有效，24 小时后自动过期。'
          : '申请已提交。当前站点未启用在线审批，本人会通过你留下的联系方式回复。');
      },
    );
  };

  return (
    <div
      className="sp-modal-mask" id="spAccessModal" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sp-modal" aria-labelledby="spAccessTitle">
        <button className="sp-modal-close" type="button" data-sp-modal-close="" aria-label="关闭弹窗"
          onClick={onClose}>×</button>
        <p className="sp-modal-kicker">VERIFY / ACCESS REQUEST</p>
        <h3 className="sp-modal-title" id="spAccessTitle">申请查看学历核验信息</h3>
        <p className="sp-modal-lead">请说明你的身份与查看用途。信息会连同申请时间、设备与浏览器信息邮件发送给简历本人；本人核实身份后再决定是否解锁。批准后仅对当前设备有效，24 小时后自动过期，到期需重新申请。</p>
        {doneText ? (
          <div className="sp-form-done" data-sp-form-done="">
            <b>申请已提交</b>
            <p data-sp-form-done-text="">{doneText}</p>
            <button className="sp-submit is-alt" type="button" data-sp-modal-close="" onClick={onClose}>关闭</button>
          </div>
        ) : (
          <form className="sp-access-form" data-sp-access-form="" noValidate onSubmit={onSubmitForm} ref={formRef}>
            <label className="sp-field">
              <span className="sp-field-label">你的姓名 / 称呼 <em>必填</em></span>
              <input type="text" name="name" maxLength={40} autoComplete="name" placeholder="例如：张三" />
              <small>请写真实姓名，本人需要据此核实申请人身份。</small>
            </label>
            <label className="sp-field">
              <span className="sp-field-label">当前身份 <em>必填</em></span>
              <select name="identity">
                <option value="">请选择…</option>
                <option value="hr">HR / 招聘负责人</option>
                <option value="manager">用人经理 / 业务负责人</option>
                <option value="interviewer">面试官</option>
                <option value="headhunter">猎头 / 招聘顾问</option>
                <option value="partner">合作方 / 客户</option>
                <option value="researcher">研究者 / 学生</option>
                <option value="other">其他身份</option>
              </select>
            </label>
            <label className="sp-field">
              <span className="sp-field-label">所在公司 / 机构 <em>建议填写</em></span>
              <input type="text" name="org" maxLength={80} placeholder="例如：某某科技 · 招聘部" />
              <small>单位信息是核实身份的关键依据，HR / 猎头请务必填写。</small>
            </label>
            <label className="sp-field">
              <span className="sp-field-label">联系方式（邮箱或电话） <em>建议填写</em></span>
              <input type="text" name="contact" maxLength={120} placeholder="邮箱优先" />
              <small>留邮箱时，本人可直接回复这封申请邮件与你确认。</small>
            </label>
            <label className="sp-field">
              <span className="sp-field-label">查看用途 <em>必填</em></span>
              <select name="purpose">
                <option value="">请选择…</option>
                <option value="recruit">招聘流程评估</option>
                <option value="background">入职背景调查</option>
                <option value="interview">面试 / 技术评估</option>
                <option value="cooperation">商务合作尽职调查</option>
                <option value="research">学术研究 / 资料整理</option>
                <option value="other">其他用途</option>
              </select>
            </label>
            <label className="sp-field">
              <span className="sp-field-label">查看理由 <em>必填 · 至少 15 字</em></span>
              <textarea name="reason" rows={5} maxLength={600} placeholder="请具体说明为什么要查看学历验证码…"></textarea>
              <small className="sp-field-guide">
                <b>填写引导：</b>① 你是谁、代表哪家公司；② 为什么必须核验学历；③ 信息只用于什么场景、不会外传。<br />
                <b>示例：</b>我是某某科技 HR BP 张三，正在推进陈培胜后端工程师岗位的录用流程，需要核验学信网学历信息以完成入职背调；该信息仅用于本次招聘评估，不会外传。
              </small>
            </label>
            <label className="sp-check">
              <input type="checkbox" name="consent" value="1" />
              <span>我确认以上信息真实，且仅用于所填用途，不会转交第三方。</span>
            </label>
            <div className="sp-honeypot" aria-hidden="true">
              <label>网站地址<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            {err ? <p className="sp-form-error" data-sp-form-error="" style={{ display: 'block' }}>{err}</p> : null}
            <button className="sp-submit" type="submit" data-sp-submit="" disabled={sending}>
              {sending ? '提交中…' : '提交申请 →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── 头部 / KPI / 各板块 ── */
function HeadBlock({ s }: { s: School }) {
  return (
    <header className="sp-head">
      <div className="sp-head-top">
        {s.logo ? (
          <span className="sp-stamp has-logo" aria-hidden="true">
            <img className="sp-stamp-logo" src={s.logo} alt="" />
          </span>
        ) : (
          <span className="sp-stamp" aria-hidden="true">{s.code || 'SCHOOL'}</span>
        )}
        <div className="sp-head-main">
          <span className="sp-kicker">SCHOOL FILE · 学校档案</span>
          <h1 className="sp-title">
            {s.name}
            {/* 引导锚点：整篇档案很长，学历核验在页尾容易被漏看；有核验数据才挂入口 */}
            {s.verify ? (
              <a className="sp-jump" href="#sp-verify" title="跳到本页末尾的学历核验板块 · 可申请在线查验">学历核验</a>
            ) : null}
          </h1>
          {s.currentName ? <p className="sp-current"><b>现校名</b>{s.currentName}</p> : null}
          <p className="sp-sub">{s.industry || ''} · {s.period || ''} · {s.degree || ''}</p>
          <p className="sp-oneline">{s.oneLine || ''}</p>
        </div>
      </div>
      <div className="sp-pills">
        {(s.pills || []).map((p, i) => <span key={i} className="sp-pill">{p}</span>)}
      </div>
    </header>
  );
}

function KpiBlock({ s }: { s: School }) {
  return (
    <div className="sp-sec sp-sec-first">
      <div className="sp-kpi-grid">
        {(s.kpis || []).map((k, i) => (
          <div key={i} className="sp-kpi">
            <p className="sp-kpi-label">{k.label}</p>
            <p className="sp-kpi-value">{k.value}</p>
            <p className="sp-kpi-sub">{k.sub || ''}</p>
          </div>
        ))}
      </div>
      {s.nameNote ? <p className="sp-callout" style={{ marginTop: '12px' }}>{s.nameNote}<SpSup n={1} sources={s.sources} /></p> : null}
      {s.logoNote ? <p className="sp-note" style={{ marginTop: '8px' }}>{s.logoNote}</p> : null}
    </div>
  );
}

function SchoolIntro({ s }: { s: School }) {
  const sc = s.school || {};
  return (
    <>
      <p className="sp-callout">{sc.intro || ''}<SpSup n={1} sources={s.sources} /></p>
      <div style={{ marginTop: '12px' }}>
        {(sc.facts || []).map((f, i) => (
          <div key={i} className="sp-row">
            <p className="sp-row-label">{f.label}</p>
            <p className="sp-row-text">{f.text}<SpSup n={f.source} sources={s.sources} /></p>
          </div>
        ))}
      </div>
      {sc.website ? (
        <div className="sp-row">
          <p className="sp-row-label">官网</p>
          <p className="sp-row-text"><a href={sc.website.href} target="_blank" rel="noopener noreferrer">{sc.website.text} ↗</a></p>
        </div>
      ) : null}
      {sc.motto ? (
        <p className="sp-note" style={{ marginTop: '10px' }}><strong>校训：</strong>{sc.motto}<SpSup n={1} sources={s.sources} /></p>
      ) : null}
    </>
  );
}

function HistoryBlock({ s }: { s: School }) {
  const sc = s.school || {};
  const campuses = sc.campuses || [];
  const highs = sc.highlights || [];
  return (
    <>
      <div className="sp-hist">
        {(sc.history || []).map((h, i) => (
          <div key={i} className="sp-hist-item">
            <p className="sp-hist-date">{h.date}</p>
            <div>
              <p className="sp-hist-title">{h.title}</p>
              <p className="sp-hist-text">{h.text}<SpSup n={h.source} sources={s.sources} /></p>
            </div>
          </div>
        ))}
      </div>
      {campuses.length ? (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 900, margin: '16px 0 2px' }}>两个校区</h3>
          <div className="sp-campus-grid">
            {campuses.map((c, i) => (
              <div key={i} className="sp-campus">
                <p className="sp-campus-name">{c.name}<SpSup n={c.source} sources={s.sources} /></p>
                <p className="sp-campus-addr">{c.address}</p>
                <p className="sp-campus-note">{c.note || ''}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {highs.length ? (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 900, margin: '18px 0 10px' }}>与专业相关的办学条件</h3>
          {highs.map((h, i) => (
            <div key={i} className="sp-highlight">
              <p className="sp-highlight-title">{h.title}</p>
              <p className="sp-highlight-detail">{h.detail}<SpSup n={h.source} sources={s.sources} /></p>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}

function TimelineBlock({ s }: { s: School }) {
  return (
    <div className="sp-timeline">
      {(s.timeline?.items || []).map((t, i) => (
        <div key={i} className={'sp-tl-item' + (t.kind === 'after' ? ' is-after' : '')}>
          <span className="sp-tl-no">{t.no}</span><span className="sp-tl-term">{t.term}</span>
          <p className="sp-tl-title">{t.title}<SpSup n={0} /></p>
          <p className="sp-tl-text">{t.text}</p>
          {t.tags && t.tags.length ? (
            <div className="sp-tags">{t.tags.map((g, k) => <span key={k} className="sp-tag">{g}</span>)}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CoursesBlock({ s }: { s: School }) {
  const c = s.courses || {};
  return (
    <>
      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead><tr><th>学年</th><th>阶段重点</th><th>主修课程</th><th>能力产出</th></tr></thead>
          <tbody>
            {(c.terms || []).map((t, i) => (
              <tr key={i}>
                <td><span className="sp-term">{t.term}</span><span className="sp-term-en">{t.en}</span></td>
                <td><span className="sp-focus">{t.focus}</span></td>
                <td>
                  <div className="sp-chips">
                    {(t.items || []).map((it, k) => (
                      <span key={k} className={'sp-chip' + (it.confirmed ? '' : ' is-ref')}>{it.name}</span>
                    ))}
                  </div>
                </td>
                <td><span className="sp-output">{t.output}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sp-legend">
        <span><i className="is-solid"></i>简历 / 作品集明确记载</span>
        <span><i className="is-ref"></i>同课程群常见科目（参考）</span>
      </div>
    </>
  );
}

function AwardsBlock({ s, onZoom }: { s: School; onZoom: (img: HTMLImageElement) => void }) {
  return (
    <div className="sp-award-grid">
      {(s.awards || []).map((a, i) => (
        <div key={i} className={'sp-award' + (a.muted ? ' is-muted' : '')}>
          <img className="sp-award-img" src={a.img} alt={a.alt} loading="lazy" data-sp-zoom=""
            onClick={(e) => onZoom(e.currentTarget)} />
          <div className="sp-award-body">
            <span className="sp-award-tag">{a.tag || a.level}</span>
            <p className="sp-award-title">{a.title}</p>
            <p className="sp-award-org">{a.org || ''}{a.year ? ' · ' + a.year : ''}</p>
            <p className="sp-award-note">{a.note || ''}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlbumBlock({ s, unlocked, onZoom }: { s: School; unlocked: boolean; onZoom: (img: HTMLImageElement) => void }) {
  return (
    <div className="sp-album-grid">
      {(s.album || []).map((a, i) => {
        /* 相册里也收录了学历二维码，同样加锁，避免从别的板块绕过 */
        const isQr = a.img && String(a.img).indexOf('edu-verify-qr') >= 0;
        const qrOpen = isQr && unlocked;
        return (
          <div key={i} className="sp-album-item">
            <span className="sp-album-tag">{a.tag || ''}</span>
            {qrOpen
              ? <img className="sp-album-img" src={a.img} alt={a.alt} loading="lazy" data-sp-zoom=""
                  onClick={(e) => onZoom(e.currentTarget)} />
              : isQr
                ? <div className="sp-album-locked" data-sp-album-qr="1"><span>LOCK</span><small>二维码已加锁 · 请在「学历核验」板块申请查看</small></div>
                : a.empty
                  ? <div className="sp-album-empty"><span>＋</span>暂无可公开照片</div>
                  : <img className="sp-album-img" src={a.img} alt={a.alt} loading="lazy" data-sp-zoom=""
                      onClick={(e) => onZoom(e.currentTarget)} />}
            <span className="sp-album-cap">{a.caption}</span>
            <span className="sp-album-note">{a.note || ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function SourcesBlock({ s }: { s: School }) {
  const dc = s.dataConfidence || {};
  return (
    <>
      <p className="sp-callout">{dc.note || ''}</p>
      {(dc.items || []).length ? (
        <>
          <h3 style={{ fontSize: '13px', fontWeight: 900, margin: '14px 0 6px' }}>数据置信度</h3>
          {(dc.items || []).map((i, k) => (
            <div key={k} className="sp-conf-item">
              <span className="sp-conf-label">{i.label}</span>
              <span className="sp-conf-level">{i.level}</span>
              <span className="sp-conf-detail">{i.detail}</span>
            </div>
          ))}
        </>
      ) : null}
      {(s.sources || []).length ? (
        <>
          <h3 style={{ fontSize: '13px', fontWeight: 900, margin: '16px 0 6px' }}>资料来源</h3>
          {(s.sources || []).map((x, i) => (
            <div key={i} className="sp-src-item">
              <span className="sp-src-no">[{x.id}]</span>
              <div className="sp-src-title">
                <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title} ↗</a>
                <span className="sp-src-url">{x.url}</span>
              </div>
              <p className="sp-src-note">{x.note || ''}</p>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
