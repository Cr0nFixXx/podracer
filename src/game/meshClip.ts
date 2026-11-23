// Cutting a triangle mesh along an implicit boundary (2026-11-22). Pure: no three import – the node checks use it.

export interface TriBuf { pos: number[]; uv: number[]; ind: number[] }

/** Keeps the part of the triangles of `b` where `inside` is false. A triangle that crosses the boundary is cut along it (bisection on
 *  each crossing edge, new vertices are appended), so nothing sticks in and no slit stays open – dropping or keeping whole triangles
 *  cannot do both. The winding of every triangle is kept. */
export function clipOutside(b: TriBuf, inside: (x: number, y: number, z: number) => boolean) {
  const n0 = b.pos.length / 3, st = new Uint8Array(n0), keep: number[] = [];
  const isIn = (v: number) => { if (!st[v]) st[v] = inside(b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]) ? 2 : 1; return st[v] === 2; };
  const cut = (o: number, i: number) => { // new vertex on the edge from the outside corner `o` towards the inside corner `i`
    const ox = b.pos[o * 3], oy = b.pos[o * 3 + 1], oz = b.pos[o * 3 + 2], dx = b.pos[i * 3] - ox, dy = b.pos[i * 3 + 1] - oy, dz = b.pos[i * 3 + 2] - oz;
    let lo = 0, hi = 1; for (let k = 0; k < 10; k++) { const t = (lo + hi) / 2; if (inside(ox + dx * t, oy + dy * t, oz + dz * t)) hi = t; else lo = t; }
    const v = b.pos.length / 3; b.pos.push(ox + dx * lo, oy + dy * lo, oz + dz * lo);
    b.uv.push(b.uv[o * 2] + (b.uv[i * 2] - b.uv[o * 2]) * lo, b.uv[o * 2 + 1] + (b.uv[i * 2 + 1] - b.uv[o * 2 + 1]) * lo);
    return v;
  };
  for (let t = 0; t < b.ind.length; t += 3) {
    const v = [b.ind[t], b.ind[t + 1], b.ind[t + 2]], f = [isIn(v[0]), isIn(v[1]), isIn(v[2])], cnt = +f[0] + +f[1] + +f[2];
    if (cnt === 0) keep.push(v[0], v[1], v[2]);
    else if (cnt === 1) { const k = f.indexOf(true), a = v[(k + 1) % 3], c = v[(k + 2) % 3], ia = cut(a, v[k]), ic = cut(c, v[k]); keep.push(a, c, ic, a, ic, ia); }
    else if (cnt === 2) { const k = f.indexOf(false), a = v[(k + 1) % 3], c = v[(k + 2) % 3]; keep.push(v[k], cut(v[k], a), cut(v[k], c)); }
  }
  b.ind = keep;
}
