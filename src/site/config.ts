import type { Lang } from '../i18n';

/** Prototype site versions: each has its own texts, color and dynamic block. Stored in the cluster (ConfigMap platform-site); the pods read them through the platform. */
export interface SiteVersion {
  id: string; // v1, v2, v3 …
  title: string;
  greeting: string; // {name} is replaced by the user ID
  desc: string;
  color: string;
  dynTitle: string;
  dynLines: string; // one message per line
  dynSeconds: number;
}

export interface SiteConfig {
  versions: SiteVersion[];
}

type V = Omit<SiteVersion, 'id' | 'color' | 'dynSeconds'>;
const NL = '\n';
const TEXTS: Record<Lang, [V, V]> = {
  ru: [
    { title: 'Shop', greeting: 'Hello, {name}!', desc: 'Classic shop. Cosy design.', dynTitle: 'Now on the website', dynLines: ['🔥 Discount 20% till evening', '📦 Free delivery up 50 €', '🎁 Present for the first order'].join(NL) },
    { title: 'Shop 2.0', greeting: 'Welcome, {name}!', desc: 'New shop: fresh design.', dynTitle: 'News and diescounts', dynLines: ['⭐ Premiere: smart lights', '🤖 Personal recommendations', '🚀 Delivery in 2 hours'].join(NL) },
  ],
  en: [
    { title: 'Shop', greeting: 'Hello, {name}!', desc: 'The classic shop. Calm design.', dynTitle: 'Right now on the site', dynLines: ['🔥 20% off everything until tonight', '📦 Free shipping from €50', '🎁 A gift with your first order'].join(NL) },
    { title: 'Shop 2.0', greeting: 'Welcome, {name}!', desc: 'The new shop: fresh design and recommendations.', dynTitle: 'New and on sale', dynLines: ['⭐ New: smart lamp', '🤖 Personal recommendations', '🚀 Delivery in 2 hours'].join(NL) },
  ],
  de: [
    { title: 'Shop', greeting: 'Hallo, {name}!', desc: 'Der klassische Shop. Ruhiges Design.', dynTitle: 'Gerade auf der Seite', dynLines: ['🔥 20 % auf alles bis heute Abend', '📦 Kostenloser Versand ab 50 €', '🎁 Geschenk zur ersten Bestellung'].join(NL) },
    { title: 'Shop 2.0', greeting: 'Willkommen, {name}!', desc: 'Der neue Shop: frisches Design und Empfehlungen.', dynTitle: 'Neu und im Angebot', dynLines: ['⭐ Neu: smarte Lampe', '🤖 Persönliche Empfehlungen', '🚀 Lieferung in 2 Stunden'].join(NL) },
  ],
};

/** Default versions in the interface language (afterwards they are ordinary data — edit them freely). */
export const defaultSite = (lang: Lang): SiteConfig => ({
  versions: [
    { id: 'v1', color: '#1d4ed8', dynSeconds: 3, ...TEXTS[lang][0] },
    { id: 'v2', color: '#16a34a', dynSeconds: 3, ...TEXTS[lang][1] },
  ],
});

const PALETTE = ['#d946ef', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6', '#84cc16'];

export const versionColor = (site: SiteConfig, id: string | null) =>
  site.versions.find((v) => v.id === id)?.color ?? '#64748b';

export function nextVersion(site: SiteConfig, from: SiteVersion): SiteVersion {
  const n = Math.max(0, ...site.versions.map((v) => parseInt(v.id.slice(1), 10) || 0)) + 1;
  return { ...from, id: `v${n}`, color: PALETTE[(n - 3 + PALETTE.length) % PALETTE.length] };
}
