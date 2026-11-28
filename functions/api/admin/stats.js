/* GET /api/stats —— 概览卡片（访问量 / 设备 / 留言 / 今日新增） */
import { json, requireAdmin } from '../../lib/admin-auth.js';

export async function onRequestGet({ request, env }) {
  const deny = await requireAdmin(request, env);
  if (deny) return deny;
  try {
    const now = Date.now();
    const day = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000; // 北京时间当天 0 点
    const row = await env.DB.prepare(
      `SELECT
        (SELECT value FROM counters WHERE name = 'total')      AS pv,
        (SELECT value FROM counters WHERE name = 'visitors')   AS uv,
        (SELECT COUNT(*) FROM visitors WHERE last_seen >= ?)   AS uv24,
        (SELECT COUNT(*) FROM wall_devices)                    AS devices,
        (SELECT COUNT(*) FROM wall_devices WHERE status='blocked') AS blocked_devices,
        (SELECT COUNT(*) FROM wall_messages)                   AS messages,
        (SELECT COUNT(*) FROM wall_messages WHERE status='hidden')  AS hidden,
        (SELECT COUNT(*) FROM wall_messages WHERE created_at >= ?) AS today,
        (SELECT COUNT(*) FROM wall_messages WHERE created_at >= ?) AS week`
    ).bind(now - 86400000, day, now - 7 * 86400000).first();

    /* 历史脏数据兜底：早期计数曾留下 visitors = total + 1，
       后台概览不能跟着显示「访客 > 浏览」。写路径会在下次计数时真正修正。 */
    const stats = Object.assign({}, row || {});
    if (Number(stats.pv) > 0 && Number(stats.uv) > Number(stats.pv)) {
      stats.uv = Number(stats.pv);
    }

    /* 回复相关统计单独查：wall_replies 未迁移时不影响概览其它卡片 */
    let extra = { pending_replies: 0, replies: 0 };
    try {
      const er = await env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM wall_messages m
            WHERE m.status = 'visible' AND NOT EXISTS (
              SELECT 1 FROM wall_replies r
               WHERE r.message_id = m.id AND r.author = 'owner' AND r.status = 'visible'
            )) AS pending_replies,
          (SELECT COUNT(*) FROM wall_replies) AS replies`
      ).first();
      if (er) extra = er;
    } catch (e) { /* 表未迁移：保持 0 */ }

    return json({ ok: true, stats: Object.assign(stats, extra), dayStart: day });
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, 500);
  }
}
