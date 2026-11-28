/* /api/admin/leads —— 提问记录转线索
   ──────────────────────────────────────────────────────────────
   qa_logs 里每一条都只是「问了什么」；这个接口把它们按意图筛一遍，
   再把同一个 IP 哈希的意向问题并成一个人，变成能直接跟进的名单。

   读多少：默认近 30 天、最多 2000 条原始记录。量再大就该建表存线索了，
   但按现在的访问量（一天几十条问答），一次全表扫比多一张表省事。

   排序：priority 升序（招聘在前，合作次之，求职询问最后），同优先级按最近活跃。
   ────────────────────────────────────────────────────────────── */
import { json, requireAdmin, intParam } from '../../lib/admin-auth.js';
import { buildLeads, followUp } from '../../lib/leads.js';

export async function onRequestGet({ request, env }) {
  const deny = await requireAdmin(request, env);
  if (deny) return deny;

  const url = new URL(request.url);
  const days = intParam(url.searchParams.get('days'), 1, 90, 30);
  const limit = intParam(url.searchParams.get('limit'), 1, 200, 50);
  if (!env.DB) return json({ ok: false, error: 'no_db' }, 500);

  try {
    const rows = await env.DB.prepare(
      `SELECT ts, query, ip_hash
         FROM qa_logs
        WHERE ts >= ?
        ORDER BY ts DESC
        LIMIT 2000`
    ).bind(Date.now() - days * 86400000).all();

    const { leads, stats } = buildLeads(rows.results || []);

    return json({
      ok: true,
      days,
      stats,
      total_leads: leads.length,
      leads: leads.slice(0, limit).map((l) => ({
        ...l,
        when: new Date(l.lastTs).toISOString(),
        followUp: followUp(l),
      })),
    });
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, 500);
  }
}
