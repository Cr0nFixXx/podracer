// ===== 2026-11-22: the powder snow as a real layer of snow – fine relief, and the trails the pods press into it =====
// One grid mesh per powder run (snowField.ts), lying on the road and reaching a little beyond its edges. The vertex shader lifts it by
// the depth of the loose snow and lowers it where the snow field says "packed"; around a trail the snow is thrown up into a rim. The
// fragment shader shades the trails from the same field, so they stay crisp between the vertices. The field is a one-channel texture
// that is uploaded again whenever a pod has stamped (`update`).
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { DS } from './trackBuilder';
import { SNOW_CELL, SNOW_SUB, type SnowField } from './snowField';
import { macroTexture } from './textures';

// TSL typings are stricter than the runtime → loosely typed on purpose (see CLAUDE.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { attribute, clamp, cos, float, length, max, mix, normalize, positionLocal, positionView, sin, smoothstep, texture, transformNormalToView, uv, vec2, vec3 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** depth of the loose snow over the road, how much of it a firm trail presses away, height of the thrown-up rim (metres) */
export const SNOW_THICK = 0.58, SNOW_PRESS = 0.68, SNOW_RIM = 0.4; // (a firm trail still lies 0.19 m above the road: the road mesh below has a relief of its own)

export interface SnowDeck { /** uploads the snow field where pods have stamped since the last call */ update: () => void }

export function buildSnowDeck(snow: SnowField, geoQ: number, group: THREE.Group, disp: { dispose: () => void }[]): SnowDeck {
  const texs: [THREE.DataTexture, { dirty: boolean }][] = [];
  const q = geoQ >= 2 ? 1 : 2; // cells per vertex ("Niedrig": every second cell)
  for (const run of snow.runs) {
    const { nx, nz, W, samples: S, a, n } = run, cz = DS / SNOW_SUB;
    const tex = new THREE.DataTexture(run.data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
    texs.push([tex, run]); disp.push(tex);

    // ---- material ----
    const mat = new THREE.MeshStandardNodeMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const edge: N = attribute('aEdge', 'float'), frame: N = attribute('aFrame', 'vec4'); // aFrame = right.xz, tangent.xz of the road at the vertex
    const tv = (du: number, dv: number): N => texture(tex, uv().add(vec2(du / nx, dv / nz))).level(0).r; // vertex stage
    const tf = (du: number, dv: number): N => texture(tex, uv().add(vec2(du / nx, dv / nz))).r;
    const wp: N = positionLocal.xz; // (the mesh is built in world coordinates)
    const a1: N = wp.x.mul(0.9).add(wp.y.mul(0.35)), b1: N = wp.y.mul(0.7).sub(wp.x.mul(0.2)), c1: N = wp.x.mul(0.11).add(wp.y.mul(0.17));
    // vertex: loose snow, pressed down by the trail, thrown up beside it, with low wind-blown waves on top
    {
      const p0 = tv(0, 0), around = tv(2, 0).add(tv(-2, 0)).add(tv(0, 2)).add(tv(0, -2)).mul(0.25);
      const rim = max(around.sub(p0), 0.0).mul(SNOW_RIM * 2.2);
      const waves = sin(a1).mul(sin(b1)).mul(0.05).add(sin(c1).mul(0.1)).mul(float(1).sub(p0));
      mat.positionNode = positionLocal.add(vec3(0, float(SNOW_THICK).mul(float(1).sub(p0.mul(SNOW_PRESS))).add(rim).add(waves).mul(edge), 0));
    }
    // fragment: slope of the snow surface from the same field (across = right vector, along = tangent), waves, fine grain
    const p: N = tf(0, 0), dist: N = length(positionView), m = macroTexture();
    const gx: N = tf(1, 0).sub(tf(-1, 0)).mul(-SNOW_THICK * SNOW_PRESS * 1.5 / (2 * SNOW_CELL)), gz: N = tf(0, 1).sub(tf(0, -1)).mul(-SNOW_THICK * SNOW_PRESS * 1.5 / (2 * cz));
    const loose: N = float(1).sub(p);
    const wx: N = cos(a1).mul(sin(b1)).mul(0.045).sub(sin(a1).mul(cos(b1)).mul(0.01)).add(cos(c1).mul(0.011)).mul(loose);
    const wz: N = cos(a1).mul(sin(b1)).mul(0.0175).add(sin(a1).mul(cos(b1)).mul(0.035)).add(cos(c1).mul(0.017)).mul(loose);
    const g1: N = texture(m, wp.mul(1 / 6.3)), g2: N = texture(m, wp.mul(1 / 1.7).add(vec2(0.37, 0.11)));
    const grain: N = g1.rg.sub(0.5).mul(0.3).add(g2.rg.sub(0.5).mul(0.42)).mul(smoothstep(170.0, 12.0, dist).oneMinus().oneMinus()).mul(loose.mul(0.7).add(0.3));
    const nW: N = normalize(vec3(
      frame.x.mul(gx).add(frame.z.mul(gz)).add(wx).mul(-1).add(grain.x),
      float(1.0),
      frame.y.mul(gx).add(frame.w.mul(gz)).add(wz).mul(-1).add(grain.y),
    ));
    mat.normalNode = transformNormalToView(mix(vec3(0, 1, 0), nW, edge.mul(0.85).add(0.15)));
    const packed: N = smoothstep(0.08, 0.85, p);
    mat.colorNode = mix(vec3(0.9, 0.93, 0.97).mul(g1.b.mul(0.07).add(0.95)), vec3(0.7, 0.79, 0.9), packed).mul(float(1).sub(packed.mul(0.1)));
    const glint: N = smoothstep(0.8, 0.96, g2.b).mul(loose).mul(smoothstep(90.0, 8.0, dist).oneMinus().oneMinus());
    mat.roughnessNode = clamp(mix(float(0.92), float(0.52), packed).sub(glint.mul(0.5)), 0.2, 1.0);
    mat.metalness = 0; mat.envMapIntensity = 0.5; mat.name = 'snow';
    disp.push(mat);

    // ---- mesh: rows across the track every `q` cells along it, in chunks of 48 rows (frustum culling) ----
    const cols = Math.floor(nx / q) + 1, rows = Math.floor(nz / q) + 1, CH = 48;
    for (let r0 = 0; r0 < rows - 1; r0 += CH) {
      const r1 = Math.min(rows - 1, r0 + CH), nr = r1 - r0 + 1;
      const pos = new Float32Array(nr * cols * 3), nor = new Float32Array(nr * cols * 3), uvs = new Float32Array(nr * cols * 2), fr = new Float32Array(nr * cols * 4), ed = new Float32Array(nr * cols);
      for (let r = r0; r <= r1; r++) {
        const v = r * q, kf = Math.min(n - 1, (v - SNOW_SUB / 2) / SNOW_SUB), k0 = Math.max(0, Math.min(n - 2, Math.floor(kf))), t = Math.max(0, Math.min(1, kf - k0));
        const A = S[a + k0], B = S[a + k0 + 1], L = (x: number, y: number) => x + (y - x) * t;
        const sx = L(A.x, B.x), sz = L(A.z, B.z), sy = L(A.y + A.ramp, B.y + B.ramp), hw = L(A.hw, B.hw), bank = L(A.bank, B.bank);
        let rx = L(A.rx, B.rx), rz = L(A.rz, B.rz), tx = L(A.tx, B.tx), tz = L(A.tz, B.tz);
        const rl = Math.hypot(rx, rz) || 1, tl = Math.hypot(tx, tz) || 1; rx /= rl; rz /= rl; tx /= tl; tz /= tl;
        const endF = Math.max(0, Math.min(1, Math.min(v, nz - v) / 24)), endK = endF * endF * (3 - 2 * endF); // the layer thins out towards both ends of the run
        for (let c = 0; c < cols; c++) {
          const lat = -W + c * q * SNOW_CELL, over = Math.max(0, Math.abs(lat) - hw), o = ((r - r0) * cols + c);
          const y = sy - Math.max(-hw, Math.min(hw, lat)) * bank + 0.05 - over * 0.55; // beyond the road edge the snow slopes down into the ground
          pos[o * 3] = sx + rx * lat; pos[o * 3 + 1] = y; pos[o * 3 + 2] = sz + rz * lat; nor[o * 3 + 1] = 1;
          uvs[o * 2] = (c * q) / nx; uvs[o * 2 + 1] = v / nz;
          fr[o * 4] = rx; fr[o * 4 + 1] = rz; fr[o * 4 + 2] = tx; fr[o * 4 + 3] = tz;
          ed[o] = endK * Math.max(0, Math.min(1, 1 - over / 2.5));
        }
      }
      const ind: number[] = [];
      for (let r = 0; r < nr - 1; r++) for (let c = 0; c < cols - 1; c++) { const i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1; ind.push(i0, i1, i2, i1, i3, i2); } // (tangent × right points down: this order faces up)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.setAttribute('aFrame', new THREE.BufferAttribute(fr, 4)); g.setAttribute('aEdge', new THREE.BufferAttribute(ed, 1)); g.setIndex(ind);
      g.computeBoundingSphere(); if (g.boundingSphere) g.boundingSphere.radius += 2; // (the shader lifts the layer)
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.name = 'snowDeck'; group.add(mesh); disp.push(g);
    }
  }
  return { update: () => { for (const [tex, run] of texs) if (run.dirty) { tex.needsUpdate = true; run.dirty = false; } } };
}
