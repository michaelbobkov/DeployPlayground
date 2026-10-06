import { useState } from 'react';
import { useCluster } from '../cluster/ClusterProvider';
import { buildConfig, isHighlighted, KINDS, type Kind, type LastDecision } from '../configs';
import { useI18n, type Key } from '../i18n';
import { compareAll, isBeta } from '../router';
import { computeMetrics, WINDOW_MS } from '../metrics';
import { versionColor } from '../site/config';
import { STRATEGIES, type MetricEvent, type Version } from '../state/types';

export type Tab = 'log' | 'cluster' | 'metrics' | 'config' | 'compare';
const TABS: Tab[] = ['log', 'cluster', 'metrics', 'config', 'compare'];

function V({ v, extra }: { v: Version | null | undefined; extra?: string }) {
  const { site } = useCluster();
  return <b style={{ color: v ? versionColor(site, v) : '#f87171' }}>{v ?? '503'}{extra && <span className="text-violet-400"> {extra}</span>}</b>;
}

function Log() {
  const { cluster } = useCluster();
  const { t, lang } = useI18n();
  if (!cluster.events.length) return <p className="p-3 text-sm text-slate-500">{t('log.empty')}</p>;
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-slate-900 text-slate-400">
        <tr><th className="p-1.5">{t('log.time')}</th><th>{t('log.event')}</th><th>{t('log.input')}</th><th>{t('log.version')}</th><th>{t('log.podNode')}</th><th>{t('log.why')}</th></tr>
      </thead>
      <tbody>
        {cluster.events.map((l) => (
          <tr key={l.id} className="border-t border-slate-800 align-top">
            <td className="p-1.5 whitespace-nowrap text-slate-500">{new Date(l.t).toLocaleTimeString(lang)}</td>
            <td className="whitespace-nowrap">{t(`ev.${l.kind}` as Key)}{l.strategy && <span className="text-slate-500"> {l.strategy}</span>}</td>
            <td>{l.userId?.trim() || (l.instanceId ? 'anonymous' : '')}</td>
            <td>{l.version !== undefined && <V v={l.version} />}</td>
            <td className="whitespace-nowrap">{l.pod}{l.node && <span className="text-slate-500"> @ {l.node}</span>}</td>
            <td className="text-slate-300">{l.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Real separation: the cluster nodes and the pods on them. */
function ClusterTab() {
  const { cluster, site } = useCluster();
  const { t } = useI18n();
  if (!cluster.connected && !cluster.nodes.length) return <p className="p-3 text-sm text-slate-500">{t('cl.noConn')}</p>;
  const names = new Set(cluster.nodes.map((n) => n.name));
  const groups = [
    ...cluster.nodes.map((n) => ({ key: n.name, title: n.name, sub: n.role, ok: n.ready, pods: cluster.pods.filter((p) => p.node === n.name) })),
    ...(cluster.pods.some((p) => !p.node || !names.has(p.node)) ? [{ key: '-', title: t('cl.pending'), sub: t('cl.pendingSub'), ok: true, pods: cluster.pods.filter((p) => !p.node || !names.has(p.node)) }] : []),
  ];
  return (
    <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <div key={g.key} className="rounded border border-slate-700 bg-slate-950/50">
          <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-1.5 text-xs">
            <i className={'h-2 w-2 rounded-full ' + (g.ok ? 'bg-emerald-400' : 'bg-red-500')} />
            <b>{g.title}</b><span className="text-slate-500">{g.sub}</span>
            <span className="ml-auto text-slate-500">{t('cl.pods', { n: g.pods.length })}</span>
          </div>
          <ul className="space-y-1 p-2">
            {g.pods.length === 0 && <li className="text-xs text-slate-600">{t('cl.empty')}</li>}
            {g.pods.map((p) => (
              <li key={p.name} className="flex items-center gap-2 text-xs">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: versionColor(site, p.version), opacity: p.ready ? 1 : 0.4 }} />
                <code className={p.ready ? 'text-slate-200' : 'text-slate-500'}>{p.name}</code>
                <span className="text-slate-500">{p.version} · {p.ready ? 'Ready' : p.phase}</span>
                <span className={'ml-auto rounded px-1.5 text-[10px] font-bold text-white ' + (p.inst ? 'bg-indigo-600' : 'bg-violet-600')}>{p.inst ? `${p.inst}${p.color === 'green' ? ' green' : ''}` : 'shadow'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Error share over the sliding last 10 requests of a version → points of the SVG line */
function series(events: MetricEvent[], v: Version, now: number) {
  const ev = events.filter((e) => e.version === v && e.t >= now - WINDOW_MS);
  return ev.map((_, i) => {
    const w = ev.slice(Math.max(0, i - 9), i + 1);
    return w.filter((e) => e.status >= 500).length / w.length;
  });
}

function Chart({ v }: { v: Version }) {
  const { cluster, site } = useCluster();
  const ys = series(cluster.metrics, v, Date.now());
  const W = 260, H = 60;
  const pts = ys.map((y, i) => `${ys.length > 1 ? (i / (ys.length - 1)) * W : W},${H - y * H}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full rounded bg-slate-950">
      {ys.length > 0 && <polyline points={pts} fill="none" stroke={versionColor(site, v)} strokeWidth="2" />}
    </svg>
  );
}

function MetricsTab() {
  const { cluster, site } = useCluster();
  const { t } = useI18n();
  const now = Date.now();
  const unavailable = cluster.metrics.filter((e) => e.version === '—' && e.t >= now - WINDOW_MS).length;
  return (
    <div className="grid gap-4 p-3 md:grid-cols-2">
      {site.versions.map(({ id: v }) => {
        const m = computeMetrics(cluster.metrics, v, now);
        return (
          <div key={v} className="space-y-1">
            <div><V v={v} /></div>
            <div className="text-sm">{t('m.line', { n: m.count, r: Math.round(m.errorRate * 100), ms: m.p99 })}</div>
            <Chart v={v} />
          </div>
        );
      })}
      <p className="col-span-full text-xs text-slate-500">{t('m.footer', { s: WINDOW_MS / 1000, n: unavailable })}</p>
    </div>
  );
}

function ConfigTab() {
  const { model, cluster } = useCluster();
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('k8s');
  const e = cluster.events.find((x) => x.kind === 'route' || x.kind === 'failover' || x.kind === 'rollback');
  const last: LastDecision | undefined = e && {
    action: e.kind === 'rollback' ? 'rollback' : 'open',
    version: e.version ?? null,
    shadow: cluster.applied?.strategy === 'shadow' && cluster.applied.shadowOn ? cluster.applied.target : undefined,
  };
  const lines = buildConfig(kind, model, t);
  return (
    <div className="p-3">
      <div className="mb-2 flex gap-1">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} className={'rounded px-2 py-1 text-xs ' + (kind === k.id ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700')}>{k.label}</button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded bg-slate-950 py-2 text-xs leading-5">
        {lines.map((l, i) => (
          <div key={i} className={'px-3 ' + (isHighlighted(l, model, last) ? 'bg-amber-400/20 text-amber-200' : 'text-slate-300')}>{l.t || ' '}</div>
        ))}
      </pre>
      <p className="mt-1 text-xs text-slate-500">{t('cfg.note')}</p>
    </div>
  );
}

/** The route() model: what each strategy would do with this request (without touching the cluster). */
function CompareTab() {
  const { model } = useCluster();
  const { t, m } = useI18n();
  const all = compareAll(model.req, model);
  return (
    <div className="p-3">
      <p className="mb-2 text-sm text-slate-400">
        {t('cmp.intro', { id: model.req.userId || 'anonymous', beta: String(isBeta(model.req.userId)) })}
      </p>
      <table className="w-full text-left text-xs">
        <thead className="text-slate-400"><tr><th className="p-1.5">{t('cmp.strategy')}</th><th>{t('cmp.version')}</th><th>{t('cmp.why')}</th></tr></thead>
        <tbody>
          {STRATEGIES.map((st) => {
            const d = all[st.id];
            return (
              <tr key={st.id} className={'border-t border-slate-800 ' + (model.strategy === st.id ? 'bg-slate-800/60' : '')}>
                <td className="p-1.5 font-medium">{st.label}</td>
                <td><V v={d.version} extra={d.shadow ? t('cmp.shadowCopy', { v: d.shadow }) : undefined} /></td>
                <td className="text-slate-300">{m(d.reason)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Bottom({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useI18n();
  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-slate-800 bg-slate-900">
      <nav className="flex border-b border-slate-800">
        {TABS.map((id) => (
          <button key={id} onClick={() => setTab(id)} className={'px-4 py-2 text-sm ' + (tab === id ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200')}>{t(`tab.${id}` as Key)}</button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'log' && <Log />}
        {tab === 'cluster' && <ClusterTab />}
        {tab === 'metrics' && <MetricsTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'compare' && <CompareTab />}
      </div>
    </section>
  );
}
