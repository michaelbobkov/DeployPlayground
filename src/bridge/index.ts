import { tr } from '../i18n';

/**
  * Browser windows in which the instances are open. The site is loaded through the platform gateway
  * at /i/<instanceId>/ — the cluster, not the shell, picks the version, pod and node.
 */
const wins = new Map<string, Window>();

export const instanceUrl = (id: string) => `/i/${encodeURIComponent(id)}/`;

/** Opens an empty window synchronously (inside a click handler, otherwise the browser blocks it). */
export function openBlank(slot: number): Window | null {
  const w = window.open('about:blank', '_blank', `popup=yes,width=440,height=620,left=${80 + slot * 36},top=${60 + slot * 36}`);
  if (w) w.document.write('<body style="font-family:sans-serif;background:#0f172a;color:#94a3b8;padding:24px">' + tr('win.connecting') + '</body>');
  return w;
}

export function attach(id: string, w: Window) {
  wins.set(id, w);
  w.location.href = instanceUrl(id);
}

export function getWindow(id: string): Window | undefined {
  const w = wins.get(id);
  return w && !w.closed ? w : undefined;
}

/** Shows the window or opens it again (for example after the shell was reloaded). Call from a click. */
export function showWindow(id: string, slot: number): boolean {
  const w = getWindow(id);
  if (w) { w.focus(); return true; }
  const n = window.open(instanceUrl(id), 'dp-' + id, `popup=yes,width=440,height=620,left=${80 + slot * 36},top=${60 + slot * 36}`);
  if (n) wins.set(id, n);
  return !!n;
}

export function reloadWindow(id: string) {
  getWindow(id)?.location.reload();
}

export function closeWindow(id: string) {
  wins.get(id)?.close();
  wins.delete(id);
}

export function closedWindowIds(): string[] {
  return [...wins.entries()].filter(([, w]) => w.closed).map(([id]) => id);
}

window.addEventListener('beforeunload', () => wins.forEach((w) => w.close()));
