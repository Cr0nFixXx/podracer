import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Session 14 – responsive without scrollbars: the content is laid out at a virtual width (≥ `minW`), measured, and scaled so that it
 * always fits the available box in BOTH directions (down on small windows, up to ×2 on large screens). If height is the limit, the
 * virtual width grows so the layout uses the spare horizontal room instead of leaving bars. The box is a CSS container
 * (`@container`), so `@3xl:` / `@5xl:` variants inside respond to the virtual width, not to the physical viewport.
 */
export function Fit({ children, minW = 1180, maxScale = 2, className = '' }: { children: ReactNode; minW?: number; maxScale?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ w: minW, s: 1, top: 0 });
  useLayoutEffect(() => {
    const o = outer.current, n = inner.current; if (!o || !n) return;
    const fit = () => {
      const vw = o.clientWidth, vh = o.clientHeight; if (!vw || !vh) return;
      const base = vw / vh < 0.8 ? Math.min(minW, 780) : minW; // portrait windows get the narrow (2-column) layout
      let w = base, s = 1, h = 1;
      for (let i = 0; i < 4; i++) {
        n.style.width = w + 'px'; h = n.offsetHeight || 1;           // layout size – unaffected by the CSS transform
        s = Math.min(maxScale, vw / w, vh / h);
        const w2 = Math.max(base, Math.min(vw / s, base * 2.2));      // spare width → wider layout (never narrower: no oscillation)
        if (w2 <= w * 1.015) break; w = w2;
      }
      const top = Math.max(0, (vh - h * s) / 2);
      setSt(p => (Math.abs(p.w - w) < 0.5 && Math.abs(p.s - s) < 0.002 && Math.abs(p.top - top) < 0.5 ? p : { w, s, top }));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(o); ro.observe(n);
    return () => ro.disconnect();
  }, [minW, maxScale]);
  return (
    <div ref={outer} className={`absolute inset-0 overflow-hidden ${className}`}>
      <div ref={inner} className="@container absolute left-1/2" style={{ width: st.w, top: st.top, transform: `translateX(-50%) scale(${st.s})`, transformOrigin: 'top center' }}>{children}</div>
    </div>
  );
}
