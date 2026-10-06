'use strict';
// Site pod: serves the page and reports who it is (version, pod, node). The code is mounted from the site-code ConfigMap.
const http = require('http');
const fs = require('fs');

const VERSION = process.env.VERSION || '?';
const POD = process.env.POD_NAME || 'local';
const NODE = process.env.NODE_NAME || 'local';
const IP = process.env.POD_IP || '';
const CODE = process.env.CODE_DIR || '/code';

// the orders counter lives in the pod's memory — every pod has its own
let orders = 100 + Math.floor(Math.random() * 50);
setInterval(() => { if (Math.random() < 0.5) orders += 1 + Math.floor(Math.random() * 2); }, 1000);

const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/common.js': ['common.js', 'text/javascript; charset=utf-8'] };

http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  res.setHeader('x-version', VERSION);
  res.setHeader('x-pod', POD);
  res.setHeader('x-node', NODE);
  res.setHeader('x-pod-ip', IP);
  res.setHeader('cache-control', 'no-store');
  if (path === '/healthz') { res.end('ok'); return; }
  if (path === '/info') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version: VERSION, pod: POD, node: NODE, ip: IP, orders }));
    return;
  }
  const f = files[path];
  if (!f) { res.statusCode = 404; res.end('not found'); return; }
  try {
    res.setHeader('content-type', f[1]);
    res.end(fs.readFileSync(CODE + '/' + f[0]));
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(3000, () => console.log(`site ${VERSION} pod=${POD} node=${NODE} listening :3000`));

// fast shutdown — otherwise Recreate/Rolling would wait 30 s
process.on('SIGTERM', () => process.exit(0));
