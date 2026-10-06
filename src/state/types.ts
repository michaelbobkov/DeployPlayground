import type { Msg } from '../i18n';
import type { SiteConfig } from '../site/config';

export type Strategy = 'recreate' | 'rolling' | 'bluegreen' | 'canary' | 'shadow' | 'ab';
export type Version = string;

export interface Req {
  userId: string;
}

export interface Decision {
  version: Version | null;
  shadow?: Version;
  pod: string;
  reason: Msg;
}

export type RecreatePhase = 'old' | 'paused' | 'new';

export interface MetricEvent {
  instanceId: string;
  version: Version;
  status: number;
  latencyMs: number;
  t: number;
}

/** Model for the Compare and Config tabs: form fields plus what is visible in the cluster. */
export interface State {
  strategy: Strategy;
  site: SiteConfig;
  base: Version; // old (stable) version
  target: Version; // new version that the strategy rolls out
  req: Req;
  weight: number; // canary 0..100
  podsTotal: number;
  rollingReady: number; // ready pods of the new version (from the cluster)
  maxSurge: number;
  maxUnavailable: number;
  activeColor: 'blue' | 'green'; // what the instance Services point to
  recreate: RecreatePhase;
  recreateMs: number;
  shadowOn: boolean;
  rr: number;
}

/** Strategy names are established terms and are not translated; hints: key strategy.<id>.hint. */
export const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'recreate', label: 'Recreate' },
  { id: 'rolling', label: 'Rolling' },
  { id: 'bluegreen', label: 'Blue/Green' },
  { id: 'canary', label: 'Canary' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'ab', label: 'A/B' },
];
