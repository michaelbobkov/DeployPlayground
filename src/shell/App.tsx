import { useEffect, useState } from 'react';
import { api } from '../cluster/api';
import { useCluster } from '../cluster/ClusterProvider';
import { closedWindowIds, closeWindow } from '../bridge';
import { useI18n } from '../i18n';
import { InstanceFrame } from '../instances/InstanceFrame';
import { Bottom, type Tab } from './Bottom';
import { Controls } from './Controls';

export function App() {
  const { cluster } = useCluster();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('log');

  // the window was closed by hand — delete the instance in the cluster too
  useEffect(() => {
    const timer = setInterval(() => {
      for (const id of closedWindowIds()) {
        closeWindow(id);
        api.deleteInstance(id).catch(() => {});
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Controls onCompare={() => setTab('compare')} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {cluster.instances.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-slate-500">{t('app.empty')}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cluster.instances.map((i, n) => <InstanceFrame key={i.id} inst={i} slot={n} />)}
            </div>
          )}
        </div>
        <Bottom tab={tab} setTab={setTab} />
      </main>
    </div>
  );
}
