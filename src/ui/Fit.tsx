import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Session 15 – ONE uniform UI scale for every screen: the window is mapped to a virtual canvas of at least `minW × minH`
 * (1180 × 720) and scaled by `min(width / minW, height / minH)`. Text and controls therefore have the same size on every
 * screen and grow with the window. Screens are designed to fit the 720 px virtual height (flex column, `flex-1` panels).
 * Emergency only: if a screen is taller than the canvas it is shrunk until it fits – `data-fit-shrunk` is then "1"
 * (the layout test fails on it), so no scrollbar can ever appear.
 */
export function Fit({ children, minW = 1180, minH = 720, maxScale = 3, className = '' }: { children: ReactNode; minW?: number; minH?: number; maxScale?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ w: minW, h: minH, s: 1, shrunk: false });
  useLayoutEffect(() => {
    const o = outer.current, n = inner.current; if (!o || !n) return;
    const fit = () => {
      const vw = o.clientWidth, vh = o.clientHeight; if (!vw || !vh) return;
      let s = Math.min(maxScale, vw / minW, vh / minH), w = vw / s, h = vh / s, shrunk = false;
      n.style.width = w + 'px'; n.style.minHeight = h + 'px';
      const need = n.scrollHeight;
      if (need > h + 1.5) { s *= h / need; w = vw / s; h = vh / s; shrunk = true; }
      setSt(p => (Math.abs(p.w - w) < 0.5 && Math.abs(p.h - h) < 0.5 && Math.abs(p.s - s) < 0.001 && p.shrunk === shrunk ? p : { w, h, s, shrunk }));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(o); ro.observe(n);
    return () => ro.disconnect();
  }, [minW, minH, maxScale]);
  return (
    <div ref={outer} className={`absolute inset-0 overflow-hidden ${className}`}>
      <div ref={inner} data-fit-scale={st.s.toFixed(4)} data-fit-shrunk={st.shrunk ? '1' : '0'} className="@container absolute left-0 top-0 flex flex-col"
        style={{ width: st.w, minHeight: st.h, transform: `scale(${st.s})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
