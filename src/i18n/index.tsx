import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { de } from './de';
import { en } from './en';
import { ru, type Dict, type Key } from './ru';

export type Lang = 'ru' | 'en' | 'de';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ru', label: 'RU' },
  { id: 'en', label: 'EN' },
  { id: 'de', label: 'DE' },
];

/** A "key + parameters" message: lets the model (router) return texts without being tied to a language. */
export interface Msg { k: Key; p?: Record<string, string | number> }

const dicts: Record<Lang, Dict> = { ru, en, de };
const STORAGE_KEY = 'dp-lang'; // also read by the instance windows (same origin)

let current: Lang = 'en';

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const s = dicts[lang][key] ?? dicts.en[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (_, n) => (n in params ? String(params[n]) : `{${n}}`)) : s;
}

/** For code outside React (for example the text in a new window). */
export const tr = (key: Key, params?: Record<string, string | number>) => translate(current, key, params);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'en' || saved === 'de') return saved;
  } catch { /* ignore */ }
  return 'en'; // English is the default; the choice is remembered once the user switches
}

/** The platform takes the language from a cookie (it builds the reason and error texts), windows from localStorage. */
function persist(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, params?: Record<string, string | number>) => string;
  /** Expand a model message. */
  m: (msg: Msg) => string;
}
const C = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detect());
  useEffect(() => { persist(lang); }, [lang]);
  const t = useCallback((key: Key, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
  const value = useMemo<Ctx>(
    () => ({ lang, setLang: setLangState, t, m: (msg) => t(msg.k, msg.p) }),
    [lang, t],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useI18n() {
  const c = useContext(C);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}

export type { Key };
