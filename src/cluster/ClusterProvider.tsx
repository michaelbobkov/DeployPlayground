import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { defaultSite, type SiteConfig } from '../site/config';
import { useStore } from '../state/store';
import type { State } from '../state/types';
import { api } from './api';
import { emptyCluster, type ClusterState } from './types';

interface Ctx {
  cluster: ClusterState;
  site: SiteConfig;
  setSite: (s: SiteConfig) => void;
  model: State; // the form plus the observed cluster state: for the Compare and Config tabs
}
const C = createContext<Ctx | null>(null);

/** Polls the platform once a second and keeps the site versions (stored in the cluster, in a ConfigMap). */
export function ClusterProvider({ children }: { children: ReactNode }) {
  const { form, dispatch } = useStore();
  const { lang } = useI18n();
  const [cluster, setCluster] = useState<ClusterState>(emptyCluster);
  const [site, setSiteLocal] = useState<SiteConfig>(() => defaultSite(lang));
  const siteLoaded = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const st = await api.state();
        if (!stop) setCluster({ ...st, connected: st.connected !== false });
        if (!siteLoaded.current) {
          const s = await api.getSite();
          if (s.versions?.length >= 2) setSiteLocal(s);
          else {
            // the cluster is empty — upload the defaults in the current language
            const d = defaultSite(lang);
            setSiteLocal(d);
            await api.putSite(d);
          }
          siteLoaded.current = true;
        }
      } catch {
        if (!stop) setCluster((c) => ({ ...c, connected: false, error: 'unreachable' }));
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { stop = true; clearInterval(t); };
  }, [lang]);

  const setSite = useCallback((s: SiteConfig) => {
    setSiteLocal(s);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { api.putSite(s).catch(() => {}); }, 300);
  }, []);

  // base and target must stay existing, different versions
  useEffect(() => {
    const ids = site.versions.map((v) => v.id);
    const base = ids.includes(form.base) ? form.base : ids[0];
    const target = ids.includes(form.target) && form.target !== base ? form.target : ids.find((i) => i !== base)!;
    if (base !== form.base || target !== form.target) dispatch({ type: 'patch', patch: { base, target } });
  }, [site, form.base, form.target, dispatch]);

  const model = useMemo<State>(() => {
    const ready = (v: string) => cluster.pods.filter((p) => p.inst && p.version === v && p.ready).length;
    const anyReady = cluster.pods.some((p) => p.inst && p.ready);
    const tReady = ready(form.target);
    return {
      ...form,
      site,
      podsTotal: Math.max(1, cluster.instances.length),
      maxUnavailable: 0,
      rollingReady: tReady,
      activeColor: cluster.liveColor,
      recreate: cluster.applied && !anyReady ? 'paused' : tReady > 0 && ready(form.base) === 0 ? 'new' : 'old',
      rr: 0,
    };
  }, [form, site, cluster]);

  return <C.Provider value={{ cluster, site, setSite, model }}>{children}</C.Provider>;
}

export function useCluster() {
  const c = useContext(C);
  if (!c) throw new Error('ClusterProvider missing');
  return c;
}
