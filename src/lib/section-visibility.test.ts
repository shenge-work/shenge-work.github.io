import { describe, expect, it } from 'vitest';
import {
  hasRows, worksVisible, contributionsVisible, peopleVisible, sectionRules,
} from './section-visibility';

describe('hasRows：空对象数组视为无数据', () => {
  it('数组为空 / 非数组 → false', () => {
    expect(hasRows([], 'title')).toBe(false);
    expect(hasRows(undefined, 'title')).toBe(false);
    expect(hasRows(null, 'title')).toBe(false);
    expect(hasRows({ length: 3 }, 'title')).toBe(false);
  });
  it('有记录但字段全空 / 只有占位对象 → false', () => {
    expect(hasRows([{}], 'title')).toBe(false);
    expect(hasRows([{ title: '' }, { title: '  ' }], 'title')).toBe(false);
    expect(hasRows([{ no: 'W-01' }], 'title')).toBe(false);
  });
  it('至少一条有实质字段 → true', () => {
    expect(hasRows([{}, { title: '作品' }], 'title')).toBe(true);
    expect(hasRows([{ title: '作品' }], 'title')).toBe(true);
  });
});

describe('worksVisible：个人作品板块', () => {
  it('无 works / 空数组 / 空对象数组 → false', () => {
    expect(worksVisible({})).toBe(false);
    expect(worksVisible({ works: [] })).toBe(false);
    expect(worksVisible({ works: [{}] })).toBe(false);
    expect(worksVisible(null)).toBe(false);
  });
  it('有 title 或 no 任一实质字段 → true', () => {
    expect(worksVisible({ works: [{ no: 'W-01' }] })).toBe(true);
    expect(worksVisible({ works: [{ title: '作品' }] })).toBe(true);
  });
});

describe('contributionsVisible：贡献热力图', () => {
  it('无提交记录（total=0）→ false，不留 github 地址', () => {
    expect(contributionsVisible({ total: 0, username: 'someone', days: [{ date: 'x' }] })).toBe(false);
  });
  it('无日期序列 → false', () => {
    expect(contributionsVisible({ total: 10, username: 'someone', days: [] })).toBe(false);
  });
  it('无 GitHub 账号（fork 常见）→ false，不回退到原作者地址', () => {
    expect(contributionsVisible({ total: 10, days: [{ date: 'x' }] })).toBe(false);
    expect(contributionsVisible({ total: 10, username: '  ', days: [{ date: 'x' }] })).toBe(false);
  });
  it('三项齐全 → true', () => {
    expect(contributionsVisible({ total: 259, username: 'shenge-work', days: [{ date: 'x', count: 1 }] })).toBe(true);
  });
});

describe('peopleVisible：页脚推荐人', () => {
  it('无名单 / 空数组 / 只有名字或只有站点 → false', () => {
    expect(peopleVisible({})).toBe(false);
    expect(peopleVisible({ people: [] })).toBe(false);
    expect(peopleVisible({ people: [{ name: '张三' }] })).toBe(false);
    expect(peopleVisible({ people: [{ site: 'https://x.com' }] })).toBe(false);
  });
  it('至少一条 name + site 齐全 → true', () => {
    expect(peopleVisible({ people: [{ name: '张三', site: 'https://x.com' }] })).toBe(true);
  });
});

describe('sectionRules：整页板块自适应', () => {
  it('全空数据 → 除 about / wall 外全部隐藏', () => {
    const rules = sectionRules({});
    expect(rules.about).toBe(true);
    expect(rules.wall).toBe(true);
    for (const id of ['experience', 'projects', 'works', 'skills', 'education', 'awards', 'objective', 'contact']) {
      expect(rules[id], id).toBe(false);
    }
  });
  it('空对象数组 → 板块同样隐藏', () => {
    const rules = sectionRules({
      works: [{}], projects: [{}], experience: [{}],
      skills: { rows: [{}] }, awards: { certs: [{}], list: [] },
      objective: { cards: [{}] }, contact: { cards: [{}] },
      education: { main: { school: '' } },
    });
    expect(rules.works).toBe(false);
    expect(rules.projects).toBe(false);
    expect(rules.experience).toBe(false);
    expect(rules.skills).toBe(false);
    expect(rules.awards).toBe(false);
    expect(rules.objective).toBe(false);
    expect(rules.contact).toBe(false);
    expect(rules.education).toBe(false);
  });
  it('真实结构（有数据）→ 全部展示', () => {
    const rules = sectionRules({
      works: [{ no: 'W-01', title: '作品' }],
      projects: [{ no: 'P-01', title: '项目' }],
      experience: [{ company: '某公司' }],
      skills: { rows: [{ name: 'Java' }] },
      education: { main: { school: '某大学' } },
      awards: { certs: [{ title: '证书' }] },
      objective: { cards: [{ desc: '目标' }] },
      contact: { cards: [{ value: 'hi@example.com' }] },
    });
    for (const id of ['works', 'projects', 'experience', 'skills', 'education', 'awards', 'objective', 'contact']) {
      expect(rules[id], id).toBe(true);
    }
  });
});
