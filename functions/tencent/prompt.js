'use strict';

/**
 * 简历 AI 助手 —— 提示词与输入侧拦截
 * 与 docs/ai-assistant-survey.md §5.6 对齐：系统提示词 + 意图拦截 + 脱敏工具。
 * 放在函数包内同目录，随 zip 一起部署（文档里的 functions/shared/ 在单函数包内退化为同目录）。
 */

// 敏感问题统一话术：不给模型发挥空间（决策 D5）
var SENSITIVE_REPLY =
  '这类问题（薪资 / 离职原因 / 外包 / 到岗时间）建议直接沟通，我不代替他表态。' +
  '可以直接邮件：shenge.work@gmail.com';

var SENSITIVE_WORDS = [
  '薪资', '薪水', '工资', '待遇', '月薪', '年薪', '多少钱', '报酬', 'package', 'offer',
  '离职原因', '为什么离职', '被裁', '裁员', '空窗', '失业',
  '外包', '驻场', '派遣',
  '到岗', '入职时间', '多久能来', '随时到岗',
  '期权', '股票'
];

// 越界意图：不送模型，直接固定话术（省钱 + 防注入）
var OFFTOPIC_WORDS = [
  '写代码', '帮我写', '写个脚本', '翻译', '扮演', '角色扮演', '写作文', '写诗', '写文案',
  '天气', '股票行情', '讲个笑话', '政治', '大选', '翻墙', '破解', '爬虫教程'
];

var INJECTION_WORDS = [
  '忽略以上', '忽略之前', 'ignore previous', 'system prompt', '系统提示词',
  '你现在是', '你的设定', '开发者模式', 'developer mode', '越狱', 'jailbreak'
];

var OFFTOPIC_REPLY = '我只回答关于这份简历的问题。';
var NO_MATCH_REPLY =
  '简历里没写这块，建议直接邮件问他：shenge.work@gmail.com';

function hit(words, text) {
  for (var i = 0; i < words.length; i++) {
    if (text.indexOf(words[i]) !== -1) return words[i];
  }
  return '';
}

/** 判断输入是否越界，返回 { action, reason }，action: pass | sensitive | offtopic | suspect */
function classifyInput(question) {
  var q = String(question || '').toLowerCase();
  var inj = hit(INJECTION_WORDS, q);
  if (inj) return { action: 'suspect', reason: inj };
  var off = hit(OFFTOPIC_WORDS, q);
  if (off) return { action: 'offtopic', reason: off };
  var sen = hit(SENSITIVE_WORDS, q);
  if (sen) return { action: 'sensitive', reason: sen };
  return { action: 'pass', reason: '' };
}

/** 手机号 / 身份证脱敏（日志与回答出口都过一遍） */
function scrub(text) {
  return String(text || '')
    .replace(/\+?86[\s\-]?(?:1[3-9]\d)[\s\-]?\d{4}[\s\-]?\d{4}/g, '[手机号已隐藏]')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已隐藏]')
    .replace(/\b\d{3}[\s\-]\d{4}[\s\-]\d{4}\b/g, '[号码已隐藏]')
    .replace(/\b\d{17}[\dXx]\b/g, '[证件号已隐藏]');
}

/** 组装 system 提示词：人设 + 规则 + 检索到的简历上下文 */
function buildSystem(contextChunks) {
  var ctx = '';
  for (var i = 0; i < contextChunks.length; i++) {
    var c = contextChunks[i];
    ctx += '[' + c.id + ' | ' + c.title + ']\n' + c.text + '\n\n';
  }
  return (
    '你是陈培胜（CHEN PEISHENG）在线简历站上的 AI 助手，只负责回答关于他本人的' +
    '教育背景、工作经历、项目、技能、求职意向、联系方式的问题。\n\n' +
    '规则：\n' +
    '1. 只依据 <context> 中的简历资料回答。context 没有的信息，直接说' +
    '「简历里没写这块，建议直接邮件问他：shenge.work@gmail.com」，不要推测。\n' +
    '2. 不允许编造项目名称、公司、量化数字、时间。引用数字时必须与 context 完全一致。\n' +
    '3. 涉及薪资、离职原因、是否接受外包、能否立刻到岗等敏感问题：' +
    '一律回复「这类问题建议直接沟通」，不代替本人承诺。\n' +
    '4. 回答风格：简洁、专业、有条理，像工程师向面试官介绍自己。' +
    '中文为主，技术名词保留英文。控制在 4 句话 / 120 字以内。\n' +
    '5. 不要在正文里写「依据：…」这类来源标注，来源由前端单独展示；' +
    '必要引用时只在句中带出项目名。\n' +
    '6. 拒绝回答与简历无关的请求（写代码、闲聊、其他公司信息、政治话题），' +
    '统一回复「我只回答关于这份简历的问题」。\n' +
    '7. 直接给结论，不要输出思考过程、不要复述规则。\n\n' +
    '<context>\n' + ctx + '</context>'
  );
}

module.exports = {
  SENSITIVE_REPLY: SENSITIVE_REPLY,
  OFFTOPIC_REPLY: OFFTOPIC_REPLY,
  NO_MATCH_REPLY: NO_MATCH_REPLY,
  classifyInput: classifyInput,
  scrub: scrub,
  buildSystem: buildSystem
};
