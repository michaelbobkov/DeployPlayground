import type { MetricEvent, Strategy, Version } from '../state/types';

/** Cluster snapshot returned by the platform (GET /api/state). */
export interface Binding { version: Version; pod: string; node: string; reason: string }

export interface ClusterInstance {
  id: string;
  userId: string;
  xBeta: boolean;
  createdAt: number;
  binding: Binding | null;
}

export interface PodInfo {
  name: string;
  version: Version;
  node: string | null;
  phase: string; // Pending, Running, Terminating …
  inst: string | null; // the instance that owns the pod (null — the shared shadow pod)
  color: 'blue' | 'green' | null;
  ready: boolean;
  ip: string | null;
}

export interface NodeInfo { name: string; role: 'control-plane' | 'worker'; ready: boolean }

export interface Applied {
  strategy: Strategy;
  base: Version;
  target: Version;
  weight: number;
  shadowOn: boolean;
  maxSurge: number;
  recreateMs: number;
  liveColor: 'blue' | 'green';
}

export interface ClusterEvent {
  id: number;
  t: number;
  kind: 'route' | 'failover' | 'apply' | 'rollout' | 'rollback' | 'error';
  instanceId?: string;
  userId?: string;
  strategy?: Strategy;
  version?: Version | null;
  pod?: string;
  node?: string;
  reason: string;
}

export interface ClusterState {
  connected: boolean; // whether the platform is reachable
  error: string;
  applied: Applied | null;
  epoch: number;
  rollout: { phase: 'idle' | 'running' | 'done' | 'error'; message: string };
  liveColor: 'blue' | 'green'; // what the instance Services point to in Blue/Green
  pods: PodInfo[];
  nodes: NodeInfo[];
  instances: ClusterInstance[];
  events: ClusterEvent[];
  metrics: MetricEvent[];
}

export const emptyCluster: ClusterState = {
  connected: false, error: '', applied: null, epoch: 0,
  rollout: { phase: 'idle', message: '' },
  liveColor: 'blue', pods: [], nodes: [], instances: [], events: [], metrics: [],
};
