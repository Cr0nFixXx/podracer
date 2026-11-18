// Far-tree impostors (session 12): every placed tree also gets a crossed-plane silhouette in ONE instanced draw.
// Dithered fade-in by camera distance exactly where the real tree cells are culled (CellInstancer viewDist),
// so the horizon stays dense without geometry cost. Unlit (fogged distance colour), alpha-tested, no shadows.
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { texture, uv, positionWorld, cameraPosition, length, smoothstep, interleavedGradientNoise, screenCoordinate, vec3, float, instanceIndex, hash, mix } = TSL;

export type ImpostorKind = 'broadleaf' | 'conifer' | 'bush';
const texCache = new Map<ImpostorKind, THREE.CanvasTexture>();

/** Painted silhouette: trunk + lit canopy (top-left light), transparent background. */
export function impostorTexture(kind: ImpostorKind) {
  const hit = texCache.get(kind); if (hit) return hit;
  const W = 128, H = 256; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  let s = kind === 'broadleaf' ? 11 : 29; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#4a3a2c';
  if (kind === 'broadleaf') {
    g.fillRect(W / 2 - 5, H * 0.45, 10, H * 0.55);
    for (let i = 0; i < 60; i++) { // canopy blobs, darker at the bottom/inside
      const a = r() * Math.PI * 2, d = Math.sqrt(r()); const x = W / 2 + Math.cos(a) * d * W * 0.36, y = H * 0.28 + Math.sin(a) * d * H * 0.2;
      const rr = 10 + r() * 16; const l = 0.55 + (1 - (y / (H * 0.5))) * 0.35 + (x < W / 2 ? 0.1 : -0.05) + r() * 0.12;
      g.fillStyle = `rgb(${Math.floor(80 * l)},${Math.floor(125 * l)},${Math.floor(58 * l)})`; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'conifer') {
    g.fillRect(W / 2 - 3, H * 0.8, 6, H * 0.2);
    for (let k = 0; k < 9; k++) { // stacked ragged tiers
      const t = k / 8, y0 = H * (0.85 - t * 0.78), w = (1 - t) * W * 0.46 + 6, hh = H * 0.16;
      const l = 0.55 + t * 0.3; g.fillStyle = `rgb(${Math.floor(55 * l)},${Math.floor(92 * l)},${Math.floor(66 * l)})`;
      g.beginPath(); g.moveTo(W / 2, y0 - hh);
      for (let i = 0; i <= 10; i++) { const f = i / 10; const x = W / 2 - w + f * 2 * w; g.lineTo(x, y0 + (i % 2 ? -4 : 3) * (0.6 + r())); }
      g.closePath(); g.fill();
    }
  }
  if (kind === 'bush') { // neutral blob cluster (session 15) – coloured by the tint, lighter towards the top
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 44; i++) { const a = r() * Math.PI, d = Math.sqrt(r()); const rr = 14 + r() * 20; const x = W / 2 + Math.cos(a) * d * (W * 0.5 - rr), y = Math.min(H - rr * 0.7, H - 8 - Math.sin(a) * d * (H * 0.86 - rr)); const v = Math.floor(255 * Math.min(1, 0.55 + (1 - y / H) * 0.45 + r() * 0.1)); g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  texCache.set(kind, t); return t;
}

/**
 * @param mats tree instance matrices (same as the real trees)  @param w,h impostor size in tree-local units
 * @param fadeIn distance (m) where impostors start to appear  @param tint distance colour multiplier
 */
export function buildImpostors(group: THREE.Group, mats: THREE.Matrix4[], kind: ImpostorKind, w: number, h: number, fadeIn: number, tint: THREE.Color, fadeLen = 180) {
  if (!mats.length) return null;
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0); const b = a.clone().rotateY(Math.PI / 2);
  const geo = new THREE.BufferGeometry();
  const merged = [a, b].map(x => x.toNonIndexed());
  const pos = new Float32Array(merged.reduce((n, x) => n + x.attributes.position.array.length, 0)); const uvs = new Float32Array(pos.length / 3 * 2);
  let o = 0, ou = 0; for (const x of merged) { pos.set(x.attributes.position.array as Float32Array, o); uvs.set(x.attributes.uv.array as Float32Array, ou); o += x.attributes.position.array.length; ou += x.attributes.uv.array.length; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.computeVertexNormals();
  a.dispose(); b.dispose(); merged.forEach(x => x.dispose());
  const tex = impostorTexture(kind);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: true });
  const tx = texture(tex, uv());
  const vary = mix(float(0.85), float(1.15), hash(instanceIndex)); // per-tree brightness variation
  mat.colorNode = tx.rgb.mul(vec3(tint.r, tint.g, tint.b)).mul(vary);
  const d = length(positionWorld.sub(cameraPosition));
  mat.opacityNode = tx.a.mul(smoothstep(fadeIn, fadeIn + fadeLen, d));
  mat.alphaTestNode = interleavedGradientNoise(screenCoordinate.xy).max(0.02);
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere();
  group.add(im);
  return { mesh: im, dispose: () => { geo.dispose(); mat.dispose(); } };
}
