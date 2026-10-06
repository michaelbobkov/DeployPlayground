import type { Decision, Req, State, Strategy, Version } from '../state/types';
import { STRATEGIES } from '../state/types';

export function normalizeId(userId: string): string {
  return userId.trim().toLowerCase() || 'anonymous';
}

/** X-Beta is emulated by ID parity: an odd numeric ID gets the update; for names — the parity of the sum of character codes. */
export function isBeta(userId: string): boolean {
  const id = userId.trim();
  if (/^\d+$/.test(id)) return Number(id) % 2 === 1;
  let sum = 0;
  for (const ch of id.toLowerCase()) sum += ch.codePointAt(0)!;
  return sum % 2 === 1;
}

/** Stable number 0..99 (FNV-1a) — the basis of sticky canary. */
export function hashBucket(userId: string): number {
  let h = 0x811c9dc5;
  for (const ch of normalizeId(userId)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

const podName = (v: Version, req: Req) => `${v}-pod-${(hashBucket(req.userId) % 3) + 1}`;

/**
  * Pure function: all the strategy logic lives here.
  * s.base is the old version, s.target the new one; the strategy decides who gets which.
 */
export function route(req: Req, strategy: Strategy, s: State): Decision {
  const { base, target } = s;
  switch (strategy) {
    case 'recreate':
      if (s.recreate === 'paused')
        return { version: null, pod: '—', reason: { k: 'model.recreatePaused' } };
      {
        const v = s.recreate === 'new' ? target : base;
        return { version: v, pod: podName(v, req), reason: { k: s.recreate === 'new' ? 'model.recreateNew' : 'model.recreateOld', p: { v } } };
      }
    case 'rolling': {
      const idx = s.rr % s.podsTotal;
      const v = idx < s.rollingReady ? target : base;
      return {
        version: v,
        pod: `pod-${idx + 1}`,
        reason: { k: 'model.rolling', p: { i: idx + 1, n: s.podsTotal, r: s.rollingReady, v } },
      };
    }
    case 'bluegreen': {
      const v = s.activeColor === 'green' ? target : base;
      return { version: v, pod: podName(v, req), reason: { k: 'model.bluegreen', p: { c: s.activeColor, v } } };
    }
    case 'canary': {
      const b = hashBucket(req.userId);
      const v = b < s.weight ? target : base;
      return {
        version: v,
        pod: podName(v, req),
        reason: { k: 'model.canary', p: { id: normalizeId(req.userId), b, op: b < s.weight ? '<' : '≥', w: s.weight, v } },
      };
    }
    case 'shadow':
      return {
        version: base,
        shadow: s.shadowOn ? target : undefined,
        pod: podName(base, req),
        reason: s.shadowOn ? { k: 'model.shadowOn', p: { base, target } } : { k: 'model.shadowOff', p: { base } },
      };
    case 'ab': {
      const beta = isBeta(req.userId);
      const v = beta ? target : base;
      return { version: v, pod: podName(v, req), reason: { k: beta ? 'model.abOdd' : 'model.abEven', p: { id: normalizeId(req.userId), v } } };
    }
  }
}

export function compareAll(req: Req, s: State): Record<Strategy, Decision> {
  const out = {} as Record<Strategy, Decision>;
  for (const { id } of STRATEGIES) out[id] = route(req, id, s);
  return out;
}
