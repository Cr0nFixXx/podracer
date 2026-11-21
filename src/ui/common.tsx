import type { ReactNode } from 'react';

export function Btn({ children, onClick, active, className = '', big, disabled }: { children: ReactNode; onClick?: () => void; active?: boolean; className?: string; big?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`font-display uppercase tracking-[0.18em] transition-all duration-150 border clip-corner
        ${big ? 'px-8 py-4 text-lg' : 'px-4 py-2 text-xs'}
        ${active ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.5)]' : 'bg-black/50 text-amber-100 border-amber-500/40 hover:bg-amber-500/20 hover:border-amber-300'}
        ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={`bg-gradient-to-b from-stone-900/85 to-black/85 border border-amber-500/25 backdrop-blur-md clip-corner p-4 ${className}`}>
      {title && <div className="font-display text-amber-300 text-sm tracking-[0.3em] uppercase mb-3 flex items-center gap-3"><span className="w-6 h-px bg-amber-400" />{title}</div>}
      {children}
    </div>
  );
}

export function StatBar({ label, value, bonus = 0 }: { label: string; value: number; bonus?: number }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] uppercase tracking-widest text-stone-300 mb-1"><span>{label}</span><span className="text-amber-300 tabular-nums">{Math.round((value + bonus) * 100)}</span></div>
      <div className="h-2 bg-stone-800 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 to-amber-300" style={{ width: `${Math.min(100, value * 80)}%` }} />
        {bonus > 0 && <div className="absolute inset-y-0 bg-cyan-400" style={{ left: `${Math.min(100, value * 80)}%`, width: `${Math.min(100 - value * 80, bonus * 80)}%` }} />}
      </div>
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="block mb-1.5">
      <div className="flex justify-between text-[11px] uppercase tracking-widest text-stone-300"><span>{label}</span><span className="text-amber-300 tabular-nums">{fmt ? fmt(value) : value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-amber-400" />
    </label>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center justify-between w-full py-1 text-[11px] uppercase tracking-widest text-stone-300 hover:text-white">
      <span>{label}</span>
      <span className={`w-10 h-5 rounded-full relative transition ${value ? 'bg-amber-400' : 'bg-stone-700'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-all ${value ? 'left-5' : 'left-0.5'}`} /></span>
    </button>
  );
}
