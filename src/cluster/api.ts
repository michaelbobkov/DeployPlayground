import type { SiteConfig } from '../site/config';
import type { Strategy } from '../state/types';
import type { ClusterState } from './types';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!r.ok) {
    // the platform sends the error text in the interface language
    const e = await r.json().catch(() => null);
    throw new Error(e && e.error ? e.error : `${method} ${url}: ${r.status}`);
  }
  return r.json();
}

export interface ApplyParams {
  strategy: Strategy;
  base: string;
  target: string;
  weight: number;
  shadowOn: boolean;
  maxSurge: number;
  recreateMs: number;
}

export const api = {
  state: () => call<ClusterState>('GET', '/api/state'),
  getSite: () => call<SiteConfig>('GET', '/api/site'),
  putSite: (s: SiteConfig) => call<SiteConfig>('PUT', '/api/site', s),
  apply: (p: ApplyParams) => call<unknown>('POST', '/api/apply', p),
  switchLive: () => call<unknown>('POST', '/api/switch'),
  rollback: () => call<unknown>('POST', '/api/rollback'),
  reset: () => call<unknown>('POST', '/api/reset'),
  createInstance: (userId: string, version: string) => call<{ id: string }>('POST', '/api/instances', { userId, version }),
  deleteInstance: (id: string) => call<unknown>('DELETE', `/api/instances/${id}`),
};
