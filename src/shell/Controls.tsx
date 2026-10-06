import { useState, type ReactNode } from 'react';
import { api } from '../cluster/api';
import { useCluster } from '../cluster/ClusterProvider';
import { attach, closeWindow, openBlank } from '../bridge';
import { LANGS, useI18n, type Key } from '../i18n';
import { useStore, type Form } from '../state/store';
import { STRATEGIES, type Strategy } from '../state/types';
import { Dropdown } from './Dropdown';
import { SiteEditor } from './SitePanel';

export const MAX_INSTANCES = 8;

const btn = 'rounded px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ';
const ghost = btn + 'bg-slate-800 hover:bg-slate-700';
const field = 'w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none ring-indigo-500 focus:ring-2';

function Field({ label, children, plain }: { label: string; children: ReactNode; plain?: boolean }) {
  const Tag = plain ? 'div' : 'label'; // inside a label a click on a list item would fire twice
  return (
    <Tag className="block text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </Tag>
  );
}

export function Controls({ onCompare }: { onCompare: () => void }) {
  const { form: f, dispatch } = useStore();
  const { cluster, site } = useCluster();
  const { t, lang, setLang } = useI18n();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState('');
  const patch = (p: Partial<Form>) => dispatch({ type: 'patch', patch: p });
  const free = MAX_INSTANCES - cluster.instances.length;
  const ids = site.versions.map((v) => ({ id: v.id, label: v.id }));
  const setBase = (id: string) => patch(id === f.target ? { base: id, target: f.base } : { base: id });
  const setTarget = (id: string) => patch(id === f.base ? { target: id, base: f.target } : { target: id });

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try { await fn(); } catch (e) { alert(String((e as Error).message)); } finally { setBusy(''); }
  };

  /** "Run": apply the strategy in the cluster — real Deployments and Services. */
  const apply = () => run('apply', () => api.apply({
    strategy: f.strategy, base: f.base, target: f.target, weight: f.weight,
    shadowOn: f.shadowOn, maxSurge: f.maxSurge, recreateMs: f.recreateMs,
  }));

  /** "New instance": open the windows right away (user gesture), set the address after registration. */
  const addInstances = () => {
    const n = Math.min(count, free);
    // every instance is a "new user": with auto ID a batch gets consecutive IDs 1, 2, 3 …
    const userIds = Array.from({ length: n }, (_, i) => (f.autoId ? String(f.nextUserId + i) : f.req.userId));
    if (f.autoId) patch({ nextUserId: f.nextUserId + n });
    const wins = Array.from({ length: n }, (_, i) => openBlank(cluster.instances.length + i));
    wins.forEach(async (w, i) => {
      try {
        const { id } = await api.createInstance(userIds[i], f.base);
        if (w) attach(id, w);
      } catch (e) {
        w?.close();
        alert(String((e as Error).message));
      }
    });
  };

  const closeAll = () => run('close', async () => {
    for (const i of cluster.instances) { closeWindow(i.id); await api.deleteInstance(i.id); }
  });
  const reset = () => run('reset', async () => {
    cluster.instances.forEach((i) => closeWindow(i.id));
    await api.reset();
  });

  const running = cluster.rollout.phase === 'running';
  const rolloutColor = cluster.rollout.phase === 'error' ? 'text-red-400' : running ? 'text-amber-300' : 'text-emerald-400';
  const workers = cluster.nodes.filter((n) => n.role === 'worker').length || cluster.nodes.length;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-slate-800 bg-slate-900 p-4 md:w-96 md:border-r">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Deploy Playground</h1>
        <div className="flex overflow-hidden rounded border border-slate-700" role="group" aria-label={t('ctl.language')} title={t('ctl.language')}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              aria-pressed={lang === l.id}
              className={'px-2 py-1 text-xs font-semibold ' + (lang === l.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {!cluster.connected && (
        <div className="rounded border border-red-800 bg-red-950/60 p-2 text-xs text-red-200">
          {t('ctl.disconnected', { deploy: 'npm run cluster:deploy', forward: 'npm run cluster:forward' })}
        </div>
      )}

      <Dropdown<Strategy>
        value={f.strategy}
        options={STRATEGIES.map((x) => ({ id: x.id, label: x.label, hint: t(`strategy.${x.id}.hint` as Key) }))}
        onChange={(strategy) => patch({ strategy })}
      />

      <button
        onClick={apply}
        disabled={!cluster.connected || busy === 'apply'}
        title={t('ctl.runTitle')}
        className={btn + 'bg-emerald-600 text-white hover:bg-emerald-500'}
      >
        {t('ctl.run')}
      </button>
      <div className={'-mt-2 text-xs ' + rolloutColor}>
        {running && '⏳ '}{cluster.rollout.message}
        {cluster.nodes.length > 0 && <span className="text-slate-500">{t('ctl.nodesInfo', { n: cluster.nodes.length, w: workers, p: cluster.pods.length })}</span>}
      </div>

      <div className="flex gap-2">
        <button onClick={addInstances} disabled={free <= 0 || !cluster.connected} className={btn + 'flex-1 bg-indigo-600 text-white hover:bg-indigo-500'}>
          {t('ctl.newInstance')}
        </button>
        <input
          type="number" min={1} max={MAX_INSTANCES} value={count}
          title={t('ctl.countLabel')} aria-label={t('ctl.countLabel')}
          onChange={(e) => setCount(Math.max(1, Math.min(MAX_INSTANCES, Math.round(+e.target.value) || 1)))}
          className={field + ' !w-20 text-center'}
        />
      </div>
      <p className="-mt-2 text-xs text-slate-500">{t('ctl.instancesInfo', { n: cluster.instances.length, max: MAX_INSTANCES })}</p>

      <Field label={f.autoId ? t('ctl.idNext') : t('ctl.nameOrId')}>
        {f.autoId ? (
          <input type="number" min={1} value={f.nextUserId} onChange={(e) => patch({ nextUserId: Math.max(1, Math.round(+e.target.value) || 1) })} className={field} />
        ) : (
          <input value={f.req.userId} onChange={(e) => dispatch({ type: 'patchReq', patch: { userId: e.target.value } })} className={field} placeholder="Anna" />
        )}
      </Field>
      <label className="-mt-2 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={f.autoId} onChange={(e) => patch({ autoId: e.target.checked })} /> {t('ctl.autoId')}
      </label>

      <section className="space-y-3 rounded border border-slate-800 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{STRATEGIES.find((x) => x.id === f.strategy)!.label}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field plain label={t('ctl.oldVersion')}><Dropdown value={f.base} options={ids} onChange={setBase} /></Field>
          <Field plain label={t('ctl.newVersion')}><Dropdown value={f.target} options={ids} onChange={setTarget} /></Field>
        </div>

        {f.strategy === 'recreate' && (
          <Field label={t('ctl.recreatePause', { s: f.recreateMs / 1000 })}>
            <input type="range" min={1000} max={10000} step={500} value={f.recreateMs} onChange={(e) => patch({ recreateMs: +e.target.value })} className="w-full" />
          </Field>
        )}
        {f.strategy === 'rolling' && (
          <Field label={t('ctl.rollingStep')}>
            <input type="number" min={1} max={4} value={f.maxSurge} onChange={(e) => patch({ maxSurge: Math.max(1, +e.target.value || 1) })} className={field} />
          </Field>
        )}
        {f.strategy === 'bluegreen' && (
          <div className="space-y-2 text-sm">
            <div>
              {t('ctl.active')} <b className={cluster.liveColor === 'green' ? 'text-emerald-400' : 'text-sky-400'}>{cluster.liveColor}</b> ({cluster.liveColor === 'green' ? f.target : f.base})
            </div>
            <button className={ghost} disabled={!cluster.applied} onClick={() => run('switch', api.switchLive)}>Switch</button>
          </div>
        )}
        {f.strategy === 'canary' && (
          <Field label={t('ctl.canaryWeight', { w: f.weight })}>
            <input type="range" min={0} max={100} value={f.weight} onChange={(e) => patch({ weight: +e.target.value })} className="w-full" />
          </Field>
        )}
        {f.strategy === 'shadow' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.shadowOn} onChange={(e) => patch({ shadowOn: e.target.checked })} /> {t('ctl.shadowCopy')}
          </label>
        )}
        {f.strategy === 'ab' && <p className="text-xs text-slate-400">{t('ctl.abHint')}</p>}
        <p className="text-xs text-slate-500">{t('ctl.paramsHint')}</p>
        <button className={ghost} disabled={!cluster.applied} onClick={() => run('rollback', api.rollback)}>Rollback</button>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className={ghost} onClick={onCompare}>{t('ctl.compareAll')}</button>
        <button className={ghost} onClick={closeAll} disabled={!cluster.instances.length}>{t('ctl.closeAll')}</button>
        <button className={ghost} onClick={reset} title={t('ctl.resetTitle')}>{t('ctl.reset')}</button>
      </div>

      <SiteEditor />
    </aside>
  );
}
