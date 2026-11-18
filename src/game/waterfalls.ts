import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from './data';
import type { SmokeSrc } from './smoke';
import type { TrackData } from './trackBuilder';
import { macroTexture } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { clamp, color, float, length, mix, oneMinus, sin, smoothstep, texture, time, uv, vec2, vec3 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

/**
 * Canyon-wall waterfalls (Jungle, Aquilaris, Ando Prime) & molten lavafalls (Vulkanwelt).
 * Built as curved multi-step cascade ribbons pouring from tall gorge rims down into animated
 * foaming plunge pools / glowing magma pools at the cliff foot, plus rising mist/smoke columns.
 * Two draw calls total (one merged ribbon mesh, one merged pool mesh), pure TSL shaders.
 */
type Disp = { dispose: () => void }[];

export interface CascadeSpot { x: number; y: number; z: number; lava: boolean }

export function addWaterfalls(
  td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp,
  rng: () => number, smokes: SmokeSrc[], rockMat: THREE.Material,
): CascadeSpot[] {
  const id = theme.id;
  if (id !== 'jungle' && id !== 'lava' && id !== 'aquilaris' && id !== 'ice') return [];
  const isLava = id === 'lava';
  const isIce = id === 'ice';
  const S = td.main.samples, N = S.length;
  const spots: CascadeSpot[] = [];
  const ribbons: THREE.BufferGeometry[] = [];
  const pools: THREE.BufferGeometry[] = [];
  const boulders: THREE.BufferGeometry[] = [];

  const minSpacing = isLava ? 65 : isIce ? 95 : 60; // samples (×2 m)
  const minCliff = isLava ? 20 : 21;
  let lastIdx = -999;

  for (let i = 35; i < N - 35; i += 5) {
    if (i - lastIdx < minSpacing) continue;
    const s = S[i];
    if (s.gap || s.ramp > 0 || s.zeroG) continue;
    // Pick a side with a tall continuous cliff wall over ±8 samples
    const sides = rng() < 0.5 ? [-1, 1] : [1, -1];
    let chosen = 0, H = 0;
    for (const sd of sides) {
      const h0 = sd > 0 ? s.hR : s.hL;
      if (h0 < minCliff || (sd > 0 ? s.openR : s.openL)) continue;
      let ok = true;
      for (let k = -6; k <= 6 && ok; k += 3) {
        const q = S[(i + k + N) % N];
        if ((sd > 0 ? q.hR : q.hL) < minCliff * 0.8 || q.gap) ok = false;
      }
      if (ok) { chosen = sd; H = h0; break; }
    }
    if (!chosen || rng() > (isIce ? 0.5 : 0.72)) continue;
    lastIdx = i;

    const width = (isLava ? 5.5 : 6.2) + rng() * (isLava ? 6.5 : 6.0);
    const fallH = H * (0.86 + rng() * 0.1);
    const ex = s.x + s.rx * chosen * s.hw, ez = s.z + s.rz * chosen * s.hw;
    const baseY = s.y - chosen * s.hw * s.bank + 0.08;
    const topOff = 0.8 + 11.5 * (H / 25); // starts right on the upper canyon ledge
    const botOff = 1.45;                  // lands safely outside the collision wall

    // Curved stepped cascade sheet (cols × rows) bowing outward over cliff ledges
    const cols = 10, rows = 18;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const v = r / rows; // 0 = top crest, 1 = plunge pool
      // Parabolic free-fall curve with two subtle rock-shelf bounces
      const outCurve = topOff * Math.pow(1 - v, 1.35) + botOff * (1 - Math.pow(1 - v, 1.35));
      const shelfBounce = Math.sin(v * Math.PI * 3) * 0.45 * (1 - v) * v;
      const y = baseY + fallH * (1 - v * v * 0.78 - v * 0.22);
      const flare = 1 + v * (isLava ? 0.42 : 0.28); // widens slightly toward plunge pool
      for (let c = 0; c <= cols; c++) {
        const u = c / cols; const across = (u - 0.5) * width * flare;
        const archOut = -Math.sin(u * Math.PI) * (0.55 + 0.35 * Math.sin(v * Math.PI)); // curves toward road
        const lat = outCurve + shelfBounce + archOut;
        pos.push(
          ex + s.rx * chosen * lat + s.tx * across,
          y,
          ez + s.rz * chosen * lat + s.tz * across,
        );
        uvs.push(u, v * (fallH / 12));
      }
      if (r > 0) {
        const a0 = (r - 1) * (cols + 1), b0 = r * (cols + 1);
        for (let c = 0; c < cols; c++) idx.push(a0 + c, a0 + c + 1, b0 + c, a0 + c + 1, b0 + c + 1, b0 + c);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rg.setIndex(idx); rg.computeVertexNormals();
    ribbons.push(rg.toNonIndexed()); rg.dispose();

    // Semicircular foaming plunge pool / glowing molten basin hugging cliff foot
    const px = ex + s.rx * chosen * (botOff + 0.2), pz = ez + s.rz * chosen * (botOff + 0.2);
    const pr = width * 0.58;
    const pg = new THREE.CircleGeometry(pr, 22);
    pg.rotateX(-Math.PI / 2);
    pg.scale(1, 1, 0.52);
    const yaw = Math.atan2(-s.rx * chosen, -s.rz * chosen);
    pg.rotateY(yaw);
    pg.translate(px, baseY + 0.06, pz);
    pools.push(pg.toNonIndexed()); pg.dispose();

    // Framing rocks at crest lip & plunge pool border
    for (const sd of [-0.52, 0.52]) {
      const topR = new THREE.IcosahedronGeometry(1.5 + rng() * 1.1, 1);
      topR.scale(1.2, 0.8, 1.1);
      topR.translate(ex + s.rx * chosen * (topOff - 0.3) + s.tx * (sd * width), baseY + fallH - 0.4, ez + s.rz * chosen * (topOff - 0.3) + s.tz * (sd * width));
      boulders.push(topR.index ? topR.toNonIndexed() : topR);

      const botR = new THREE.IcosahedronGeometry(1.1 + rng() * 0.9, 1);
      botR.scale(1.3, 0.65, 1.1);
      botR.translate(px + s.tx * (sd * width * 1.15), baseY + 0.2, pz + s.tz * (sd * width * 1.15));
      boulders.push(botR.index ? botR.toNonIndexed() : botR);
    }

    // Rising spray mist (waterfalls) or volcanic fume (lavafalls) at plunge pool
    smokes.push({
      x: px, y: baseY + 0.5, z: pz,
      kind: isLava ? 'dark' : 'steam',
      scale: isLava ? 0.34 : 0.28,
    });
    spots.push({ x: px, y: baseY + 2, z: pz, lava: isLava });
  }

  if (!ribbons.length) return [];

  const m = macroTexture();
  const u = uv();
  const speed = isLava ? 0.22 : isIce ? 0.55 : 0.92;
  const edgeFade = smoothstep(0.0, 0.14, u.x).mul(ssInv(1.0, 0.86, u.x));
  const f1 = texture(m, vec2(u.x.mul(1.8), u.y.mul(0.55).sub(time.mul(speed)))).r;
  const f2 = texture(m, vec2(u.x.mul(4.2).add(0.37), u.y.mul(1.25).sub(time.mul(speed * 1.45)))).b;
  const stream = f1.mul(0.55).add(f2.mul(0.45));

  const fallMat = new THREE.MeshStandardNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    roughness: isLava ? 0.42 : 0.14, metalness: isLava ? 0.05 : 0.1,
  });
  if (isLava) {
    // Incandescent yellow-orange magma ribbons separated by dark cooling slag streaks
    const hot = smoothstep(0.32, 0.78, stream);
    const bright = smoothstep(0.68, 0.92, stream);
    fallMat.colorNode = mix(vec3(0.08, 0.04, 0.03), vec3(0.45, 0.12, 0.03), hot);
    fallMat.emissiveNode = mix(color('#c83206'), color('#ffb238'), bright).mul(hot).mul(2.1);
    fallMat.opacityNode = clamp(edgeFade.mul(smoothstep(0.18, 0.45, stream.add(0.2))), 0.0, 0.96);
  } else {
    const bodyCol = color(isIce ? '#9ad4f2' : id === 'aquilaris' ? '#58bce0' : '#68b8b0');
    const foamCol = color(isIce ? '#f2f8ff' : '#eef8f6');
    const foam = smoothstep(0.38, 0.74, stream);
    fallMat.colorNode = mix(bodyCol, foamCol, foam);
    fallMat.emissiveNode = foamCol.mul(foam).mul(0.14);
    fallMat.opacityNode = clamp(edgeFade.mul(float(0.42).add(foam.mul(0.52))), 0.0, 0.92);
  }

  // Plunge-pool animated concentric ripple & foam / magma glow shader
  const poolMat = new THREE.MeshStandardNodeMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    roughness: isLava ? 0.35 : 0.1, metalness: 0.1,
  });
  const pc = uv().sub(0.5).mul(2.0); const pr = length(pc);
  const ring = sin(pr.mul(16.0).sub(time.mul(isLava ? 2.4 : 5.5))).mul(0.5).add(0.5);
  const radial = ssInv(1.0, 0.15, pr);
  if (isLava) {
    const core = ssInv(0.75, 0.0, pr).mul(float(0.7).add(ring.mul(0.3)));
    poolMat.colorNode = vec3(0.12, 0.05, 0.03);
    poolMat.emissiveNode = mix(color('#c83008'), color('#ffa830'), core).mul(radial).mul(2.0);
    poolMat.opacityNode = clamp(radial.mul(0.92), 0.0, 0.95);
  } else {
    const froth = clamp(ssInv(0.45, 0.0, pr).add(ring.mul(0.45).mul(radial)), 0.0, 1.0);
    poolMat.colorNode = mix(color(id === 'jungle' ? '#2c786c' : '#42a8d0'), color('#f2faf8'), froth);
    poolMat.emissiveNode = color('#eaf6f6').mul(froth).mul(0.12);
    poolMat.opacityNode = clamp(radial.mul(float(0.38).add(froth.mul(0.5))), 0.0, 0.88);
  }

  const rGeo = mergeGeometries(ribbons)!; ribbons.forEach(g => g.dispose()); rGeo.computeBoundingSphere();
  const rMesh = new THREE.Mesh(rGeo, fallMat); rMesh.renderOrder = 3; group.add(rMesh);
  const pGeo = mergeGeometries(pools)!; pools.forEach(g => g.dispose()); pGeo.computeBoundingSphere();
  const pMesh = new THREE.Mesh(pGeo, poolMat); pMesh.renderOrder = 2; group.add(pMesh);
  disp.push(rGeo, fallMat, pGeo, poolMat);

  if (boulders.length) {
    const bGeo = mergeGeometries(boulders)!; boulders.forEach(g => g.dispose());
    // Ensure UV attribute exists for rockMat
    if (!bGeo.attributes.uv) bGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bGeo.attributes.position.count * 2), 2));
    bGeo.computeVertexNormals(); bGeo.computeBoundingSphere();
    const bMesh = new THREE.Mesh(bGeo, rockMat); bMesh.castShadow = true; bMesh.receiveShadow = true; group.add(bMesh);
    disp.push(bGeo);
  }
  return spots;
}
