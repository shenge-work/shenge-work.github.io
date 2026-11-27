/**
 * 公司档案 · 折叠板块封装（M2）—— 复刻 js/company-profile.js 的 foldBlock()。
 * DOM 结构 / 类名 / aria 与旧版一致（css/company-profile.css 零改动）。
 * foldState 为模块级（同页面会话记忆：手动展开过的板块在换公司/重开后仍保持）。
 *
 * 折叠判定与旧版逐条对齐：heavy / count>=threshold 之外，旧版还有
 * inner.length >= 1400（板块 HTML 字符串长度）兜底——本组件在 mount 时实测
 * 内容容器的 innerHTML 长度（React 生成的结构与旧版模板一致），超过阈值即
 * 切换为折叠结构；useLayoutEffect 在 paint 前完成修正，无可见闪烁。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const FOLD_TEXT_LIMIT = 1400;

/** 同页面会话内的展开记忆（与旧版模块级 foldState 对象语义一致） */
const foldMemory = new Map<string, boolean>();

/** mount 时测量过的内容长度缓存（stateKey+代次，避免重复 DOM 序列化） */
const measuredLen = new Map<string, number>();

export function resetFoldMemory() {
  /* 独立页全程单页应用（?c= 切换是整页导航），无需重置；保留 API 供测试用 */
  foldMemory.clear();
  measuredLen.clear();
}

export function Sup({ n }: { n?: string | number | null }) {
  if (n == null || n === '') return null;
  return <sup className="cp-ref">{String(n)}</sup>;
}

export interface FoldProps {
  /** 章节标签（默认 section）—— 旧版 tag 参数 */
  as?: 'section' | 'footer';
  /** 附加 class（cp-sec / cp-sources 等） */
  cls?: string;
  /** 标题标签（默认 h4）/ 标题 class（默认 cp-sec-title） */
  headAs?: 'h4' | 'p';
  headCls?: string;
  /** 标题内容（可含 <Sup/>） */
  title: ReactNode;
  children: ReactNode;
  /** 状态键：cid:key（旧版 stateKey 同规则） */
  stateKey: string;
  count?: number;
  countText?: string;
  threshold?: number;
  foldH?: number;
  heavy?: boolean;
  /** 强制折叠 / 强制不折叠（旧版 fold === true / false） */
  forceFold?: boolean;
  noFold?: boolean;
  /** 稳定锚点 id（首屏引导锚点跳转用，纯 #hash，无 JS 依赖） */
  id?: string;
}

export default function FoldableSection({
  as = 'section', cls = 'cp-sec', headAs = 'h4', headCls = 'cp-sec-title',
  title, children, stateKey, count = 0, countText, threshold = 4, foldH = 132,
  heavy = false, forceFold = false, noFold = false, id,
}: FoldProps) {
  const Tag = as;
  const HeadTag = headAs;
  const clipRef = useRef<HTMLDivElement>(null);

  const needFoldBase = forceFold || (!noFold && (heavy || count >= threshold));
  const [needFold, setNeedFold] = useState(needFoldBase);

  /* mount 后实测内容 HTML 长度（对应旧版 inner.length），决定是否升级为折叠结构；
     升级时同步校正 expanded 初值：折叠结构下默认收起（除非会话记忆里展开过） */
  useLayoutEffect(() => {
    if (noFold || forceFold) return;
    const len = clipRef.current?.innerHTML.length ?? 0;
    measuredLen.set(stateKey, len);
    if (len >= FOLD_TEXT_LIMIT && !needFoldBase) {
      setNeedFold(true);
      setExpanded(foldMemory.has(stateKey) ? !!foldMemory.get(stateKey) : false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = countText || (count ? `共 ${count} 项` : '内容较多');

  const [expanded, setExpanded] = useState(() => {
    if (!needFold) return true;
    const remembered = foldMemory.has(stateKey);
    return remembered ? !!foldMemory.get(stateKey) : false;
  });

  if (!needFold) {
    return (
      <Tag id={id} className={cls}>
        <HeadTag className={headCls}>{title}</HeadTag>
        <div ref={clipRef}>{children}</div>
      </Tag>
    );
  }

  const panelId = 'cpfold-' + stateKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  const toggle = () => {
    setExpanded((cur) => {
      foldMemory.set(stateKey, !cur);
      return !cur;
    });
  };

  return (
    <Tag
      id={id}
      className={`${cls} cp-foldable${expanded ? '' : ' is-folded'}`}
      data-cp-fold=""
      data-cp-fold-key={stateKey}
      data-cp-fold-count={meta}
      style={{ ['--fold-h' as string]: `${foldH}px` }}
    >
      <HeadTag className={`${headCls} cp-fold-head`}>
        <button
          className="cp-fold-trigger" type="button"
          aria-expanded={expanded ? 'true' : 'false'} aria-controls={panelId}
          onClick={toggle}
        >
          <span className="cp-fold-tri" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span className="cp-fold-label">{title}</span>
          <span className="cp-fold-meta">{meta} · {expanded ? '已展开' : '已折叠'}</span>
        </button>
      </HeadTag>
      <div className="cp-fold-panel" id={panelId}>
        <div className="cp-fold-clip" ref={clipRef}>{children}</div>
        <button className="cp-fold-more" type="button" onClick={toggle} aria-expanded={expanded ? 'true' : 'false'}>
          {expanded ? '收起板块 ↑' : '展开全部 ↓'}
        </button>
      </div>
    </Tag>
  );
}
