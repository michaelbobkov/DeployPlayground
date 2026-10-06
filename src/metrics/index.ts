import type { MetricEvent, Version } from '../state/types';

export interface Metrics {
  count: number;
  errors: number;
  errorRate: number;
  p99: number;
}

export const WINDOW_MS = 20_000;

/** Version metrics over a sliding window. */
export function computeMetrics(events: MetricEvent[], v: Version, now = Date.now()): Metrics {
  const w = events.filter((e) => e.version === v && e.t >= now - WINDOW_MS);
  const lat = w.map((e) => e.latencyMs).sort((a, b) => a - b);
  const errors = w.filter((e) => e.status >= 500).length;
  return {
    count: w.length,
    errors,
    errorRate: w.length ? errors / w.length : 0,
    p99: lat.length ? lat[Math.ceil(lat.length * 0.99) - 1] : 0,
  };
}
