// ===== Flight decor in the world (2026-11-25): who flies where, how it moves, what the holo boards show =====
// Replaces the airships (`case 'balloons'` in world.ts: 40 × detail × track length, standing still in the sky). The models and the
// count per world come from flyerGeo.ts (`flyerPlan`: 20 % fewer than the airships).
//   craft           – fly slow circles round an anchor point beside the track, 60 m and more above every road below the circle
//                     (the intro flight passes 20–35 m above the road), nose along the path, leaning into the turn
//   spectator boxes – hover beside the road round the start line and rise and sink like the lifts of the Mos Espa arena
//   holo boards     – hover beyond the road edge on every world, their picture turned towards the pods that come
// `flyerSpots` says where everything is (no three.js, the node checks run it on every track); `addFlyers` builds and moves it:
// at most 12 instanced draw calls a track, no shadows, under 100 instance matrices written per frame.
import * as THREE from 'three';
import type { ThemeDef } from './data';
import { mulberry32, type Sample, type TrackData } from './trackBuilder';
import { flyerGeometry, flyerPlan, HOLO_W, type FlyerPlan } from './flyerGeo';

type Disp = { dispose: () => void }[];
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

export type CraftKind = 'barge' | 'freighter' | 'cloudCar' | 'transport';
const CRAFT_KINDS: CraftKind[] = ['barge', 'freighter', 'cloudCar', 'transport'];
/** How a kind of craft flies: distance of its anchor from the road edge, height above the highest road under its circle, radius
 *  of the circle (m), speed (m/s), size factor, lean into the turn (rad), colour of what glows, tints of the single craft
 *  (multiply the vertex colours). */
const CRAFT: Record<CraftKind, { dist: [number, number]; high: [number, number]; radius: [number, number]; speed: [number, number]; size: [number, number]; bank: number; glow: string; tints: string[] }> = {
  barge: { dist: [150, 900], high: [70, 130], radius: [220, 480], speed: [6, 10], size: [0.95, 1.25], bank: 0.03, glow: '#ffb060', tints: ['#ffffff', '#fff0d8', '#e8ecff', '#ffe0c8'] },
  freighter: { dist: [200, 1100], high: [110, 220], radius: [300, 650], speed: [14, 26], size: [0.9, 1.3], bank: 0.12, glow: '#58b4ff', tints: ['#ffffff', '#eef2ff', '#fff4e4', '#e4e8ec'] },
  cloudCar: { dist: [80, 500], high: [60, 120], radius: [140, 320], speed: [22, 38], size: [1.7, 2.3], bank: 0.3, glow: '#ffb868', tints: ['#ffffff', '#ffffff', '#fff2c0', '#e8f0ff'] },
  transport: { dist: [400, 1400], high: [180, 300], radius: [500, 900], speed: [5, 9], size: [0.55, 0.8], bank: 0.02, glow: '#58b4ff', tints: ['#ffffff', '#f2f4f6', '#fff6ea'] },
};
/** Size of a holo board in the world: the picture of the model (10 × 5.6 m) times this. The roads are 70–110 m wide and a board
 *  stands beyond the edge – at 16 m width it was a speck from the middle of the road. · Size of a spectator box. */
export const HOLO_SIZE = 2.5, BOX_SIZE = 1.4;
/** Different pictures on the holo boards. */
export const HOLO_ADS = 4;
/** A craft passes this far above what stands under its circle (m). */
export const CLEAR = 30;

/** A craft: centre of its circle, flight height, radius, angular speed (rad/s, the sign is the direction), start angle, size,
 *  how far it bobs up and down (m), which tint. */
export interface CraftPath { x: number; y: number; z: number; r: number; w: number; ph: number; size: number; bob: number; tint: number }
/** A spectator box: road sample it stands at, side (−1 / 1), lowest position, heading, how far it rises (m), how fast (rad/s). */
export interface BoxSpot { i: number; side: number; x: number; y: number; z: number; yaw: number; rise: number; w: number; ph: number }
/** A holo board: road sample, side, position of the projector, heading of the picture, which picture. */
export interface BoardSpot { i: number; side: number; x: number; y: number; z: number; yaw: number; ad: number }
export interface FlyerSpots { plan: FlyerPlan; craft: Partial<Record<CraftKind, CraftPath[]>>; boxes: BoxSpot[]; boards: BoardSpot[] }

/** Where the flight decor of a track is. `detail` = the graphics setting (0.2 … 1.6); `heightAt` = terrain height; `seed` = any
 *  number that is the same for the same track; `taken` = where something stands already (centre and radius of its footprint, m);
 *  `tall` = what reaches up to where craft fly (footprint and height of its top: table mountains, rock needles, landmarks). */
export function flyerSpots(td: TrackData, theme: ThemeDef, heightAt: (x: number, z: number) => number, detail: number, seed: number, taken: { x: number; z: number; r: number }[] = [], tall: { x: number; z: number; r: number; top: number }[] = []): FlyerSpots {
  const S = td.main.samples, N = td.N, rnd = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const dens = Math.min(2.6, Math.max(1, N / 3000) * 1.2); // (as `place()` in world.ts scaled the airships)
  const plan = flyerPlan(theme.id, theme.decor.includes('flyers'), detail * dens);
  const out: FlyerSpots = { plan, craft: {}, boxes: [], boards: [] };
  const W = (i: number): Sample => S[td.main.closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i))];
  const onTrack = (i: number) => td.main.closed || (i >= 4 && i <= N - 5);
  const free = (s: Sample) => !(s.roof > 0) && !s.zeroG && !s.gap && s.ramp === 0 && !s.bridge && !s.underpass;
  /** open road for 60 m before and behind (a tunnel mouth, a bridge or a tube is wider than its road) */
  const open60 = (i: number) => { for (let k = -30; k <= 30; k += 5) if (!free(W(i + k))) return false; return true; };
  const roomAt = (x: number, z: number, r: number) => !taken.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r) ** 2);
  /** nothing stands on the line of `half` m to both sides of a point (direction dx, dz) – a board is wide and thin */
  const roomOnLine = (x: number, z: number, dx: number, dz: number, half: number, gap: number) => !taken.some(b => {
    const px = b.x - x, pz = b.z - z, t = Math.max(-half, Math.min(half, px * dx + pz * dz)), ex = px - dx * t, ez = pz - dz * t;
    return ex * ex + ez * ez < (b.r + gap) ** 2;
  });
  /** a ramp up to 80 m ahead (its viewing decks) or up to 260 m behind (pods come flying) */
  const rampNear = (i: number) => { for (let k = -130; k <= 40; k += 2) if (W(i + k).ramp > 0 || W(i + k).gap) return true; return false; };
  const startNear = (i: number, n: number) => { const d = Math.abs(i - td.startIdx); return Math.min(d, td.main.closed ? N - d : d) < n || (!td.main.closed && Math.abs(i - td.finishIdx) < n); };

  // ---------- craft: circles round an anchor ----------
  for (const kind of CRAFT_KINDS) {
    const n = plan[kind]; if (!n) continue;
    const P = CRAFT[kind], list: CraftPath[] = out.craft[kind] = [];
    for (let c = 0; c < n; c++) {
      // Up to six tries for a circle on which nothing reaches up to the craft; if there is none, the one that needs the least lift.
      let best: { x: number; z: number; r: number; y: number; lift: number } | null = null;
      for (let tr = 0; tr < 6; tr++) {
        const s = S[Math.floor(rnd() * N)], ang = rnd() * Math.PI * 2, d = P.dist[0] + Math.pow(rnd(), 1.5) * (P.dist[1] - P.dist[0]) + s.hw;
        const r = P.radius[0] + rnd() * (P.radius[1] - P.radius[0]), x = s.x + Math.cos(ang) * d, z = s.z + Math.sin(ang) * d;
        // its height counts from the highest road inside and near the circle and from the ground under the circle …
        let ground = s.y; const reach = (r + 120) ** 2;
        for (let i = 0; i < N; i += 3) { const q = S[i]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < reach && q.y > ground) ground = q.y; }
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ground = Math.max(ground, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
        const want = ground + P.high[0] + rnd() * (P.high[1] - P.high[0]);
        // … and what stands under the circle (table mountain, rock needle, landmark) is cleared by 30 m
        let over = -Infinity; for (const b of tall) if (Math.abs(Math.hypot(b.x - x, b.z - z) - r) < b.r + 45 && b.top > over) over = b.top;
        const y = Math.max(want, over + CLEAR), lift = y - want;
        if (!best || lift < best.lift) best = { x, z, r, y, lift };
        if (lift === 0) break;
      }
      const { x, z, r, y } = best!, speed = P.speed[0] + rnd() * (P.speed[1] - P.speed[0]), bob = 1 + rnd() * 2;
      list.push({ x, z, y: y + bob, r, w: (rnd() < 0.5 ? -1 : 1) * speed / r, ph: rnd() * Math.PI * 2, size: P.size[0] + rnd() * (P.size[1] - P.size[0]), bob, tint: Math.floor(rnd() * P.tints.length) });
    }
  }

  // ---------- spectator boxes: beside the road round the start line (52 … 430 m before and behind it) ----------
  for (let k = 0; k < 24 && out.boxes.length < plan.box; k++) {
    const i = td.startIdx + (k % 2 ? -1 : 1) * (26 + Math.floor(k / 2) * 17), side = (k >> 1) % 2 ? 1 : -1;
    if (!onTrack(i)) continue;
    const s = W(i);
    if (!free(s) || (side > 0 ? s.hR : s.hL) >= 8 || (side > 0 ? s.openR : s.openL)) continue; // (a row of rocks at the edge is no hindrance, a cliff is)
    // between the posts at the road edge (to 9 m) and the front of the grandstands (roof from 22.5 m): a box is 7.6 m deep
    const lat = side * (s.hw + 14 + rnd() * 4), x = s.x + s.rx * lat, z = s.z + s.rz * lat;
    if (!roomAt(x, z, 5.5)) continue;
    // (the console at the platform's front, local +z, looks at the road; its long side lies along the track)
    out.boxes.push({ i: ((i % N) + N) % N, side, x, z, y: Math.max(s.y, heightAt(x, z)) + 4.5 + rnd() * 3, yaw: Math.atan2(-side * s.rx, -side * s.rz), rise: 9 + rnd() * 8, w: (Math.PI * 2) / (18 + rnd() * 14), ph: rnd() * Math.PI * 2 });
  }

  // ---------- holo boards: on every world, beside open road that is not a tight bend ----------
  const cs = Math.cos(0.42), sn = Math.sin(0.42), half = HOLO_W * HOLO_SIZE * 0.5;
  for (let k = 0; k < plan.holo; k++) {
    const i0 = Math.floor((k + 0.37) / plan.holo * N);
    search: for (const curvMax of [0.007, 0.02]) for (let j = 0; j < 120; j++) { // the nearest sample with free road; a bend only if there is no straighter place
      const i = i0 + (j % 2 ? -1 : 1) * Math.ceil(j / 2) * 3;
      if (!onTrack(i - 30) || !onTrack(i + 30)) continue;
      const s = W(i);
      if (!open60(i) || Math.abs(s.curv) > curvMax || rampNear(i) || startNear(i, 110)) continue;
      if (out.boards.some(b => { const d = Math.abs(b.i - (((i % N) + N) % N)); return Math.min(d, N - d) < 60; })) continue; // (never two within 120 m)
      for (const side of [k % 2 ? 1 : -1, k % 2 ? -1 : 1]) {
        if ((side > 0 ? s.hR : s.hL) >= 8) continue; // (a row of rocks at the edge is no hindrance, a cliff is)
        // its near end 11 m beyond the edge: behind the masts and posts that stand there
        const lat = side * (s.hw + 11 + half * 0.92), x = s.x + s.rx * lat, z = s.z + s.rz * lat, gy = heightAt(x, z);
        if (gy - s.y > 5) continue; // (it would stand up on a rim, above the pods' heads)
        // the picture (local +z) faces back along the road, turned 24° towards it
        const fx = -s.tx * cs - side * s.rx * sn, fz = -s.tz * cs - side * s.rz * sn;
        if (!roomOnLine(x, z, fz, -fx, half, 2)) continue;
        // and nothing between it and the road: no gate foot, mast or arrow board in front of the picture
        { const mid = side * (s.hw + 6.5); if (!roomOnLine(s.x + s.rx * mid, s.z + s.rz * mid, s.rx, s.rz, 4.5, 4)) continue; }
        out.boards.push({ i: ((i % N) + N) % N, side, x, z, y: Math.max(s.y, gy) + 6, yaw: Math.atan2(fx, fz), ad: out.boards.length % HOLO_ADS });
        break search;
      }
    }
  }
  return out;
}

/** The pictures of the holo boards, one atlas of 2 × 2 (512 × 288 each): a dark pane you can see through, with frame, sign and
 *  writing in light on it. (Dark, because a pale pane disappeared against the bright haze of the desert.) */
function holoAtlas(): THREE.Texture {
  const W = 512, H = 288, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d')!;
  const ads: { tint: string; pane: string; title: string; sub: string; logo: (cx: number, cy: number, r: number) => void }[] = [
    { tint: '#a6ecff', pane: '#06344c', title: 'REPULSOR-TEC', sub: 'SCHWEBT. IMMER.', logo: (cx, cy, r) => { for (const k of [1, 0.66, 0.34]) { x.beginPath(); x.ellipse(cx, cy + (1 - k) * r * 0.9, r * k, r * k * 0.34, 0, 0, Math.PI * 2); x.stroke(); } } },
    { tint: '#ffd493', pane: '#4c2604', title: 'KESSEL FUEL', sub: '12 PARSEC POWER', logo: (cx, cy, r) => { x.beginPath(); x.moveTo(cx, cy - r); x.bezierCurveTo(cx + r, cy - r * 0.2, cx + r * 0.7, cy + r, cx, cy + r); x.bezierCurveTo(cx - r * 0.7, cy + r, cx - r, cy - r * 0.2, cx, cy - r); x.stroke(); x.beginPath(); x.arc(cx, cy + r * 0.45, r * 0.3, 0, Math.PI * 2); x.fill(); } },
    { tint: '#fff2a8', pane: '#453804', title: 'GRAND ARENA', sub: 'BOONTA EVE CLASSIC', logo: (cx, cy, r) => { for (const sx of [-1, 1]) { x.beginPath(); x.arc(cx + sx * r * 0.55, cy - r * 0.35, r * 0.3, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(cx + sx * r * 0.55, cy - r * 0.05); x.lineTo(cx, cy + r * 0.8); x.stroke(); } x.beginPath(); x.arc(cx, cy + r * 0.8, r * 0.16, 0, Math.PI * 2); x.fill(); } },
    { tint: '#baffc2', pane: '#063c18', title: 'TOYDARIAN PARTS', sub: 'NO REPUBLIC CREDITS', logo: (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r : r * 0.74; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.stroke(); x.beginPath(); x.arc(cx, cy, r * 0.32, 0, Math.PI * 2); x.stroke(); } },
  ];
  x.clearRect(0, 0, W * 2, H * 2);
  ads.forEach((ad, i) => {
    const ox = (i % 2) * W, oy = Math.floor(i / 2) * H;
    x.save(); x.beginPath(); x.rect(ox + 2, oy + 2, W - 4, H - 4); x.clip(); x.translate(ox, oy); // (2 px of nothing round each picture: no bleeding between neighbours)
    x.globalAlpha = 0.66; x.fillStyle = ad.pane; x.fillRect(8, 8, W - 16, H - 16);                              // the pane
    x.globalAlpha = 0.16; x.fillStyle = ad.tint; for (let y = 10; y < H - 8; y += 5) x.fillRect(8, y, W - 16, 2); // scan lines
    x.globalAlpha = 1; x.strokeStyle = ad.tint; x.fillStyle = ad.tint; x.lineWidth = 5; x.lineJoin = 'round';
    x.strokeRect(9, 9, W - 18, H - 18);
    x.lineWidth = 7; ad.logo(86, H * 0.42, 54);
    x.textBaseline = 'middle'; x.font = '900 46px "Arial Black", "Segoe UI", Arial, sans-serif';
    const tw = x.measureText(ad.title).width, room = W - 184; x.save(); x.translate(160, H * 0.36); x.scale(Math.min(1, room / tw), 1); x.fillText(ad.title, 0, 0); x.restore();
    x.font = '700 22px "Segoe UI", Arial, sans-serif'; x.fillText(ad.sub, 162, H * 0.58);
    x.globalAlpha = 0.8; for (let k = 0; k < 9; k++) x.fillRect(162 + k * 36, H * 0.76, 22 + (k * 7 % 3) * 5, 10); // a line of small print
    x.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}

export interface Flyers { /** every frame */ update(t: number): void; spots: FlyerSpots }

/** Builds the flight decor of a track into `group` (parameters as `flyerSpots`). Mesh names `flyer:<kind>` (the test harness finds a craft by them). */
export function addFlyers(td: TrackData, theme: ThemeDef, group: THREE.Group, disp: Disp, heightAt: (x: number, z: number) => number, detail: number, seed: number, taken: { x: number; z: number; r: number }[] = [], tall: { x: number; z: number; r: number; top: number }[] = []): Flyers {
  const spots = flyerSpots(td, theme, heightAt, detail, seed, taken, tall);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.28 }); disp.push(bodyMat);
  const mk = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, moving: boolean) => {
    const im = new THREE.InstancedMesh(geo, mat, n); im.name = name; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    if (moving) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im); disp.push(geo); return im;
  };
  const updates: ((t: number) => void)[] = [];

  for (const kind of CRAFT_KINDS) {
    const fly = spots.craft[kind]; if (!fly?.length) continue;
    const P = CRAFT[kind], g = flyerGeometry(kind), n = fly.length, glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).multiplyScalar(1.7) }); disp.push(glowMat);
    const body = mk('flyer:' + kind, g.body, bodyMat, n, true), glow = g.glow ? mk('flyer:' + kind + ':glow', g.glow, glowMat, n, true) : null;
    fly.forEach((f, i) => body.setColorAt(i, col.set(P.tints[f.tint])));
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    updates.push(t => {
      for (let i = 0; i < n; i++) {
        const f = fly[i], a = f.ph + f.w * t, dir = Math.sign(f.w);
        // on the circle at angle a; it flies along the tangent (−sin, cos) × dir and leans towards the centre
        q.setFromAxisAngle(UP, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir)); q2.setFromAxisAngle(FWD, dir * P.bank); q.multiply(q2);
        m4.compose(v.set(f.x + Math.cos(a) * f.r, f.y + Math.sin(t * 0.21 + f.ph) * f.bob, f.z + Math.sin(a) * f.r), q, sc.setScalar(f.size));
        body.setMatrixAt(i, m4); glow?.setMatrixAt(i, m4);
      }
      body.instanceMatrix.needsUpdate = true; if (glow) glow.instanceMatrix.needsUpdate = true;
    });
  }

  if (spots.boxes.length) {
    const g = flyerGeometry('box'), body = mk('flyer:box', g.body, bodyMat, spots.boxes.length, true);
    updates.push(t => {
      spots.boxes.forEach((p, i) => { m4.compose(v.set(p.x, p.y + p.rise * (0.5 - 0.5 * Math.cos(t * p.w + p.ph)), p.z), q.setFromAxisAngle(UP, p.yaw), sc.setScalar(BOX_SIZE)); body.setMatrixAt(i, m4); });
      body.instanceMatrix.needsUpdate = true;
    });
  }

  if (spots.boards.length && typeof document !== 'undefined') {
    const boards = spots.boards, g = flyerGeometry('holo'), body = mk('flyer:holo', g.body, bodyMat, boards.length, false);
    const tex = holoAtlas(), picMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.4), transparent: true, depthWrite: false });
    disp.push(tex, picMat);
    boards.forEach((b, i) => { m4.compose(v.set(b.x, b.y, b.z), q.setFromAxisAngle(UP, b.yaw), sc.setScalar(HOLO_SIZE)); body.setMatrixAt(i, m4); });
    for (let ad = 0; ad < HOLO_ADS; ad++) { // one mesh per picture: the same quad with the texture coordinates of its quarter of the atlas
      const mine = boards.filter(b => b.ad === ad); if (!mine.length) continue;
      const pg = g.glow!.clone(), uv = pg.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, (uv.getX(j) + (ad % 2)) / 2, 1 - (1 - uv.getY(j) + Math.floor(ad / 2)) / 2);
      const im = mk('flyer:holo:pic' + ad, pg, picMat, mine.length, false); im.renderOrder = 3;
      mine.forEach((b, i) => { m4.compose(v.set(b.x, b.y, b.z), q.setFromAxisAngle(UP, b.yaw), sc.setScalar(HOLO_SIZE)); im.setMatrixAt(i, m4); });
    }
    g.glow!.dispose();
    updates.push(t => { const f = 1 + 0.07 * Math.sin(t * 23) * Math.sin(t * 3.1) + (Math.sin(t * 0.9) > 0.985 ? -0.4 : 0); picMat.color.setScalar(1.4 * f); picMat.opacity = Math.min(1, f); }); // a hologram never quite holds still
  }

  const update = (t: number) => { for (const u of updates) u(t); };
  update(0);
  return { update, spots };
}
