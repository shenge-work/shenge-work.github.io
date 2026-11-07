'use strict';

/**
 * HTTP 服务入口（CloudBase「HTTP 云函数」类型：容器内常驻进程，监听 9000）
 * 把 HTTP 请求翻译成经典云函数的 event 结构，复用 index.js 的全部业务逻辑，
 * 这样本地 node index.js / 云端 HTTP 函数 / 经典事件函数三种跑法同一套代码。
 */

var http = require('http');
var handler = require('./index.js');

var PORT = Number(process.env.PORT || 9000);

var server = http.createServer(function (req, res) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var raw = Buffer.concat(chunks).toString('utf8');
    var headers = req.headers || {};
    var event = {
      httpMethod: (req.method || 'POST').toUpperCase(),
      path: req.url,
      headers: headers,
      body: raw,
      isBase64Encoded: false,
      clientIP: (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                (req.socket && req.socket.remoteAddress) || 'unknown'
    };
    handler.main(event, {}).then(function (out) {
      res.statusCode = out.statusCode || 200;
      var h = out.headers || {};
      Object.keys(h).forEach(function (k) { res.setHeader(k, h[k]); });
      res.end(out.body || '');
    }).catch(function (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'internal_error', message: String(e && e.message || e) }));
    });
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('[resume-ai-chat] listening on ' + PORT);
});

// 容器健康检查
server.on('error', function (e) { console.error('[resume-ai-chat] server error: ' + e.message); });
