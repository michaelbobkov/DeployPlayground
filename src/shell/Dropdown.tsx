import { useEffect, useRef, useState } from 'react';

export interface Option<T extends string> { id: T; label: string; hint?: string }

/** Dropdown list: click, arrows, Enter, Escape, closes on an outside click. */
export function Dropdown<T extends string>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value)!;

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const choose = (i: number) => { onChange(options[i].id); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setHl(options.indexOf(current)); setOpen(true); } else setHl((hl + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((hl - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); choose(hl); }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setHl(options.indexOf(current)); setOpen(!open); }}
        className="flex w-full items-center justify-between rounded bg-slate-800 px-3 py-2 text-left text-sm font-medium text-slate-100 hover:bg-slate-700"
      >
        {current.label}
        <span className={'text-slate-400 transition ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-slate-700 bg-slate-800 shadow-xl">
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              onMouseEnter={() => setHl(i)}
              onClick={() => choose(i)}
              className={'cursor-pointer px-3 py-2 text-sm ' + (i === hl ? 'bg-indigo-600 text-white' : 'text-slate-200') + (o.id === value ? ' font-semibold' : '')}
            >
              {o.label}
              {o.hint && <div className={'text-xs ' + (i === hl ? 'text-indigo-100' : 'text-slate-400')}>{o.hint}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
