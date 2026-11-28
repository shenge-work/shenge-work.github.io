/* 密钥兜底回归：生产漏配密钥时必须 fail-closed，不能退回公开仓库里的 dev 串。
   本地/测试只有显式 ALLOW_DEV_SECRETS=1 才允许使用开发兜底值。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretValue } from '../functions/lib/secret.js';
import {
  certToken, issueProof, proofSecret, verifyProof,
} from '../functions/lib/guard.js';
import {
  assetSecret, signAssetToken, verifyAssetToken,
} from '../functions/lib/secure-access.js';
import { signApproval, verifyApproval } from '../functions/lib/verify-access-token.js';
import { signSession, verifySession } from '../functions/lib/admin-auth.js';

const REQ = () => new Request('https://chenpeisheng.cn/api/deliver', {
  headers: { 'CF-Connecting-IP': '203.0.113.7' },
});

test('dev 兜底必须显式开启，默认漏配返回空串', () => {
  assert.equal(secretValue({}, ['X_SECRET'], 'dev-value'), '');
  assert.equal(secretValue({ ALLOW_DEV_SECRETS: '1' }, ['X_SECRET'], 'dev-value'), 'dev-value');
  assert.equal(secretValue({ X_SECRET: '  real-secret  ' }, ['X_SECRET'], 'dev-value'), 'real-secret');
});

test('投递凭证：漏配密钥拒绝签发与校验，证书签名头也拒绝生成', async () => {
  assert.equal(proofSecret({}), '');
  assert.equal(await certToken({}, '/assets/resume/certificates/id-card.pdf'), '');
  await assert.rejects(() => issueProof({}, REQ(), 'deliver'), /签名密钥未配置/);
  const out = await verifyProof({}, REQ(), { token: 'deliver.1.tag.rand.sig' }, 'deliver');
  assert.deepEqual(out, { ok: false, error: 'server_misconfigured' });
});

test('私密材料签名链接：漏配密钥拒绝签发，已有链接一律不认', async () => {
  const o = { rid: 'a'.repeat(32), aid: 'cert-1', exp: Math.floor(Date.now() / 1000) + 60, dev: 'd', resource: 'school-verify' };
  assert.equal(assetSecret({}), '');
  await assert.rejects(() => signAssetToken(o, {}), /未配置/);
  assert.equal(await verifyAssetToken({ ...o, sig: '0'.repeat(64) }, {}), false);
});

test('审批链接：漏配密钥拒绝签发，带签名的链接也不放行', async () => {
  const id = 'b'.repeat(32);
  const exp = Math.floor(Date.now() / 1000) + 600;
  await assert.rejects(() => signApproval(id, {}), /未配置/);
  assert.equal(await verifyApproval(id, exp, 'c'.repeat(64), {}), false);
});

test('后台会话：RESEND_API_KEY 不再能派生会话密钥', async () => {
  const env = { RESEND_API_KEY: 're_test_key' };
  await assert.rejects(() => signSession(env, Math.floor(Date.now() / 1000) + 60), /未配置/);
  assert.equal(await verifySession(env, '1.fake'), false);
});
