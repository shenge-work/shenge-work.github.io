/**
 * 公司档案 · 面板（M2）—— 复刻 js/company-profile.js renderPanel() 的组装序。
 * 供独立页 company.html 使用；M3 首页抽屉 / M4 简历抽屉迁移时复用同一组件族。
 */
import { useEffect, useRef, useState } from 'react';
import ExecCarousel from './ExecCarousel';
import { Sup } from './FoldableSection';
import {
  BusinessBlock, BossProfileBlock, ChartBlock, DataConfidenceBlock, EntityHistoryBlock,
  FundingBlock, InvestorsBlock, KpiBlock, OutlookBlock, PredecessorBlock,
  RecognitionBlock, WechatBlock,
} from './blocks';
import {
  CompetitorBlock, InterviewBlock, OfficeBlock, SecureMaterialsBlock,
  ShowcaseBlock, SocialMount, SourcesBlock,
} from './blocks-media';
import type { Company } from './data';

export default function CompanyProfilePanel({ c }: { c: Company }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const reg = c.registry || {};

  /* 挂载后：资产 CDN 统一重写（与旧版 DOMContentLoaded → applyDOM 同时序）+ 标题 */
  useEffect(() => {
    try { window.AssetURL?.rewriteDOM(rootRef.current ?? undefined); } catch { /* 静默降级 */ }
    document.title = (c.name || '公司档案') + ' · 公司档案 | 陈培胜';
  }, [c.id, c.name]);

  /* Esc 链（与旧版全局 keydown 一致）：全景 → 灯箱 */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (window.CPPanorama?.isOpen()) { window.CPPanorama.close(); return; }
      setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 灯箱开合时维护 body.scroll 锁（旧版 cp-lock） */
  useEffect(() => {
    if (zoom) document.body.classList.add('cp-lock');
    else document.body.classList.remove('cp-lock');
    return () => document.body.classList.remove('cp-lock');
  }, [zoom]);

  const openLightbox = (img: HTMLImageElement) => {
    setZoom({ src: img.currentSrc || img.src, alt: img.alt || '' });
  };

  const pills = [c.stage, c.scale, reg.hq].filter(Boolean);
  const pred = c.predecessor || null;
  /* 顶部引导锚点：材料名按数据动态取；没配 secureMaterials 的档案不挂入口 */
  const proof = c.secureMaterials;
  const proofLabel = proof?.resource
    ? (proof.items?.[0]?.label || '任职佐证材料')
    : '';

  return (
    <div ref={rootRef}>
      <header className="cp-head">
        <div className="cp-head-top">
          {c.logo ? (
            <span className="cp-stamp has-logo" aria-hidden="true">
              <img className="cp-stamp-logo" src={c.logo} alt="" />
            </span>
          ) : (
            <span className="cp-stamp" aria-hidden="true">{c.code || ''}</span>
          )}
          <div className="cp-head-main">
            <h3 className="cp-title" id="cpTitle">
              {c.name}
              {proofLabel ? (
                <a className="cp-jump" href="#cp-proof" title="跳到本页末尾的任职佐证材料 · 可申请查看">{proofLabel}</a>
              ) : null}
            </h3>
            <p className="cp-sub">
              {c.industry || ''}
              {c.website ? <> · <a className="cp-site" href={c.website.href} target="_blank" rel="noopener noreferrer">{c.website.text} ↗</a></> : null}
              {reg.founded ? <> · <span className="cp-founded">成立于 {reg.founded}</span></> : null}
            </p>
            <p className="cp-entity">{c.entity || c.name}<Sup n={reg.source || ''} /></p>
            {c.renameNote ? (
              <p className="cp-entity">{c.renameNote}<Sup n={c.bossProfile?.source || ''} /></p>
            ) : null}
            {pred && pred.name ? (
              <p className="cp-entity cp-pred-entity">
                前身主体：{pred.name}
                {pred.shortName ? `（${pred.shortName}）` : ''}
                <Sup n={(pred.sources || [])[0] || ''} />
              </p>
            ) : null}
          </div>
          {c.bossProfile?.foundingTeam ? (
            <ExecCarousel team={c.bossProfile.foundingTeam} source={c.bossProfile.source} />
          ) : null}
        </div>
        <p className="cp-oneline">{c.oneLine || ''}</p>
        <div className="cp-pills">
          {pills.map((p) => <span key={p} className="cp-pill">{p}</span>)}
        </div>
      </header>

      <div className="cp-sec cp-sec-first"><KpiBlock c={c} /></div>

      <PredecessorBlock c={c} />
      <BusinessBlock c={c} />
      <ShowcaseBlock c={c} />
      <InterviewBlock c={c} />
      {c.chart ? <ChartBlock c={c} /> : null}
      {c.funding ? <FundingBlock c={c} /> : null}
      <InvestorsBlock c={c} />
      <EntityHistoryBlock c={c} />
      <RecognitionBlock c={c} />
      <BossProfileBlock c={c} />
      <CompetitorBlock c={c} standalone />
      <OutlookBlock c={c} />
      <OfficeBlock c={c} onZoom={openLightbox} />
      <DataConfidenceBlock c={c} />
      <SecureMaterialsBlock c={c} />
      <SourcesBlock c={c} />
      <WechatBlock c={c} />
      <SocialMount cid={c.id} />

      {zoom ? (
        <div
          className="cp-lightbox"
          onClick={(e) => { if (e.target === e.currentTarget) setZoom(null); }}
        >
          <button
            type="button" className="cp-lightbox-close" aria-label="关闭"
            onClick={() => setZoom(null)}
          >✕</button>
          <img src={zoom.src} alt={zoom.alt} />
        </div>
      ) : null}
    </div>
  );
}
