// ===== The powder snow as a real layer of drifts, 1 to 3 m deep, with the trenches the pods cut through it =====
// 2026-11-23 (user: "viel höherer Schnee, richtig 3D"; the step before, 2026-11-22: 0.58 m with pressed trails).
// One grid mesh per powder run (snowField.ts), lying on the road and reaching a little beyond its edges. Both cell arrays of the run
// go into ONE two-channel texture: R = how much is cut away (changes), G = height of the drift (fixed). The vertex shader lifts the
// mesh to the height the snow has now – exactly `SnowField.heightAt` – and throws a shoulder up beside a fresh cut; the fragment
// shader takes the slope from the same texture (the walls of a trench stay crisp between the vertices) and shades fresh snow, cut
// faces and the floor of a trench differently. The texture is uploaded again whenever a pod has cut (`update`).
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { DS } from './trackBuilder';
import { SNOW_CELL, SNOW_FLOOR, SNOW_MAX, SNOW_SUB, type SnowField } from './snowField';
import { macroTexture } from './textures';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { attribute, clamp, cos, float, length, max, min, mix, normalize, positionLocal, positionView, sin, smoothstep, texture, transformNormalToView, uv, vec2, vec3 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** height of the shoulder thrown up beside a cut, as a share of the snow that stood there (at most SNOW_RIM_MAX metres) */
export const SNOW_RIM = 0.34, SNOW_RIM_MAX = 0.8;

export interface SnowDeck { /** uploads the snow field where pods have cut since the last call */ update: () => void }

export function buildSnowDeck(snow: SnowField, geoQ: number, group: THREE.Group, disp: { dispose: () => void }[]): SnowDeck {
  const texs: { tex: THREE.DataTexture; img: Uint8Array; run: { data: Uint8Array; dirty: boolean } }[] = [];
  const q = geoQ >= 2 ? 1 : 2; // cells per vertex ("Niedrig": every second cell)
  for (const run of snow.runs) {
    const { nx, nz, W, samples: S, a, n } = run, cz = DS / SNOW_SUB;
    const img = new Uint8Array(nx * nz * 2); for (let k = 0; k < nx * nz; k++) { img[k * 2] = run.data[k]; img[k * 2 + 1] = run.depth[k]; }
    const tex = new THREE.DataTexture(img, nx, nz, THREE.RGFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
    texs.push({ tex, img, run }); disp.push(tex);

    // ---- material ----
    const mat = new THREE.MeshStandardNodeMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const frame: N = attribute('aFrame', 'vec4'); // aFrame = right.xz, tangent.xz of the road at the vertex
    const tv = (du: number, dv: number): N => texture(tex, uv().add(vec2(du / nx, dv / nz))).level(0); // vertex stage
    const tf = (du: number, dv: number): N => texture(tex, uv().add(vec2(du / nx, dv / nz)));
    /** height of the snow in metres from one texel (r = cut, g = drift): SnowField.heightAt */
    // (the cut is sharpened: bilinear filtering spreads the wall of a trench over a whole cell – this halves it)
    const H = (t: N): N => { const d: N = t.g.mul(SNOW_MAX); return d.sub(d.sub(min(d, float(SNOW_FLOOR))).mul(smoothstep(0.15, 0.85, t.r))); };
    const wp: N = positionLocal.xz; // (the mesh is built in world coordinates)
    const a1: N = wp.x.mul(0.9).add(wp.y.mul(0.35)), b1: N = wp.y.mul(0.7).sub(wp.x.mul(0.2)), c1: N = wp.x.mul(0.11).add(wp.y.mul(0.17));
    // vertex: the snow as it stands now, a shoulder thrown up beside a cut, low wind-blown ripples on untouched snow
    {
      const t0 = tv(0, 0), d0: N = t0.g.mul(SNOW_MAX), around = tv(2, 0).r.add(tv(-2, 0).r).add(tv(0, 2).r).add(tv(0, -2).r).mul(0.25);
      const rim = max(around.sub(t0.r), 0.0).mul(min(d0.mul(SNOW_RIM * 2.2), float(SNOW_RIM_MAX * 2.2)));
      const ripples = sin(a1).mul(sin(b1)).mul(0.05).add(sin(c1).mul(0.1)).mul(float(1).sub(t0.r)).mul(min(d0, float(1.0)));
      mat.positionNode = positionLocal.add(vec3(0, H(t0).add(rim).add(ripples), 0));
    }
    // fragment: slope of the snow surface from the same texture (across = right vector, along = tangent), ripples, fine grain
    const f0: N = tf(0, 0), cut: N = f0.r, d: N = f0.g.mul(SNOW_MAX), dist: N = length(positionView), m = macroTexture();
    const hx1: N = H(tf(1, 0)), hx0: N = H(tf(-1, 0)), hz1: N = H(tf(0, 1)), hz0: N = H(tf(0, -1)), h0: N = H(f0);
    const gx: N = hx1.sub(hx0).mul(1 / (2 * SNOW_CELL)), gz: N = hz1.sub(hz0).mul(1 / (2 * cz));
    // hollow (+) or crest (−): the neighbours stand higher or lower than this point
    const cav: N = clamp(hx1.add(hx0).add(hz1).add(hz0).sub(h0.mul(4)).mul(4.0), -1.0, 1.0);
    const loose: N = float(1).sub(cut).mul(min(d, float(1.0)));
    const wx: N = cos(a1).mul(sin(b1)).mul(0.045).sub(sin(a1).mul(cos(b1)).mul(0.01)).add(cos(c1).mul(0.011)).mul(loose);
    const wz: N = cos(a1).mul(sin(b1)).mul(0.0175).add(sin(a1).mul(cos(b1)).mul(0.035)).add(cos(c1).mul(0.017)).mul(loose);
    const g1: N = texture(m, wp.mul(1 / 6.3)), g2: N = texture(m, wp.mul(1 / 1.7).add(vec2(0.37, 0.11)));
    const grain: N = g1.rg.sub(0.5).mul(0.3).add(g2.rg.sub(0.5).mul(0.3)).mul(smoothstep(170.0, 12.0, dist).oneMinus().oneMinus()).mul(loose.mul(0.7).add(0.3));
    const nW: N = normalize(vec3(
      frame.x.mul(gx).add(frame.z.mul(gz)).add(wx).mul(-1).add(grain.x),
      float(1.0),
      frame.y.mul(gx).add(frame.w.mul(gz)).add(wz).mul(-1).add(grain.y),
    ));
    mat.normalNode = transformNormalToView(nW);
    // Fresh snow is brightest on the crests of the drifts and a little bluer in the hollows between them (less sky reaches them) –
    // that is what lets the eye read the height in flat light. The cut face of a wall is compacted and bluer, the floor of a
    // trench packed and smooth. No shadow map reaches into a trench: the depth below the drift's surface darkens floor and wall feet.
    const steep: N = smoothstep(0.35, 1.3, length(vec2(gx, gz)));
    const packed: N = smoothstep(0.08, 0.85, cut);
    const sunk: N = clamp(d.sub(h0).mul(1 / SNOW_MAX), 0.0, 1.0);
    const crest: N = clamp(d.sub(1.0).mul(0.5), 0.0, 1.0);
    const fresh: N = mix(vec3(0.7, 0.78, 0.91), vec3(0.96, 0.98, 1.0), crest).mul(g1.b.mul(0.07).add(0.95));
    const strata: N = sin(h0.mul(11.0).add(g1.r.mul(3.0))).mul(0.035).mul(steep); // faint layers in a cut face
    const shade: N = float(1).sub(sunk.mul(0.5)).mul(float(1).sub(max(cav, 0.0).mul(0.2))).mul(max(cav.negate(), 0.0).mul(0.06).add(1.0));
    mat.colorNode = mix(mix(fresh, vec3(0.7, 0.8, 0.94), steep.mul(0.8)), vec3(0.66, 0.76, 0.9), packed).mul(shade).mul(strata.add(1.0));
    const glint: N = smoothstep(0.8, 0.96, g2.b).mul(loose).mul(smoothstep(90.0, 8.0, dist).oneMinus().oneMinus());
    mat.roughnessNode = clamp(mix(mix(float(0.92), float(0.78), steep), float(0.52), packed).sub(glint.mul(0.5)), 0.2, 1.0);
    mat.metalness = 0; mat.envMapIntensity = 0.5; mat.name = 'snow';
    disp.push(mat);

    // ---- mesh: rows across the track every `q` cells along it, in chunks of 48 rows (frustum culling) ----
    // (Where the snow thins out – both ends of the run, beyond the road edges – is part of the drift data, not of the mesh.)
    const cols = Math.floor(nx / q) + 1, rows = Math.floor(nz / q) + 1, CH = 48;
    for (let r0 = 0; r0 < rows - 1; r0 += CH) {
      const r1 = Math.min(rows - 1, r0 + CH), nr = r1 - r0 + 1;
      const pos = new Float32Array(nr * cols * 3), nor = new Float32Array(nr * cols * 3), uvs = new Float32Array(nr * cols * 2), fr = new Float32Array(nr * cols * 4);
      for (let r = r0; r <= r1; r++) {
        const v = r * q, kf = Math.min(n - 1, (v - SNOW_SUB / 2) / SNOW_SUB), k0 = Math.max(0, Math.min(n - 2, Math.floor(kf))), t = Math.max(0, Math.min(1, kf - k0));
        const A = S[a + k0], B = S[a + k0 + 1], L = (x: number, y: number) => x + (y - x) * t;
        const sx = L(A.x, B.x), sz = L(A.z, B.z), sy = L(A.y + A.ramp, B.y + B.ramp), hw = L(A.hw, B.hw), bank = L(A.bank, B.bank);
        let rx = L(A.rx, B.rx), rz = L(A.rz, B.rz), tx = L(A.tx, B.tx), tz = L(A.tz, B.tz);
        const rl = Math.hypot(rx, rz) || 1, tl = Math.hypot(tx, tz) || 1; rx /= rl; rz /= rl; tx /= tl; tz /= tl;
        for (let c = 0; c < cols; c++) {
          const lat = -W + c * q * SNOW_CELL, over = Math.max(0, Math.abs(lat) - hw), o = ((r - r0) * cols + c);
          const y = sy - Math.max(-hw, Math.min(hw, lat)) * bank + 0.05 - over * 0.55; // beyond the road edge the layer dips into the ground
          pos[o * 3] = sx + rx * lat; pos[o * 3 + 1] = y; pos[o * 3 + 2] = sz + rz * lat; nor[o * 3 + 1] = 1;
          uvs[o * 2] = (c * q) / nx; uvs[o * 2 + 1] = v / nz;
          fr[o * 4] = rx; fr[o * 4 + 1] = rz; fr[o * 4 + 2] = tx; fr[o * 4 + 3] = tz;
        }
      }
      const ind: number[] = [];
      for (let r = 0; r < nr - 1; r++) for (let c = 0; c < cols - 1; c++) { const i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1; ind.push(i0, i1, i2, i1, i3, i2); } // (tangent × right points down: this order faces up)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.setAttribute('aFrame', new THREE.BufferAttribute(fr, 4)); g.setIndex(ind);
      g.computeBoundingSphere(); if (g.boundingSphere) g.boundingSphere.radius += SNOW_MAX + 1; // (the shader lifts the layer)
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.name = 'snowDeck'; group.add(mesh); disp.push(g);
    }
  }
  return { update: () => { for (const t of texs) if (t.run.dirty) { const d = t.run.data, im = t.img; for (let k = 0; k < d.length; k++) im[k * 2] = d[k]; t.tex.needsUpdate = true; t.run.dirty = false; } } };
}
