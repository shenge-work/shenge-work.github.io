/* ──────────────────────────────────────────────────────────────────────
   服务端密钥读取（统一防呆）
   ──────────────────────────────────────────────────────────────────────
   仓库里不能放生产密钥。过去几处签名逻辑在环境变量缺失时会退回写死的
   dev-only 字符串；那串值在公开仓库里，生产一旦漏配就等于签名可离线伪造。

   现在规则只有一条：
     · 生产环境没配密钥 → 返回空串，上层必须 fail-closed（拒绝/503）；
     · 本地开发或测试要跑通，必须显式设置 ALLOW_DEV_SECRETS=1，
       才允许使用调用方给出的开发兜底值。
   ────────────────────────────────────────────────────────────────────── */

export function devSecretsAllowed(env) {
  return String((env && env.ALLOW_DEV_SECRETS) || '') === '1';
}

export function secretValue(env, names, fallback) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = String((env && env[name]) || '').trim();
    if (value) return value;
  }
  return devSecretsAllowed(env) ? String(fallback || '') : '';
}
