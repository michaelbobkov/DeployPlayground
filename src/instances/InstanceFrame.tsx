import { api } from '../cluster/api';
import { useCluster } from '../cluster/ClusterProvider';
import type { ClusterInstance } from '../cluster/types';
import { closeWindow, getWindow, reloadWindow, showWindow } from '../bridge';
import { useI18n } from '../i18n';
import { versionColor } from '../site/config';

/** Instance card: what the cluster knows about it (version, pod, node). The site itself is in the browser window. */
export function InstanceFrame({ inst, slot }: { inst: ClusterInstance; slot: number }) {
  const { site } = useCluster();
  const { t } = useI18n();
  const b = inst.binding;
  const open = !!getWindow(inst.id);

  const close = async () => {
    closeWindow(inst.id);
    await api.deleteInstance(inst.id);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-xs">
        <span className="truncate text-slate-400">{inst.id}</span>
        {b ? (
          <span className="ml-auto rounded px-1.5 py-0.5 font-bold text-white" style={{ background: versionColor(site, b.version) }}>{b.version}</span>
        ) : (
          <span className="ml-auto rounded bg-slate-600 px-1.5 py-0.5 font-bold text-white">{t('inst.waiting')}</span>
        )}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <div className="text-slate-300">{t('inst.user')}: <b>{inst.userId.trim() || 'anonymous'}</b>{inst.xBeta && <span className="ml-1 rounded bg-amber-500 px-1 text-[10px] font-bold text-black" title={t('inst.betaTitle')}>X-Beta</span>}</div>
        {b ? (
          <>
            <div className="text-xs text-slate-400">{t('inst.pod')} <code className="text-slate-200">{b.pod}</code></div>
            <div className="text-xs text-slate-400">{t('inst.node')} <code className="text-slate-200">{b.node}</code></div>
            <div className="text-xs text-slate-500">{b.reason}</div>
          </>
        ) : (
          <div className="text-xs text-slate-500">{t('inst.starting')}</div>
        )}
      </div>
      <div className="mt-auto flex gap-2 border-t border-slate-700 p-2 text-xs">
        <button onClick={() => showWindow(inst.id, slot)} className="rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500">{open ? t('inst.showWindow') : t('inst.openWindow')}</button>
        <button onClick={() => reloadWindow(inst.id)} className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" title={t('inst.reloadTitle')}>{t('inst.reload')}</button>
        <button onClick={close} className="ml-auto rounded bg-slate-700 px-2 py-1 hover:bg-red-700">{t('inst.close')}</button>
      </div>
    </div>
  );
}
