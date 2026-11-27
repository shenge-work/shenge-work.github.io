/**
 * 板块可见性判定（fork 兼容）—— 构建期 Astro 与运行时 main.js 共用同一口径。
 *
 * 原则：没有真实数据就不摆空架子。数组非空还不够，必须至少有一条记录带
 * 实质字段（空对象数组视为无数据）；贡献图必须有提交数 + 日期序列 + 本人
 * GitHub 账号，缺一不可——没有账号时绝不回退到原作者地址。
 *
 * main.js 里有一份等价内联实现（IIFE 非模块，无法 import），改动请同步两处。
 */

type Dict = { [key: string]: unknown };

const asDict = (v: unknown): Dict | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const filled = (v: unknown): boolean => v != null && String(v).trim().length > 0;

/** 数组里至少有一条记录在 key 字段上有非空值 */
export function hasRows(list: unknown, key: string): boolean {
  return asArray(list).some((row) => {
    const d = asDict(row);
    return !!d && filled(d[key]);
  });
}

export function worksVisible(d: unknown): boolean {
  const x = asDict(d);
  if (!x) return false;
  return hasRows(x.works, 'title') || hasRows(x.works, 'no');
}

/** 贡献热力图：无提交 / 无日期 / 无 GitHub 账号 → 整块不展示（含地址） */
export function contributionsVisible(c: unknown): boolean {
  const x = asDict(c);
  if (!x) return false;
  return (
    Number(x.total) > 0 &&
    asArray(x.days).length > 0 &&
    filled(x.username)
  );
}

/** 推荐人：过滤后至少一条同时具备姓名与站点 */
export function peopleVisible(p: unknown): boolean {
  const x = asDict(p);
  if (!x) return false;
  return asArray(x.people).some((row) => {
    const d = asDict(row);
    return !!d && filled(d.name) && filled(d.site);
  });
}

/** 主页板块可见性规则（about / wall 为功能板块，恒定展示） */
export function sectionRules(d: unknown): Record<string, boolean> {
  const x = asDict(d) || {};
  const skills = asDict(x.skills) || {};
  const awards = asDict(x.awards) || {};
  const objective = asDict(x.objective) || {};
  const contact = asDict(x.contact) || {};
  const education = asDict(x.education);
  const eduMain = education ? asDict(education.main) : null;

  return {
    about: true,
    experience: hasRows(x.experience, 'company') || hasRows(x.experience, 'role'),
    projects: hasRows(x.projects, 'title') || hasRows(x.projects, 'no'),
    works: worksVisible(x),
    skills: hasRows(skills.rows, 'name') || hasRows(skills.bars, 'label'),
    education: !!(eduMain && filled(eduMain.school)),
    awards: hasRows(awards.certs, 'title') || hasRows(awards.list, 'name'),
    objective:
      hasRows(objective.cards, 'role') ||
      hasRows(objective.cards, 'roleSm') ||
      hasRows(objective.cards, 'desc'),
    contact: hasRows(contact.cards, 'value'),
    wall: true,
  };
}
