/**
 * Admin 控制台（React 版，docs/react-refactor-plan.md §6-M1）
 * 结构与旧 admin/public/index.html 逐块对应：
 *   head / stats 概览 / 8 tabs / 各面板 / footer / toast。
 * ?focus=<id> 邮件直达：跳到留言审核并自动展开回复面板（旧版同款行为）。
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../lib/api/admin';
import { useStats } from './queries';
import { ToastProvider, useToast } from './toast';
import { DevicesTab } from './tabs/DevicesTab';
import { MessagesTab } from './tabs/MessagesTab';
import { QaTab } from './tabs/QaTab';
import { LeadsTab } from './tabs/LeadsTab';
import { ConfigTab } from './tabs/ConfigTab';
import { VoiceTab } from './tabs/VoiceTab';
import { ContentTab } from './tabs/ContentTab';
import { VariantTab } from './tabs/VariantTab';
import { AnimTab } from './tabs/AnimTab';

type TabKey = 'devices' | 'messages' | 'qa' | 'leads' | 'config' | 'voice' | 'content' | 'variant' | 'anim';

const TABS: Array<[TabKey, string]> = [
  ['devices', '设备台账'], ['messages', '留言审核'], ['qa', '问答看板'], ['leads', '线索'],
  ['config', '模型与提示词'], ['voice', 'AI 语音'], ['content', '站点数据'],
  ['variant', '生成变体'], ['anim', '角色动画'],
];

export function AdminApp() {
  return (
    <ToastProvider>
      <Dash />
    </ToastProvider>
  );
}

function Dash() {
  const toast = useToast();
  const qc = useQueryClient();
  const stats = useStats();
  const focusParam = new URLSearchParams(location.search).get('focus') || '';
  const [tab, setTab] = useState<TabKey>(focusParam ? 'messages' : 'devices');
  const [msgDevice, setMsgDevice] = useState('');
  const [msgFocus, setMsgFocus] = useState(focusParam);

  const s = stats.data?.stats;

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['admin'] });
    toast('已刷新');
  }

  function logout() {
    adminApi('/api/admin/auth/logout', { method: 'POST' })
      .then(() => { location.replace('/login?logout=1'); })
      .catch(() => { location.replace('/login'); });
  }

  return (
    <main className="dash" id="dash">
      <header className="dash-head">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <p className="brand-name">SHENGE // CONSOLE</p>
            <p className="brand-sub">作品集后台 · 同一个 D1</p>
          </div>
        </div>
        <div className="head-actions">
          <a className="btn btn-ghost" href="https://chenpeisheng.cn" target="_blank" rel="noopener">公开站 ↗</a>
          <button className="btn btn-ghost" type="button" onClick={refreshAll}>刷新</button>
          <button className="btn btn-ghost" type="button" onClick={logout}>退出</button>
        </div>
      </header>

      <section className="stats" id="stats">
        <article className="stat"><p className="stat-num">{s?.pv ?? '—'}</p><p className="stat-label">总浏览量</p></article>
        <article className="stat"><p className="stat-num">{s?.uv ?? '—'}</p><p className="stat-label">独立访客</p></article>
        <article className="stat"><p className="stat-num">{s?.uv24 ?? '—'}</p><p className="stat-label">24h 访客</p></article>
        <article className="stat"><p className="stat-num">{s?.devices ?? '—'}</p><p className="stat-label">留言设备</p></article>
        <article className="stat"><p className="stat-num">{s?.messages ?? '—'}</p><p className="stat-label">留言总数</p></article>
        <article className="stat"><p className="stat-num">{s?.today ?? '—'}</p><p className="stat-label">今日新增</p></article>
        <article className="stat"><p className="stat-num">{s?.hidden ?? '—'}</p><p className="stat-label">已隐藏</p></article>
        <article className="stat"><p className="stat-num">{s?.pending_replies ?? '—'}</p><p className="stat-label">待回复留言</p></article>
        <article className="stat"><p className="stat-num">{s?.blocked_devices ?? '—'}</p><p className="stat-label">已拉黑设备</p></article>
      </section>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} className={'tab' + (tab === key ? ' is-on' : '')} type="button" role="tab"
            aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'devices' && <DevicesTab onViewMessages={(hash) => { setMsgDevice(hash); setMsgFocus(''); setTab('messages'); }} />}
      {tab === 'messages' && <MessagesTab device={msgDevice} focus={msgFocus} onExitFocus={() => { setMsgDevice(''); setMsgFocus(''); }} />}
      {tab === 'qa' && <QaTab />}
      {tab === 'leads' && <LeadsTab />}
      {tab === 'config' && <ConfigTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'content' && <ContentTab />}
      {tab === 'variant' && <VariantTab />}
      {/* 角色动画台常驻 DOM（hidden 切换）：避免 React 条件卸载打断 model-viewer */}
      <AnimTab active={tab === 'anim'} />

      <footer className="dash-foot">
        <p>留言按设备隔离：访客看不到别人的留言，这里能看到全部。设备哈希不可逆，无法还原成原始设备 ID。点「回复」可直接在留言下对话，访客回到同一设备刷新即可看到；访客追问会邮件提醒，邮件里的「打开后台直接回复」会自动定位到那一条。</p>
      </footer>
    </main>
  );
}
