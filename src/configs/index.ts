import type { Key } from '../i18n';
import type { State, Version } from '../state/types';

type T = (key: Key, params?: Record<string, string | number>) => string;

/** The last gateway decision (used to highlight a line). */
export interface LastDecision { action: 'open' | 'rollback'; version: Version | null; shadow?: Version }

export type Kind = 'k8s' | 'argo' | 'istio';
/** tag — the outcome a line belongs to (highlighted when the decision matches) */
export interface Line { t: string; tag?: 'v1' | 'v2' | 'shadow' | 'down' }

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'k8s', label: 'Kubernetes' },
  { id: 'argo', label: 'Argo Rollouts' },
  { id: 'istio', label: 'Istio' },
];

const L = (t: string, tag?: Line['tag']): Line => ({ t, tag });
const split = (s: string) => s.split('\n').map((t) => L(t));

export function buildConfig(kind: Kind, s: State, t: T): Line[] {
  // the templates are written for v1 (old) and v2 (new) — substitute the selected versions
  const map = (l: Line): Line => ({ ...l, t: l.t.replace(/\bv([12])\b/g, (_, n) => (n === '1' ? s.base : s.target)) });
  return rawConfig(kind, s, t).map(map);
}

function rawConfig(kind: Kind, s: State, t: T): Line[] {
  const N = s.podsTotal, R = s.rollingReady, w = s.weight;
  const color = s.activeColor;
  const notSupported = (what: string) => [L(`# ${what}`), L(`# ${t('cfg.seeOthers')}`)];

  if (kind === 'k8s') {
    switch (s.strategy) {
      case 'recreate':
        return [
          ...split(`apiVersion: apps/v1\nkind: Deployment\nmetadata: { name: shop }\nspec:\n  replicas: ${N}`),
          L('  strategy:'), L(`    type: Recreate   # ${t('cfg.recreateFirst')}`, s.recreate === 'paused' ? 'down' : undefined),
          ...split('  template:\n    spec:\n      containers:'),
          L(`      - image: shop:${s.recreate === 'new' ? 'v2' : 'v1'}`, s.recreate === 'paused' ? undefined : s.recreate === 'new' ? 'v2' : 'v1'),
        ];
      case 'rolling':
        return [
          ...split(`apiVersion: apps/v1\nkind: Deployment\nmetadata: { name: shop }\nspec:\n  replicas: ${N}\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxSurge: ${s.maxSurge}\n      maxUnavailable: ${s.maxUnavailable}`),
          L(`# ${t('cfg.rollingNew', { R, N })}`, 'v2'),
          L(`# ${t('cfg.rollingOld', { from: R + 1, N })}`, 'v1'),
        ];
      case 'bluegreen':
        return [
          ...split('# Deployments: shop-blue (shop:v1), shop-green (shop:v2)\napiVersion: v1\nkind: Service\nmetadata: { name: shop }\nspec:\n  selector:\n    app: shop'),
          L(`    color: ${color}   # ${t('cfg.switch')}`, color === 'green' ? 'v2' : 'v1'),
        ];
      case 'canary':
        return [
          L(`# ${t('cfg.canaryShare')}`),
          L(`# Deployment shop-stable  replicas: ${10 - Math.round(w / 10)}   image: shop:v1`, 'v1'),
          L(`# Deployment shop-canary  replicas: ${Math.round(w / 10)}   image: shop:v2`, 'v2'),
          L(`# ${t('cfg.canaryReal')}`),
        ];
      default:
        return notSupported(t('cfg.k8sNoMirror'));
    }
  }

  if (kind === 'argo') {
    const head = split('apiVersion: argoproj.io/v1alpha1\nkind: Rollout\nmetadata: { name: shop }\nspec:\n  strategy:');
    switch (s.strategy) {
      case 'recreate': return [L(`# ${t('cfg.argoNoRecreate')}`, s.recreate === 'paused' ? 'down' : undefined)];
      case 'rolling':
        return [...head, ...split(`    rollingUpdate:\n      maxSurge: ${s.maxSurge}\n      maxUnavailable: ${s.maxUnavailable}`), L(`# ${t('cfg.argoRollingNew', { R, N, p: Math.round((R / N) * 100) })}`, 'v2'), L(`# ${t('cfg.argoRollingOld', { n: N - R })}`, 'v1')];
      case 'bluegreen':
        return [...head, L('    blueGreen:'), L('      activeService: shop-green   # v2', color === 'green' ? 'v2' : undefined), L('      previewService: shop-blue    # v1', color === 'blue' ? 'v1' : undefined), L('      autoPromotionEnabled: false')];
      case 'canary':
        return [...head, L('    canary:'), L('      stableService: shop-stable', 'v1'), L('      canaryService: shop-canary', 'v2'), L('      steps:'), L(`      - setWeight: ${w}`, 'v2'), L('      - pause: {}'), L('      analysis: { templates: [{ templateName: error-rate }] }')];
      case 'ab':
        return [...head, ...split('    canary:\n      trafficRouting: { istio: { virtualService: { name: shop } } }\n      steps:\n      - setHeaderRoute:\n          name: beta\n          match:'), L('          - headerName: X-Beta', 'v2'), L('            headerValue: { exact: "true" }', 'v2'), L(`      # ${t('cfg.argoOthers')}`, 'v1')];
      case 'shadow':
        return [...head, ...split('    canary:\n      trafficRouting: { istio: { virtualService: { name: shop } } }\n      steps:'), L('      - setMirrorRoute:', 'shadow'), L('          name: mirror', 'shadow'), L('          percentage: 100', 'shadow'), L(`      # ${t('cfg.argoMirror')}`, 'v1')];
    }
  }

  // istio
  const vs = split('apiVersion: networking.istio.io/v1\nkind: VirtualService\nmetadata: { name: shop }\nspec:\n  hosts: [shop]\n  http:');
  switch (s.strategy) {
    case 'recreate':
      return [...vs, L(`  - fault: { abort: { httpStatus: 503, percentage: { value: 100 } } }  # ${t('cfg.istioFault')}`, 'down'), L(`    route: [{ destination: { host: shop, subset: ${s.recreate === 'new' ? 'v2' : 'v1'} } }]`, s.recreate === 'new' ? 'v2' : 'v1')];
    case 'rolling':
    case 'bluegreen':
    case 'canary': {
      const w2 = s.strategy === 'canary' ? w : s.strategy === 'rolling' ? Math.round((R / N) * 100) : color === 'green' ? 100 : 0;
      return [...vs, L('  - route:'), L(`    - destination: { host: shop, subset: v1 }  weight: ${100 - w2}`, 'v1'), L(`    - destination: { host: shop, subset: v2 }  weight: ${w2}`, 'v2')];
    }
    case 'ab':
      return [...vs, L('  - match:'), L('    - headers: { x-beta: { exact: "true" } }', 'v2'), L('    route: [{ destination: { host: shop, subset: v2 } }]', 'v2'), L('  - route: [{ destination: { host: shop, subset: v1 } }]', 'v1')];
    case 'shadow':
      return [...vs, L('  - route: [{ destination: { host: shop, subset: v1 } }]', 'v1'), L(`    mirror: { host: shop, subset: v2 }${s.shadowOn ? '' : `   # ${t('cfg.istioOff')}`}`, s.shadowOn ? 'shadow' : undefined), L('    mirrorPercentage: { value: 100 }', s.shadowOn ? 'shadow' : undefined)];
  }
}

export function isHighlighted(line: Line, s: State, last?: LastDecision): boolean {
  if (!last || !line.tag || last.action === 'rollback') return false;
  if (line.tag === 'shadow') return !!last.shadow;
  if (line.tag === 'down') return last.version === null;
  return last.version === (line.tag === 'v1' ? s.base : s.target);
}
