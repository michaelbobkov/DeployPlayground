'use strict';
/**
  * Deploy Playground platform (runs inside the cluster).
 *
  * Model: one instance (a browser window) = one pod. Every instance has its own Deployment
  * `inst-<id>` with a single pod and its own Service `inst-<id>`. The strategy decides which version the
  * instance pod gets and how it is replaced (RollingUpdate, Recreate, blue/green with two pods…).
  * Close the tab — the Deployment is deleted and the pod disappears.
 *
  *  - controller: creates, updates and deletes Deployments/Services through the Kubernetes API;
  *  - gateway: /i/<instanceId>/… proxies to the instance Service (and mirrors for Shadow);
  *  - API for the shell: /api/state, /api/apply, /api/instances, /api/site …
  * No external dependencies: only built-in Node modules.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');

const NS = process.env.NAMESPACE || 'deploy-playground';
const SA = '/var/run/secrets/kubernetes.io/serviceaccount';
const API_HOST = process.env.KUBERNETES_SERVICE_HOST;
const API_PORT = +(process.env.KUBERNETES_SERVICE_PORT || 443);
const CA = fs.readFileSync(SA + '/ca.crt');
const IMAGE = process.env.SITE_IMAGE || 'node:22-alpine';
const MANAGED = 'managed-by=deploy-playground';

// ───────────────────────── Kubernetes API ─────────────────────────
function k8s(method, path, body, type) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = https.request({
      host: API_HOST, port: API_PORT, method, path, ca: CA,
      headers: {
        authorization: 'Bearer ' + fs.readFileSync(SA + '/token', 'utf8'),
        accept: 'application/json',
        ...(data ? { 'content-type': type || 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (e) { /* not JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('k8s api timeout')));
    if (data) req.write(data);
    req.end();
  });
}
const nsPath = (p) => `/api/v1/namespaces/${NS}/${p}`;
const appsPath = (p) => `/apis/apps/v1/namespaces/${NS}/${p}`;
const JSONPATCH = 'application/json-patch+json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── Texts (ru / en / de) ─────────────────────────
// The platform stores messages as { k, p } and turns them into a string in the request language (cookie dp-lang).
const MSGS = {
  ru: {
    'r.none': 'нет запущенной стратегии', 'r.start': 'старт', 'r.restored': '{strategy}: восстановлено после перезапуска платформы',
    'r.revert': 'возвращаем экземпляры на {base}', 'r.waitRevert': 'ждём возврата на {base}', 'r.step': '{label}: {text}',
    'r.ready': 'готово {n}/{total}', 'r.left': 'осталось подов {n}', 'r.starting': 'запускается',
    'r.recreateStop': 'Recreate: останавливаем поды', 'r.recreatePause': 'Recreate: пауза, 503 ещё {s} с', 'r.recreateWait': 'Recreate: ждём новые поды',
    'r.rollingProgress': 'Rolling: {a}/{b}', 'r.moving': '{strategy}: переводим экземпляры', 'r.shadowWait': 'ждём теневой под',
    'r.bgGreen': 'Blue/Green: поднимаем green', 'r.done': '{strategy}: готово', 'r.rollingBack': 'откат на старую версию', 'r.rolledBack': 'откат выполнен',
    'x.timeout': 'таймаут: {label} ({text})', 'x.needStrategy': 'нужны strategy и две разные версии',
    'x.switchOnly': 'Switch работает для Blue/Green после «Запустить»', 'x.noStrategy': 'нет запущенной стратегии', 'x.noBase': 'не указана старая версия',
    'e.apply': 'Запуск {strategy}: {base} → {target}, экземпляров {n}', 'e.recreateNoPods': 'Recreate: подов нет — все экземпляры недоступны (503)',
    'e.rollingStep': 'Rolling: обновлено {a}/{b} экземпляров', 'e.done': '{strategy}: раскатка завершена', 'e.switch': 'Switch: активен {color}',
    'e.rollback': 'Откат: все экземпляры на {base}', 'e.closed': 'Экземпляр {id} закрыт — под удалён', 'e.failover': 'Под {old} заменён на {new}',
    'e.betaHeader': 'Запрос с заголовком X-Beta: {b} — флаг экземпляра обновлён',
    'i.new': 'Новый экземпляр: запущена старая версия {v}', 'i.restored': 'экземпляр восстановлен после перезапуска платформы',
    'i.recreate': 'Recreate: под остановлен и создан заново → {v}', 'i.rolling': 'Rolling: Deployment inst-{id} обновлён (RollingUpdate), под заменён → {v}',
    'i.canary': 'Canary: hash("{who}") = {b} {op} {w}% → {v}', 'i.abOdd': 'A/B: ID {who} нечётный → X-Beta: true → {v}', 'i.abEven': 'A/B: ID {who} чётный → X-Beta: false → {v}',
    'i.shadowOn': 'Shadow: отвечает {base}, копия запросов → теневой под {target} (ответ отброшен)', 'i.shadowOff': 'Shadow выключен: только {base}',
    'i.bg': 'Blue/Green: активен blue ({base}), green ({target}) готов к Switch', 'i.bgSwitch': 'Blue/Green: Service {svc} → color={color} ({v})',
    'i.rollback': 'Откат: под экземпляра на старой версии {v}',
    'g.notFound': 'Экземпляр не найден (закрыт или удалён) — создайте новый в оболочке', 'g.noPod': 'Нет готового пода за Service {svc} ({err})', 'g.refresh': 'страница обновится сама',
  },
  en: {
    'r.none': 'no strategy running', 'r.start': 'starting', 'r.restored': '{strategy}: restored after platform restart',
    'r.revert': 'returning instances to {base}', 'r.waitRevert': 'waiting for return to {base}', 'r.step': '{label}: {text}',
    'r.ready': 'ready {n}/{total}', 'r.left': '{n} pods left', 'r.starting': 'starting',
    'r.recreateStop': 'Recreate: stopping pods', 'r.recreatePause': 'Recreate: pause, 503 for {s} s more', 'r.recreateWait': 'Recreate: waiting for new pods',
    'r.rollingProgress': 'Rolling: {a}/{b}', 'r.moving': '{strategy}: moving instances', 'r.shadowWait': 'waiting for the shadow pod',
    'r.bgGreen': 'Blue/Green: starting green', 'r.done': '{strategy}: done', 'r.rollingBack': 'rolling back to the old version', 'r.rolledBack': 'rollback complete',
    'x.timeout': 'timeout: {label} ({text})', 'x.needStrategy': 'strategy and two different versions are required',
    'x.switchOnly': 'Switch works for Blue/Green after “Run”', 'x.noStrategy': 'no strategy running', 'x.noBase': 'old version not specified',
    'e.apply': 'Run {strategy}: {base} → {target}, instances: {n}', 'e.recreateNoPods': 'Recreate: no pods — all instances unavailable (503)',
    'e.rollingStep': 'Rolling: updated {a}/{b} instances', 'e.done': '{strategy}: rollout finished', 'e.switch': 'Switch: {color} is active',
    'e.rollback': 'Rollback: all instances on {base}', 'e.closed': 'Instance {id} closed — pod deleted', 'e.failover': 'Pod {old} replaced by {new}',
    'e.betaHeader': 'Request with header X-Beta: {b} — instance flag updated',
    'i.new': 'New instance: started on old version {v}', 'i.restored': 'instance restored after platform restart',
    'i.recreate': 'Recreate: pod stopped and recreated → {v}', 'i.rolling': 'Rolling: Deployment inst-{id} updated (RollingUpdate), pod replaced → {v}',
    'i.canary': 'Canary: hash("{who}") = {b} {op} {w}% → {v}', 'i.abOdd': 'A/B: ID {who} is odd → X-Beta: true → {v}', 'i.abEven': 'A/B: ID {who} is even → X-Beta: false → {v}',
    'i.shadowOn': 'Shadow: {base} answers, request copy → shadow pod {target} (response discarded)', 'i.shadowOff': 'Shadow is off: only {base}',
    'i.bg': 'Blue/Green: blue is active ({base}), green ({target}) is ready for Switch', 'i.bgSwitch': 'Blue/Green: Service {svc} → color={color} ({v})',
    'i.rollback': 'Rollback: instance pod is on the old version {v}',
    'g.notFound': 'Instance not found (closed or deleted) — create a new one in the shell', 'g.noPod': 'No ready pod behind Service {svc} ({err})', 'g.refresh': 'the page refreshes by itself',
  },
  de: {
    'r.none': 'keine Strategie aktiv', 'r.start': 'Start', 'r.restored': '{strategy}: nach Neustart der Plattform wiederhergestellt',
    'r.revert': 'Instanzen werden auf {base} zurückgesetzt', 'r.waitRevert': 'warte auf Rückkehr zu {base}', 'r.step': '{label}: {text}',
    'r.ready': 'bereit {n}/{total}', 'r.left': 'noch {n} Pods', 'r.starting': 'startet',
    'r.recreateStop': 'Recreate: Pods werden gestoppt', 'r.recreatePause': 'Recreate: Pause, noch {s} s 503', 'r.recreateWait': 'Recreate: warte auf neue Pods',
    'r.rollingProgress': 'Rolling: {a}/{b}', 'r.moving': '{strategy}: Instanzen werden umgestellt', 'r.shadowWait': 'warte auf den Shadow-Pod',
    'r.bgGreen': 'Blue/Green: green wird gestartet', 'r.done': '{strategy}: fertig', 'r.rollingBack': 'Rollback auf die alte Version', 'r.rolledBack': 'Rollback abgeschlossen',
    'x.timeout': 'Zeitüberschreitung: {label} ({text})', 'x.needStrategy': 'Strategie und zwei verschiedene Versionen erforderlich',
    'x.switchOnly': 'Switch funktioniert bei Blue/Green nach „Starten“', 'x.noStrategy': 'keine Strategie aktiv', 'x.noBase': 'alte Version nicht angegeben',
    'e.apply': 'Start {strategy}: {base} → {target}, Instanzen: {n}', 'e.recreateNoPods': 'Recreate: keine Pods — alle Instanzen nicht erreichbar (503)',
    'e.rollingStep': 'Rolling: {a}/{b} Instanzen aktualisiert', 'e.done': '{strategy}: Rollout abgeschlossen', 'e.switch': 'Switch: {color} ist aktiv',
    'e.rollback': 'Rollback: alle Instanzen auf {base}', 'e.closed': 'Instanz {id} geschlossen — Pod gelöscht', 'e.failover': 'Pod {old} durch {new} ersetzt',
    'e.betaHeader': 'Anfrage mit Header X-Beta: {b} — Flag der Instanz aktualisiert',
    'i.new': 'Neue Instanz: mit alter Version {v} gestartet', 'i.restored': 'Instanz nach Neustart der Plattform wiederhergestellt',
    'i.recreate': 'Recreate: Pod gestoppt und neu erstellt → {v}', 'i.rolling': 'Rolling: Deployment inst-{id} aktualisiert (RollingUpdate), Pod ersetzt → {v}',
    'i.canary': 'Canary: hash("{who}") = {b} {op} {w} % → {v}', 'i.abOdd': 'A/B: ID {who} ist ungerade → X-Beta: true → {v}', 'i.abEven': 'A/B: ID {who} ist gerade → X-Beta: false → {v}',
    'i.shadowOn': 'Shadow: {base} antwortet, Kopie der Anfrage → Shadow-Pod {target} (Antwort verworfen)', 'i.shadowOff': 'Shadow aus: nur {base}',
    'i.bg': 'Blue/Green: blue ist aktiv ({base}), green ({target}) bereit für Switch', 'i.bgSwitch': 'Blue/Green: Service {svc} → color={color} ({v})',
    'i.rollback': 'Rollback: Pod der Instanz auf alter Version {v}',
    'g.notFound': 'Instanz nicht gefunden (geschlossen oder gelöscht) — erstellen Sie in der Oberfläche eine neue', 'g.noPod': 'Kein bereiter Pod hinter Service {svc} ({err})', 'g.refresh': 'die Seite aktualisiert sich selbst',
  },
};
const M = (k, p) => ({ k, p });
const LANGS = ['ru', 'en', 'de'];

/** Message → string; the parameters may themselves be messages (nested texts). */
function render(m, lang) {
  if (m === undefined || m === null) return '';
  if (typeof m === 'string') return m;
  const dict = MSGS[lang] || MSGS.en;
  const tpl = dict[m.k] || MSGS.en[m.k] || m.k;
  return tpl.replace(/\{(\w+)\}/g, (_, n) => {
    const v = m.p && m.p[n];
    if (v === undefined) return `{${n}}`;
    return v !== null && typeof v === 'object' ? render(v, lang) : String(v);
  });
}

/** Request language: the dp-lang cookie (set by the shell), English by default. */
function langOf(req) {
  const c = /(?:^|;\s*)dp-lang=(\w+)/.exec(req.headers.cookie || '');
  if (c && LANGS.includes(c[1])) return c[1];
  return 'en';
}

class Fail extends Error {
  constructor(m) { super(m.k); this.m = m; }
}
const fail = (k, p) => new Fail(M(k, p));
const errMsg = (e) => (e && e.m) || M('r.err', { text: String((e && e.message) || e) });
MSGS.ru['r.err'] = '{text}'; MSGS.en['r.err'] = '{text}'; MSGS.de['r.err'] = '{text}';

// ───────────────────────── Cluster objects ─────────────────────────
const depName = (id, color) => (color === 'green' ? `inst-${id}-g` : `inst-${id}`);
const svcName = (id) => `inst-${id}`;

/** A single-pod Deployment. The selector has no version, so the version can be changed in place. */
function buildDeployment({ name, labels, annotations, selector, version, replicas, type }) {
  return {
    apiVersion: 'apps/v1', kind: 'Deployment',
    metadata: { name, labels: { ...labels, version, 'managed-by': 'deploy-playground' }, annotations },
    spec: {
      replicas,
      strategy: type === 'Recreate' ? { type: 'Recreate' } : { type: 'RollingUpdate', rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } },
      selector: { matchLabels: selector },
      template: {
        metadata: { labels: { ...labels, version } },
        spec: {
          terminationGracePeriodSeconds: 2,
          // pods spread across different nodes
          topologySpreadConstraints: [{
            maxSkew: 1, topologyKey: 'kubernetes.io/hostname', whenUnsatisfiable: 'ScheduleAnyway',
            labelSelector: { matchLabels: { app: 'site' } },
          }],
          containers: [{
            name: 'site', image: IMAGE, imagePullPolicy: 'IfNotPresent',
            command: ['node', '/code/server.js'],
            ports: [{ containerPort: 3000 }],
            env: [
              { name: 'VERSION', value: version },
              { name: 'POD_NAME', valueFrom: { fieldRef: { fieldPath: 'metadata.name' } } },
              { name: 'NODE_NAME', valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } } },
              { name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } },
            ],
            readinessProbe: { httpGet: { path: '/healthz', port: 3000 }, periodSeconds: 1, failureThreshold: 2 },
            resources: { requests: { cpu: '5m', memory: '24Mi' }, limits: { memory: '96Mi' } },
            volumeMounts: [{ name: 'code', mountPath: '/code', readOnly: true }],
          }],
          volumes: [{ name: 'code', configMap: { name: 'site-code' } }],
        },
      },
    },
  };
}

async function putDeployment(m) {
  const name = m.metadata.name;
  const r = await k8s('GET', appsPath(`deployments/${name}`));
  if (r.status === 404) {
    const c = await k8s('POST', appsPath('deployments'), m);
    if (c.status >= 300) throw new Error(`create ${name}: ${c.status} ${JSON.stringify(c.json && c.json.message)}`);
  } else {
    m.metadata.resourceVersion = r.json.metadata.resourceVersion;
    const u = await k8s('PUT', appsPath(`deployments/${name}`), m);
    if (u.status >= 300) throw new Error(`update ${name}: ${u.status} ${JSON.stringify(u.json && u.json.message)}`);
  }
}

/** Instance pod: a single-pod Deployment with the chosen version. */
function instDeployment(inst, color, version, replicas, type) {
  const labels = { app: 'site', inst: inst.id, color, role: 'instance' };
  return buildDeployment({
    name: depName(inst.id, color), labels,
    annotations: { 'dp/user': encodeURIComponent(inst.userId), 'dp/beta': String(inst.xBeta) },
    selector: { app: 'site', inst: inst.id, color }, version, replicas, type,
  });
}
const putInst = (inst, color, version, replicas, type) => putDeployment(instDeployment(inst, color, version, replicas, type));

async function ensureService(name, selector, labels) {
  const r = await k8s('GET', nsPath(`services/${name}`));
  if (r.status === 404) {
    const c = await k8s('POST', nsPath('services'), {
      apiVersion: 'v1', kind: 'Service',
      metadata: { name, labels: { 'managed-by': 'deploy-playground', ...labels } },
      spec: { selector, ports: [{ port: 80, targetPort: 3000 }] },
    });
    if (c.status >= 300) throw new Error(`create service ${name}: ${c.status}`);
  } else if (JSON.stringify(r.json.spec.selector) !== JSON.stringify(selector)) {
    await k8s('PATCH', nsPath(`services/${name}`), [{ op: 'replace', path: '/spec/selector', value: selector }], JSONPATCH);
  }
}
const setLive = (inst, color) => ensureService(svcName(inst.id), { app: 'site', inst: inst.id, color }, { role: 'instance' });

const delDep = (name) => k8s('DELETE', appsPath(`deployments/${name}?propagationPolicy=Background`));
async function listDeployments(selector) {
  const r = await k8s('GET', appsPath(`deployments?labelSelector=${encodeURIComponent(selector)}`));
  return (r.json && r.json.items) || [];
}

async function listPods() {
  const r = await k8s('GET', nsPath('pods?labelSelector=app%3Dsite'));
  return ((r.json && r.json.items) || []).map((p) => {
    const terminating = !!p.metadata.deletionTimestamp;
    const ready = (p.status.conditions || []).some((c) => c.type === 'Ready' && c.status === 'True');
    const l = p.metadata.labels || {};
    return {
      name: p.metadata.name, version: l.version, inst: l.inst || null, color: l.color || null, role: l.role || 'shadow',
      node: p.spec.nodeName || null,
      phase: terminating ? 'Terminating' : p.status.phase, ready: ready && !terminating,
      ip: p.status.podIP || null, startedAt: p.metadata.creationTimestamp,
    };
  });
}

async function listNodes() {
  const r = await k8s('GET', '/api/v1/nodes');
  return ((r.json && r.json.items) || []).map((n) => ({
    name: n.metadata.name,
    role: 'node-role.kubernetes.io/control-plane' in n.metadata.labels ? 'control-plane' : 'worker',
    ready: (n.status.conditions || []).some((c) => c.type === 'Ready' && c.status === 'True'),
  }));
}

// ───────────────────────── State ─────────────────────────
let applied = null; // the applied strategy
let epoch = 0; // grows when decisions change: open windows reload on it
let rollout = { phase: 'idle', message: M('r.none') };
let runId = 0;
const instances = new Map(); // id → { id, userId, xBeta, createdAt, version, reason, lastPod, byeAt }
let nextInstance = 1;
const events = [];
const metrics = [];
let eventId = 1;
let cache = { pods: [], nodes: [], ok: false, error: '' };

function ev(e) {
  events.unshift({ id: eventId++, t: Date.now(), ...e });
  if (events.length > 300) events.pop();
}
const setRollout = (phase, message) => { rollout = { phase, message, t: Date.now() }; };
const liveColor = () => (applied && applied.strategy === 'bluegreen' && applied.liveColor === 'green' ? 'green' : 'blue');

async function refresh() {
  try {
    const [pods, nodes] = await Promise.all([listPods(), listNodes()]);
    cache = { pods, nodes, ok: true, error: '' };
  } catch (e) {
    cache = { ...cache, ok: false, error: String(e.message || e) };
  }
}
setInterval(refresh, 1000);
refresh();

async function waitFor(run, label, fn, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    if (run !== runId) throw new Error('cancelled');
    const state = fn(await listPods());
    if (state.done) return;
    setRollout('running', M('r.step', { label, text: state.text }));
    if (Date.now() - t0 > timeoutMs) throw fail('x.timeout', { label, text: state.text });
    await sleep(600);
  }
}

// "instance is ready": exactly one live pod of the right version and color, and it is Ready
function settled(pods, id, color, version) {
  const live = pods.filter((p) => p.inst === id && p.color === color && p.phase !== 'Terminating');
  return live.length === 1 && live[0].ready && live[0].version === version;
}
const waitSettled = (run, label, list, color, versionOf) => waitFor(run, label, (pods) => {
  const n = list.filter((i) => settled(pods, i.id, color, versionOf(i))).length;
  return { done: n === list.length, text: M('r.ready', { n, total: list.length }) };
}, 180000);

async function saveApplied() {
  const cm = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'platform-state' }, data: { 'applied.json': JSON.stringify(applied) } };
  try {
    const r = await k8s('PUT', nsPath('configmaps/platform-state'), cm);
    if (r.status === 404) await k8s('POST', nsPath('configmaps'), cm);
  } catch (e) { /* not critical */ }
}
async function loadApplied() {
  try {
    const r = await k8s('GET', nsPath('configmaps/platform-state'));
    if (r.status === 200 && r.json.data && r.json.data['applied.json']) {
      applied = JSON.parse(r.json.data['applied.json']);
      if (applied) setRollout('done', M('r.restored', { strategy: applied.strategy }));
    }
  } catch (e) { /* empty */ }
}
function activate(p) {
  applied = { liveColor: 'blue', ...p };
  epoch += 1;
  saveApplied();
}

// instances survive a platform restart: their description lives in Deployment annotations
async function loadInstances() {
  try {
    for (const d of await listDeployments(`${MANAGED},role=instance,color=blue`)) {
      const id = d.metadata.labels.inst;
      const a = d.metadata.annotations || {};
      instances.set(id, {
        id, userId: decodeURIComponent(a['dp/user'] || ''), xBeta: isBeta(decodeURIComponent(a['dp/user'] || '')), createdAt: Date.parse(d.metadata.creationTimestamp),
        version: d.metadata.labels.version, reason: M('i.restored'), lastPod: null, byeAt: 0,
      });
      nextInstance = Math.max(nextInstance, (parseInt(id.slice(1), 10) || 0) + 1);
    }
  } catch (e) { /* empty */ }
}
loadApplied();
loadInstances();

// ───────────────────────── Strategy decisions ─────────────────────────
function hashBucket(userId) {
  let h = 0x811c9dc5;
  for (const ch of (String(userId).trim().toLowerCase() || 'anonymous')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}
const who = (inst) => inst.userId.trim().toLowerCase() || 'anonymous';

/** X-Beta is emulated by ID parity: an odd numeric ID gets the update. For names — the parity of the sum of character codes. */
function isBeta(userId) {
  const id = String(userId).trim();
  if (/^\d+$/.test(id)) return Number(id) % 2 === 1;
  let sum = 0;
  for (const ch of id.toLowerCase()) sum += ch.codePointAt(0);
  return sum % 2 === 1;
}

/** The version that canary/A-B assign to an instance, and the reason. */
function decideVersion(inst, p) {
  if (p.strategy === 'canary') {
    const b = hashBucket(inst.userId);
    const toNew = b < p.weight;
    return { version: toNew ? p.target : p.base, why: M('i.canary', { who: who(inst), b, op: toNew ? '<' : '≥', w: p.weight, v: toNew ? p.target : p.base }) };
  }
  const v = inst.xBeta ? p.target : p.base;
  return { version: v, why: M(inst.xBeta ? 'i.abOdd' : 'i.abEven', { who: who(inst), v }) };
}

function note(inst, version, reason) {
  inst.version = version;
  inst.reason = reason;
  ev({ kind: 'route', instanceId: inst.id, userId: inst.userId, strategy: applied && applied.strategy, version, reason });
}

async function removeGreen() {
  for (const d of await listDeployments(`${MANAGED},role=instance,color=green`)) await delDep(d.metadata.name);
}
async function removeShadow() {
  await delDep('site-shadow');
}

/** All instances go to the old version, live color is blue. No downtime: an ordinary RollingUpdate. */
async function toBase(run, p, list) {
  setRollout('running', M('r.revert', { base: p.base }));
  await removeGreen();
  const todo = [];
  for (const inst of list) {
    await setLive(inst, 'blue');
    if (inst.version !== p.base) { await putInst(inst, 'blue', p.base, 1, 'RollingUpdate'); inst.version = p.base; todo.push(inst); }
  }
  if (todo.length) await waitSettled(run, M('r.waitRevert', { base: p.base }), list, 'blue', () => p.base);
}

async function runApply(run, p) {
  try {
    const list = [...instances.values()];
    ev({ kind: 'apply', strategy: p.strategy, reason: M('e.apply', { strategy: p.strategy, base: p.base, target: p.target, n: list.length }) });
    if (p.strategy !== 'shadow') await removeShadow();
    activate(p);

    if (p.strategy === 'recreate') {
      await toBase(run, p, list);
      // Recreate: all instance pods are stopped, a pause with no pods (503), then new ones are created
      for (const inst of list) await putInst(inst, 'blue', p.base, 0, 'Recreate');
      await waitFor(run, M('r.recreateStop'), (pods) => {
        const left = pods.filter((x) => x.inst && list.some((i) => i.id === x.inst)).length;
        return { done: left === 0, text: M('r.left', { n: left }) };
      }, 60000);
      ev({ kind: 'rollout', strategy: p.strategy, reason: M('e.recreateNoPods') });
      const until = Date.now() + p.recreateMs;
      while (Date.now() < until) {
        if (run !== runId) throw new Error('cancelled');
        setRollout('running', M('r.recreatePause', { s: Math.ceil((until - Date.now()) / 1000) }));
        await sleep(300);
      }
      for (const inst of list) {
        await putInst(inst, 'blue', p.target, 1, 'Recreate');
        note(inst, p.target, M('i.recreate', { v: p.target }));
      }
      await waitSettled(run, M('r.recreateWait'), list, 'blue', () => p.target);
    } else if (p.strategy === 'rolling') {
      await toBase(run, p, list);
      const step = Math.max(1, p.maxSurge || 1);
      for (let i = 0; i < list.length; i += step) {
        const batch = list.slice(i, i + step);
        for (const inst of batch) {
          await putInst(inst, 'blue', p.target, 1, 'RollingUpdate'); // k8s: the new pod first, then the old one is stopped
          note(inst, p.target, M('i.rolling', { id: inst.id, v: p.target }));
        }
        await waitSettled(run, M('r.rollingProgress', { a: Math.min(i + step, list.length), b: list.length }), batch, 'blue', () => p.target);
        ev({ kind: 'rollout', strategy: p.strategy, reason: M('e.rollingStep', { a: Math.min(i + step, list.length), b: list.length }) });
        await sleep(800);
      }
    } else if (p.strategy === 'canary' || p.strategy === 'ab') {
      await removeGreen();
      for (const inst of list) {
        const d = decideVersion(inst, p);
        await setLive(inst, 'blue');
        if (inst.version !== d.version) await putInst(inst, 'blue', d.version, 1, 'RollingUpdate');
        note(inst, d.version, d.why);
      }
      await waitSettled(run, M('r.moving', { strategy: p.strategy }), list, 'blue', (i) => i.version);
    } else if (p.strategy === 'shadow') {
      await toBase(run, p, list);
      if (p.shadowOn) {
        // shared shadow pod of the new version: it receives copies of all instances' requests
        await putDeployment(buildDeployment({ name: 'site-shadow', labels: { app: 'site', role: 'shadow' }, selector: { app: 'site', role: 'shadow' }, version: p.target, replicas: 1, type: 'RollingUpdate' }));
        await ensureService('site-shadow', { app: 'site', role: 'shadow' }, { role: 'shadow' });
        await waitFor(run, M('r.shadowWait'), (pods) => ({ done: pods.some((x) => x.role === 'shadow' && x.ready), text: M('r.starting') }), 120000);
      } else await removeShadow();
      for (const inst of list) note(inst, p.base, p.shadowOn ? M('i.shadowOn', { base: p.base, target: p.target }) : M('i.shadowOff', { base: p.base }));
    } else if (p.strategy === 'bluegreen') {
      await toBase(run, p, list);
      // green: a second pod per instance with the new version; the Service points to blue until Switch is pressed
      for (const inst of list) {
        await putInst(inst, 'green', p.target, 1, 'RollingUpdate');
        note(inst, p.base, M('i.bg', { base: p.base, target: p.target }));
      }
      await waitSettled(run, M('r.bgGreen'), list, 'green', () => p.target);
    }
    if (run !== runId) return;
    epoch += 1;
    setRollout('done', M('r.done', { strategy: p.strategy }));
    ev({ kind: 'rollout', strategy: p.strategy, reason: M('e.done', { strategy: p.strategy }) });
  } catch (e) {
    if (String(e.message) === 'cancelled') return;
    const em = errMsg(e);
    setRollout('error', em);
    ev({ kind: 'error', reason: em });
  }
}

function startApply(body) {
  const p = {
    strategy: body.strategy, base: body.base, target: body.target,
    weight: Math.max(0, Math.min(100, +body.weight || 0)),
    shadowOn: body.shadowOn !== false, maxSurge: Math.max(1, +body.maxSurge || 1),
    recreateMs: Math.max(500, +body.recreateMs || 3000),
  };
  if (!p.strategy || !p.base || !p.target || p.base === p.target) throw fail('x.needStrategy');
  const run = ++runId;
  setRollout('running', M('r.start'));
  runApply(run, p);
  return p;
}

async function switchLive() {
  if (!applied || applied.strategy !== 'bluegreen') throw fail('x.switchOnly');
  const next = applied.liveColor === 'green' ? 'blue' : 'green';
  for (const inst of instances.values()) {
    await setLive(inst, next);
    note(inst, next === 'green' ? applied.target : applied.base, M('i.bgSwitch', { svc: svcName(inst.id), color: next, v: next === 'green' ? applied.target : applied.base }));
  }
  applied.liveColor = next;
  activate(applied);
  ev({ kind: 'apply', strategy: 'bluegreen', reason: M('e.switch', { color: next }) });
}

async function rollback() {
  if (!applied) throw fail('x.noStrategy');
  const run = ++runId;
  const p = { ...applied, weight: 0, shadowOn: false };
  setRollout('running', M('r.rollingBack'));
  ev({ kind: 'rollback', strategy: p.strategy, reason: M('e.rollback', { base: p.base }) });
  try {
    const list = [...instances.values()];
    await removeShadow();
    await toBase(run, p, list);
    for (const inst of list) note(inst, p.base, M('i.rollback', { v: p.base }));
    activate({ ...p, liveColor: 'blue' });
    setRollout('done', M('r.rolledBack'));
  } catch (e) {
    if (String(e.message) !== 'cancelled') setRollout('error', errMsg(e));
  }
}

// ───────────────────────── Instances ─────────────────────────
async function createInstance(userId, version) {
  const base = version || (applied && applied.base);
  if (!base) throw fail('x.noBase');
  const inst = { id: `i${nextInstance++}`, userId: String(userId || ''), xBeta: isBeta(userId || ''), createdAt: Date.now(), version: base, reason: '', lastPod: null, byeAt: 0 };
  inst.reason = M('i.new', { v: base });
  instances.set(inst.id, inst);
  await setLive(inst, liveColor());
  await putInst(inst, 'blue', base, 1, 'RollingUpdate');
  if (applied && applied.strategy === 'bluegreen') await putInst(inst, 'green', applied.target, 1, 'RollingUpdate');
  ev({ kind: 'route', instanceId: inst.id, userId: inst.userId, strategy: applied && applied.strategy, version: base, reason: inst.reason });
  return inst;
}

/** The tab was closed — delete the Deployment and Service, the pod disappears. */
async function deleteInstance(id) {
  const inst = instances.get(id);
  if (!inst) return;
  instances.delete(id);
  await Promise.all([delDep(depName(id, 'blue')), delDep(depName(id, 'green')), k8s('DELETE', nsPath(`services/${svcName(id)}`))]);
  ev({ kind: 'rollout', instanceId: id, userId: inst.userId, reason: M('e.closed', { id }) });
}

// the tab was closed (pagehide → /bye) and did not come back within 5 s (a reload comes back) — delete the pod
setInterval(() => {
  for (const inst of instances.values()) {
    if (inst.byeAt && Date.now() - inst.byeAt > 5000) deleteInstance(inst.id).catch(() => {});
  }
}, 1000);

async function resetAll() {
  runId += 1;
  for (const d of await listDeployments(MANAGED)) await delDep(d.metadata.name);
  for (const s of (await k8s('GET', nsPath(`services?labelSelector=${encodeURIComponent(MANAGED)}`))).json.items || []) await k8s('DELETE', nsPath(`services/${s.metadata.name}`));
  applied = null;
  saveApplied();
  instances.clear();
  events.length = 0;
  metrics.length = 0;
  epoch += 1;
  setRollout('idle', M('r.none'));
}

// ───────────────────────── Site content (versions) ─────────────────────────
let site = { versions: [] };
async function loadSite() {
  try {
    const r = await k8s('GET', nsPath('configmaps/platform-site'));
    if (r.status === 200 && r.json.data && r.json.data['site.json']) site = JSON.parse(r.json.data['site.json']);
  } catch (e) { /* empty — the shell uploads the defaults */ }
}
async function saveSite() {
  const cm = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'platform-site' }, data: { 'site.json': JSON.stringify(site) } };
  const r = await k8s('PUT', nsPath('configmaps/platform-site'), cm);
  if (r.status === 404) await k8s('POST', nsPath('configmaps'), cm);
}
loadSite();

// ───────────────────────── Gateway ─────────────────────────
function forward(req, res, inst, host, path, lang) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const out = http.request({
      host, port: 80, method: req.method, path,
      headers: { 'x-user-id': encodeURIComponent(inst.userId), 'x-beta': String(inst.xBeta), accept: req.headers.accept || '*/*' },
      timeout: 4000,
      agent: false,
    }, (up) => {
      const h = { ...up.headers };
      h['x-reason'] = encodeURIComponent(render(inst.reason, lang));
      h['x-strategy'] = (applied && applied.strategy) || '';
      h['x-epoch'] = String(epoch);
      h['x-user'] = encodeURIComponent(inst.userId.trim() || 'anonymous');
      res.writeHead(up.statusCode, h);
      up.pipe(res);
      metrics.push({ instanceId: inst.id, version: up.headers['x-version'] || '—', status: up.statusCode, latencyMs: Date.now() - t0, t: Date.now() });
      if (metrics.length > 600) metrics.shift();
      resolve({ pod: up.headers['x-pod'], node: up.headers['x-node'], version: up.headers['x-version'] });
    });
    out.on('timeout', () => out.destroy(new Error('timeout')));
    out.on('error', reject);
    out.end();
  });
}

function unavailable(res, inst, text, lang) {
  metrics.push({ instanceId: inst.id, version: '—', status: 503, latencyMs: 0, t: Date.now() });
  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'x-epoch': String(epoch), refresh: '2' });
  res.end(`<!doctype html><html lang="${lang}"><meta charset=utf-8><meta http-equiv=refresh content=2><body style="font-family:sans-serif;background:#450a0a;color:#fecaca;text-align:center;padding-top:20vh"><h1 style="font-size:64px;margin:0">503</h1><p>Service Unavailable</p><p style="opacity:.7;font-size:13px">${text}</p><p style="opacity:.5;font-size:12px">${String(inst.userId).replace(/[<>&]/g, '')} · ${render(M('g.refresh'), lang)}</p></body>`);
}

async function gateway(req, res, id, rest) {
  const lang = langOf(req);
  const inst = instances.get(id);
  if (!inst) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end(render(M('g.notFound'), lang)); return; }
  if (rest === '/bye') { inst.byeAt = Date.now(); res.writeHead(204); res.end(); return; }
  inst.byeAt = 0; // the tab is back (a reload) — cancel the deletion
  // user request emulation: the window sends an X-Beta header — it overrides the stored flag
  const hdrBeta = req.headers['x-beta'];
  if (hdrBeta === 'true' || hdrBeta === 'false') {
    const b = hdrBeta === 'true';
    if (b !== inst.xBeta) {
      inst.xBeta = b;
      ev({ kind: 'route', instanceId: id, userId: inst.userId, strategy: applied && applied.strategy, version: inst.version, reason: M('e.betaHeader', { b }) });
    }
  }
  if (applied && applied.strategy === 'shadow' && applied.shadowOn) {
    const m = http.request({ host: 'site-shadow', port: 80, path: rest, method: 'GET', timeout: 2000, agent: false }, (r) => r.resume());
    m.on('error', () => {}); m.on('timeout', () => m.destroy()); m.end();
  }
  try {
    const r = await forward(req, res, inst, svcName(id), rest, lang);
    if (r.pod && r.pod !== inst.lastPod) {
      if (inst.lastPod) ev({ kind: 'failover', instanceId: id, userId: inst.userId, strategy: applied && applied.strategy, version: r.version, pod: r.pod, node: r.node, reason: M('e.failover', { old: inst.lastPod, new: r.pod }) });
      inst.lastPod = r.pod;
    }
  } catch (e) {
    unavailable(res, inst, render(M('g.noPod', { svc: svcName(id), err: e.message }), lang), lang);
  }
}

// ───────────────────────── HTTP ─────────────────────────
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
});

function snapshotInstance(inst, lang) {
  const color = liveColor();
  const pod = cache.pods.find((p) => p.inst === inst.id && p.color === color && p.ready);
  return {
    id: inst.id, userId: inst.userId, xBeta: inst.xBeta, createdAt: inst.createdAt,
    binding: pod ? { version: pod.version, pod: pod.name, node: pod.node, reason: render(inst.reason, lang) } : null,
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const lang = langOf(req);
  try {
    if (path.startsWith('/i/')) {
      const m = path.match(/^\/i\/([^/]+)(\/.*)?$/);
      if (!m) { res.writeHead(404); res.end(); return; }
      if (!m[2]) { res.writeHead(302, { location: `/i/${m[1]}/` }); res.end(); return; }
      return gateway(req, res, m[1], m[2] + url.search);
    }
    if (path === '/healthz') { res.end('ok'); return; }
    if (path === '/api/state' && req.method === 'GET') {
      return json(res, 200, {
        connected: cache.ok, error: cache.error, applied, epoch, rollout: { ...rollout, message: render(rollout.message, lang) }, liveColor: liveColor(),
        pods: cache.pods, nodes: cache.nodes,
        instances: [...instances.values()].map((i) => snapshotInstance(i, lang)),
        events: events.slice(0, 200).map((e) => ({ ...e, reason: render(e.reason, lang) })), metrics: metrics.slice(-300), now: Date.now(),
      });
    }
    if (path === '/api/site') {
      if (req.method === 'GET') return json(res, 200, site);
      if (req.method === 'PUT') {
        const b = await readBody(req);
        if (!Array.isArray(b.versions)) return json(res, 400, { error: 'versions[]' });
        site = { versions: b.versions };
        saveSite().catch(() => {});
        return json(res, 200, site);
      }
    }
    if (path === '/api/apply' && req.method === 'POST') return json(res, 202, startApply(await readBody(req)));
    if (path === '/api/switch' && req.method === 'POST') { await switchLive(); return json(res, 200, { ok: true }); }
    if (path === '/api/rollback' && req.method === 'POST') { rollback(); return json(res, 202, { ok: true }); }
    if (path === '/api/reset' && req.method === 'POST') { await resetAll(); return json(res, 200, { ok: true }); }
    if (path === '/api/instances' && req.method === 'POST') {
      const b = await readBody(req);
      const inst = await createInstance(b.userId, b.version);
      return json(res, 201, { id: inst.id });
    }
    const im = path.match(/^\/api\/instances\/([^/]+)$/);
    if (im && req.method === 'DELETE') { await deleteInstance(im[1]); return json(res, 200, { ok: true }); }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, e.m ? 400 : 500, { error: e.m ? render(e.m, lang) : String(e.message || e) });
  }
}).listen(3000, () => console.log('platform listening :3000, namespace', NS));
