'use client';

import { ReactNode, SelectHTMLAttributes, ButtonHTMLAttributes } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Button({
  children, variant = 'default', className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium ' +
    'transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap';
  const styles = {
    default: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
    primary: 'bg-white text-brand hover:bg-white/90',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  return <button className={cx(base, styles, className)} {...rest}>{children}</button>;
}

export function Select({
  className, children, ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-[12.5px] text-slate-700',
        'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/30 max-w-[210px]',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Slider({
  value, min, max, step = 1, onChange, label, display,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; label: string; display?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] text-white/80">{label}</span>
        <span className="text-[11px] font-mono text-white">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-white h-1.5 cursor-pointer"
      />
    </div>
  );
}

export function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full group"
    >
      <span className="text-[12px] text-white/90 group-hover:text-white">{label}</span>
      <span
        className={cx(
          'relative w-8 h-[18px] rounded-full transition-colors shrink-0',
          checked ? 'bg-white/90' : 'bg-white/30',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all',
            checked ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </span>
    </button>
  );
}

export function Stat({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-white/10 border border-white/15 px-2.5 py-2">
      <div className="text-[9.5px] uppercase tracking-wide text-white/60 font-semibold">{label}</div>
      <div className={cx('mt-0.5 text-[13.5px] text-white', mono && 'font-mono')}>{value}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-white/15 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-wider text-white/65 font-semibold mb-2.5">{title}</div>
      {children}
    </div>
  );
}
