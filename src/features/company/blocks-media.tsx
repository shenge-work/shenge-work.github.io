/**
 * 公司档案 · 媒体/互动类板块（M2）—— 橱窗 / 访谈视频 / 友商 / 办公相册 /
 * 加密佐证挂载点 / 来源 / 读者互动骨架。
 * 全景与互动区块按「渐进迁移」以 window 桥接复用旧 js（cp-panorama.js /
 * company-social.js / secure-access.js 在 M3-M5 收编；见 M2 里程碑日志）。
 */
import { useEffect, useRef, useState } from 'react';
import FoldableSection, { Sup } from './FoldableSection';
import { COMPANY_META, COMPANIES, type Company } from './data';
import { PANO_ICON } from './pano';

/* ── 产品橱窗：截图卡 / 字标卡两态共用同一卡片结构 ── */
export function ShowcaseBlock({ c }: { c: Company }) {
  const list = c.showcase || [];
  if (!list.length) return null;
  return (
    <FoldableSection
      title="产品橱窗" stateKey={`${c.id}:showcase`} count={list.length} threshold={3}
      heavy={list.some((p) => !!p.img)} foldH={260} countText={list.length + ' 款产品'}
    >
      <p className="cp-showcase-note">{list.length} 款产品 · 点击卡片访问官网</p>
      <div className="cp-showcase">
        {list.map((p, i) => {
          const mineInHead = p.img && p.mine ? <span className="cp-product-mine">本人参与</span> : null;
          const meta = (
            <div className="cp-product-cover-meta">
              {!p.img && p.mine ? <span className="cp-product-mine">本人参与</span> : null}
              <span className="cp-product-domain">{p.domain || ''}</span>
            </div>
          );
          const cover = p.img ? (
            <div className="cp-product-cover has-img">
              <img src={p.img} alt={String(p.name || '') + ' 产品页封面'} loading="lazy" />
              {meta}
            </div>
          ) : (
            <div className={'cp-product-cover tone-' + (p.tone || 'blue')}>
              <span className="cp-product-mark" aria-hidden="true">{p.mark || ''}</span>
              {meta}
            </div>
          );
          return (
            <a
              key={i} className="cp-product" href={p.url || ''} target="_blank" rel="noopener noreferrer"
              aria-label={'访问 ' + (p.name || '') + ' 官网（新窗口）'}
            >
              {cover}
              <div className="cp-product-body">
                <div className="cp-product-head">
                  <span className="cp-product-name">{p.name || ''}</span>
                  {mineInHead}
                  <span className="cp-product-kind">{p.kind || ''}</span>
                </div>
                <p className="cp-product-tagline">{p.tagline || ''}<Sup n={p.source || ''} /></p>
                {p.subProducts && p.subProducts.length ? (
                  <div className="cp-product-subs">
                    {p.subProducts.map((x, k) => <span key={k} className="cp-product-sub">{x}</span>)}
                  </div>
                ) : null}
                <div className="cp-product-foot">
                  <span>来源 · {p.sourceLabel || '产品官网'}</span>
                  <span className="cp-product-go">访问官网 ↗</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </FoldableSection>
  );
}

/* ── 访谈 / 视频：本地归档 + 对象存储直链，防原链接失效 ── */
export function InterviewBlock({ c }: { c: Company }) {
  const list = c.interviews || [];
  if (!list.length) return null;
  const hasVideo = list.some((v) => v.video);
  return (
    <FoldableSection
      title="访谈 / 视频" stateKey={`${c.id}:interviews`} count={list.length} threshold={2}
      heavy={hasVideo} foldH={190} countText={list.length + ' 条'}
    >
      {list.map((v, i) => {
        const meta = [
          v.host ? '主持 / 出品：' + v.host : '',
          v.guest ? '受访者：' + v.guest : '',
          v.date ? '发布：' + v.date : '',
          v.duration ? '时长：' + v.duration : '',
          v.platform ? '平台：' + v.platform : '',
        ].filter(Boolean).join(' · ');
        return (
          <article key={i} className="cp-interview">
            {v.video ? (
              <div className="cp-video-wrap">
                <video className="cp-video" controls preload="metadata" poster={v.poster} src={v.video}>
                  您的浏览器不支持 HTML5 视频。
                </video>
              </div>
            ) : null}
            <div className="cp-interview-body">
              <h5 className="cp-interview-title">{v.title || ''}<Sup n={v.source || ''} /></h5>
              {meta ? <p className="cp-interview-meta">{meta}</p> : null}
              {v.desc ? <p className="cp-interview-desc">{v.desc}</p> : null}
              {v.chapters && v.chapters.length ? (
                <div className="cp-video-chapters">
                  {v.chapters.map((ch, k) => <span key={k} className="cp-pill">{ch}</span>)}
                </div>
              ) : null}
              <div className="cp-interview-links">
                {v.originalUrl ? (
                  <a className="cp-video-link" href={v.originalUrl} target="_blank" rel="noopener noreferrer">查看原视频 ↗</a>
                ) : null}
                {v.archiveNote ? <span className="cp-video-archive">{v.archiveNote}</span> : null}
              </div>
            </div>
          </article>
        );
      })}
    </FoldableSection>
  );
}

/* ── 友商 / 竞品分析：带 profileId 且档案存在的友商，卡片可跳 ?c=id（真实导航）── */
export function CompetitorBlock({ c, standalone }: { c: Company; standalone?: boolean }) {
  const cmp = c.competitors ?? { players: [] };
  const list = cmp.players ?? [];
  if (!list.length && !cmp.landscape) return null;
  /* 独立档案页语境：linked 只需要 data-cp 属性供可访问性与状态一致；
     实际跳转交给 <a href="?c=id"> 整页导航（旧版 data-cp-nav=1 行为）。 */
  const linkable = list.some((p) => p.profileId && COMPANIES[p.profileId]);
  const row = (label: string, val: string | undefined, withSup?: boolean, source?: string | number) =>
    !val ? null : (
      <div className="cp-cmp-row">
        <span className="cp-cmp-k">{label}</span>
        <span className="cp-cmp-v">{val}{withSup && source ? <Sup n={source} /> : null}</span>
      </div>
    );
  const kindCls: Record<string, string> = {
    '直接竞品': 'direct', '相邻赛道': 'adjacent', '间接竞品': 'indirect',
    '错位竞品': 'offset', '单点竞品': 'point', '新兴竞品': 'emerging',
    '平台型竞品': 'platform', '差异化竞品': 'diff', adjacent: 'adjacent',
  };
  return (
    <FoldableSection
      title="友商 / 竞品分析" stateKey={`${c.id}:competitors`} count={list.length}
      threshold={4} foldH={240} countText={list.length + ' 家'}
    >
      {linkable ? <p className="cp-cmp-hint">点击友商名称或「查看公司档案」，进入对应公司的完整档案</p> : null}
      {cmp.landscape ? <p className="cp-cmp-landscape">{cmp.landscape}</p> : null}
      {list.length ? (
        <div className="cp-cmp-grid">
          {list.map((p, i) => {
            const linked = !!(p.profileId && COMPANIES[p.profileId]);
            const attrs = linked
              ? { href: 'company.html?c=' + encodeURIComponent(p.profileId!), 'data-cp': p.profileId!, 'data-cp-nav': '1' }
              : {};
            const kindClass = 'cp-cmp-kind is-' + (kindCls[p.kind || ''] || 'other');
            return (
              <article key={i} className="cp-cmp-card">
                <div className="cp-cmp-card-head">
                  <span className={'cp-cmp-mark tone-' + (p.tone || 'blue')}>{p.mark || ''}</span>
                  <div className="cp-cmp-ident">
                    {linked ? (
                        <a className="cp-cmp-name is-link" {...attrs}>{p.name || ''}</a>
                    ) : (
                      <span className="cp-cmp-name">{p.name || ''}</span>
                    )}
                    {p.vendor ? <span className="cp-cmp-vendor">{p.vendor}</span> : null}
                  </div>
                  <span className={kindClass}>{p.kind || ''}</span>
                </div>
                <div className="cp-cmp-rows">
                  {row('定位', p.position)}
                  {row('体量', p.scale)}
                  {row('与本公司', p.vs, true, p.source)}
                </div>
                <div className="cp-cmp-foot">
                  {p.url ? (
                    <a className="cp-cmp-link" href={p.url} target="_blank" rel="noopener noreferrer">访问官网 ↗</a>
                  ) : (
                    <span className="cp-cmp-src">竞品信息来源见 <Sup n={p.source || ''} /></span>
                  )}
                  {linked && standalone ? (
                    <a className="cp-cmp-profile" {...attrs}>查看公司档案 →</a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </FoldableSection>
  );
}

/* ── 办公图相册 + 360° 全景（Bridge：查看器为旧 js/cp-panorama.js）── */
const OFFICE_FOLD = 3;

export function OfficeBlock({ c, onZoom }: { c: Company; onZoom: (img: HTMLImageElement) => void }) {
  const panos = c.panoramas || [];
  const photos = c.office || [];
  const total = panos.length + photos.length;
  const many = total > OFFICE_FOLD;
  const [folded, setFolded] = useState(many);
  const prefetched = useRef(new Set<string>());

  /* 全景主图 ~580KB：hover / 键盘聚焦时静默预取，点开后几乎零等待 */
  const prefetch = (pi: number) => {
    const p = panos[pi];
    if (!p || !p.img || prefetched.current.has(p.img)) return;
    prefetched.current.add(p.img);
    const resolve = window.CPPanorama?.resolve;
    if (!resolve) return;
    const pre = new Image();
    pre.src = resolve(p.img);
  };

  if (!total) return null;
  let n = 0;
  return (
    <section className="cp-sec">
      <h4 className="cp-sec-title">办公与环境</h4>
      <div className={'cp-office' + (folded ? ' is-folded' : '')} data-cp-album="">
        {panos.map((p, pi) => {
          const extra = many && n >= OFFICE_FOLD ? ' is-extra' : '';
          n++;
          return (
            <figure
              key={pi} className={'cp-office-img is-pano' + extra}
              data-cp-pano={pi} data-cp-company={c.id}
              onPointerOver={() => prefetch(pi)}
              onFocusCapture={() => prefetch(pi)}
              onClick={(ev) => {
                const img = (ev.target as Element).closest?.('.cp-office-img img') as HTMLImageElement | null;
                if (!img) return;
                /* 全景查看器：桥接旧 js/cp-panorama.js；无查看器或无全景数据时退灯箱 */
                if (window.CPPanorama && panos.length) {
                  ev.preventDefault();
                  window.CPPanorama.open(panos as unknown as Array<Record<string, unknown>>, pi,
                    img.currentSrc || img.src);
                  return;
                }
                onZoom(img);
              }}
            >
              <img src={p.cover || p.img} alt={p.alt || p.title || '360° 全景'} loading="lazy" />
              <span className="cp-pano-badge" aria-hidden="true">{PANO_ICON}360° 全景</span>
              <figcaption>{p.note || ''}</figcaption>
            </figure>
          );
        })}
        {photos.map((o, i) => {
          const extra = many && n >= OFFICE_FOLD ? ' is-extra' : '';
          n++;
          return o.img ? (
            <figure key={i} className={'cp-office-img' + extra}>
              <img
                src={o.img} alt={o.alt || o.note || ''} loading="lazy"
                onClick={(ev) => onZoom(ev.currentTarget)}
              />
              <figcaption>{o.note || ''}</figcaption>
            </figure>
          ) : (
            <figure key={i} className={'cp-office-img is-ph' + extra}>
              <div className="cp-ph">
                <span className="cp-ph-code">{c.code || ''}</span>
                <span className="cp-ph-tag">照片待补充</span>
              </div>
              <figcaption>{o.note || ''}</figcaption>
            </figure>
          );
        })}
      </div>
      {many ? (
        <button
          className="cp-album-toggle" type="button" data-cp-album-toggle=""
          aria-expanded={folded ? 'false' : 'true'}
          onClick={() => setFolded((v) => !v)}
        >
          {folded ? `展开全部 ${total} 张 ↓` : '收起相册 ↑'}
        </button>
      ) : null}
    </section>
  );
}

/* ── 任职佐证材料（默认加锁）：渲染挂载点，行为由旧 js/secure-access.js 桥接 ── */
export function SecureMaterialsBlock({ c }: { c: Company }) {
  const m = c.secureMaterials;
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!m || !m.resource) return;
    try { window.SecureAccess?.mountAll(hostRef.current?.parentElement || undefined); } catch { /* 静默降级，与旧版一致 */ }
  });
  if (!m || !m.resource) return null;
  const items = m.items || [];
  const available = items.filter((it) => it.status === 'available');
  const brief = items.map((it) => ({ label: it.label || '材料', issuer: it.issuer || '', status: it.status || 'available' }));
  return (
    <div ref={hostRef}>
      <FoldableSection
        id="cp-proof"
        cls="cp-sec cp-secure-materials"
        stateKey={`${c.id}:secure-materials`}
        noFold
        title={<>任职佐证材料 <span className="cp-sec-en">EMPLOYMENT PROOF · LOCKED</span></>}
      >
        <div
          className="cp-secure-mount"
          data-secure-access={m.resource}
          data-secure-title={m.title || '任职佐证材料'}
          data-secure-lead={m.note || ''}
          data-secure-items={JSON.stringify(brief)}
          data-secure-pending={available.length ? '0' : '1'}
        ></div>
      </FoldableSection>
    </div>
  );
}

/* ── 数据来源 + 免责声明（footer 形态）── */
export function SourcesBlock({ c }: { c: Company }) {
  const src = c.sources || [];
  return (
    <FoldableSection
      as="footer" cls="cp-sources" headAs="p" headCls="cp-src-title"
      stateKey={`${c.id}:sources`} count={src.length} threshold={10} foldH={170}
      countText={src.length + ' 条来源'}
      title={<>数据来源（采集于 {COMPANY_META.collectedAt || ''}）</>}
    >
      <ol>
        {src.map((s, i) => (
          <li key={i}>
            <span className="cp-src-no">[{s.n}]</span>
            {s.url
              ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>
              : s.name}
          </li>
        ))}
      </ol>
      {COMPANY_META.disclaimer ? <p className="cp-disclaimer">{COMPANY_META.disclaimer}</p> : null}
    </FoldableSection>
  );
}

/* ── 读者互动骨架（浏览 / 点赞 / 评论）：渲染骨架 + 旧 js/company-social.js 挂载 ── */
export function SocialMount({ cid }: { cid: string }) {
  const secRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try { window.CompanySocial?.mount(secRef.current?.parentElement || null, cid); } catch { /* 静默，与旧版一致 */ }
  }, [cid]);
  return (
    <section className="cp-sec cp-social" data-cs-root={cid} ref={secRef}>
      <h4 className="cp-sec-title">读者互动</h4>
      <div className="cs-bar">
        <span className="cs-views" title="按设备 + 浏览器去重统计">👁 <b data-cs-views>—</b> 次浏览</span>
        <button type="button" className="cs-like-main" data-cs-like-main>♡ <b data-cs-likes>0</b> 赞同</button>
      </div>
      <form className="cs-form" data-cs-form>
        <div className="cs-form-row">
          <input type="text" name="name" maxLength={24} placeholder="昵称（可不填）" aria-label="昵称" />
          <button type="submit" className="cs-submit">发表评论</button>
        </div>
        <textarea name="text" maxLength={500} rows={2} placeholder="说说你的看法…（至少 2 个字）" aria-label="评论内容"></textarea>
      </form>
      <div className="cs-list" data-cs-list><p className="cs-empty">评论加载中…</p></div>
      <p className="cs-tip" data-cs-tip>评论公开可见，请友善发言；设备标识仅用于浏览与点赞去重。</p>
    </section>
  );
}
