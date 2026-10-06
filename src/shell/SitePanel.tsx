import { useState } from 'react';
import { nextVersion, type SiteVersion } from '../site/config';
import { useCluster } from '../cluster/ClusterProvider';
import { useI18n } from '../i18n';

const input = 'w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none ring-indigo-500 focus:ring-2';

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

/** Site description: versions (at least two), each with its own texts, color and dynamic block. */
export function SiteEditor() {
  const { site, setSite } = useCluster();
  const { t } = useI18n();
  const { versions } = site;
  const [sel, setSel] = useState('v1');
  const cur = versions.find((v) => v.id === sel) ?? versions[0];

  const save = (vs: SiteVersion[]) => setSite({ versions: vs });
  const edit = (p: Partial<SiteVersion>) => save(versions.map((v) => (v.id === cur.id ? { ...v, ...p } : v)));
  const add = () => {
    const nv = nextVersion(site, cur);
    save([...versions, nv]);
    setSel(nv.id);
  };
  const remove = () => {
    const rest = versions.filter((v) => v.id !== cur.id);
    save(rest);
    setSel(rest[0].id);
  };

  return (
    <section className="space-y-3 border-t border-slate-800 pt-4">
      <h2 className="text-sm font-semibold">{t('site.title')}</h2>
      <p className="text-xs text-slate-400">{t('site.help')}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setSel(v.id)}
            className={'flex items-center gap-1.5 rounded px-2.5 py-1 text-sm ' + (v.id === cur.id ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}
          >
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
            {v.id}
          </button>
        ))}
        <button onClick={add} title={t('site.addTitle')} className="rounded bg-emerald-700 px-2.5 py-1 text-sm hover:bg-emerald-600">＋</button>
      </div>

      <div key={cur.id} className="space-y-3 rounded border border-slate-800 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('site.version', { id: cur.id })}</h3>
          <button
            onClick={remove}
            disabled={versions.length <= 2}
            title={versions.length <= 2 ? t('site.minTwo') : t('site.removeTitle')}
            className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-slate-800"
          >
            {t('site.delete')}
          </button>
        </div>
        <F label={t('site.fTitle')}><input className={input} value={cur.title} onChange={(e) => edit({ title: e.target.value })} /></F>
        <F label={t('site.fGreeting', { name: '{name}' })}><input className={input} value={cur.greeting} onChange={(e) => edit({ greeting: e.target.value })} /></F>
        <F label={t('site.fText')}><textarea rows={2} className={input} value={cur.desc} onChange={(e) => edit({ desc: e.target.value })} /></F>
        <F label={t('site.fColor')}>
          <div className="flex items-center gap-2">
            <input type="color" value={cur.color} onChange={(e) => edit({ color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" />
            <code className="text-xs text-slate-400">{cur.color}</code>
          </div>
        </F>

        <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('site.dynHeading')}</h4>
        <F label={t('site.fDynTitle')}><input className={input} value={cur.dynTitle} onChange={(e) => edit({ dynTitle: e.target.value })} /></F>
        <F label={t('site.fDynLines')}>
          <textarea rows={4} className={input} value={cur.dynLines} onChange={(e) => edit({ dynLines: e.target.value })} />
        </F>
        <F label={t('site.fDynEvery', { s: cur.dynSeconds })}>
          <input type="range" min={1} max={10} value={cur.dynSeconds} onChange={(e) => edit({ dynSeconds: +e.target.value })} className="w-full" />
        </F>
      </div>
    </section>
  );
}
