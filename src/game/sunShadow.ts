// ===== Sun shadows: range, depth and soft ends (2026-11-23) =====
// Reported by the user after a test drive on „Ultra": „eine Schattenwand schiebt sich vor dem Pod her" – the shadow of a canyon wall
// ended in a line about 100 m ahead of the pod and travelled with it. Two causes, both fixed here:
//  1. Cascaded shadows („Ultra"): three's CSMShadowNode clones the sun's shadow camera for every cascade (near 20, far 620) and puts
//     each cascade's light `lightMargin` up-sun of the cascade's box. The far cascade's box is about 2000 m across – its depth range
//     ended in mid-air above the ground, so the far cascade shaded almost nothing and all shadows stopped at the split (104 m).
//     → every cascade gets a depth range that spans its whole box (`tune`), a bias in metres and a normal offset by its texel size.
//  2. One shadow map (other presets): outside the map a fragment simply counts as lit – a hard line 148 m ahead.
//     → a larger box, placed further ahead, and the shadow fades out over the outer fifth of the map (`fade` below).
// The light stands `SH_BACK` up-sun of what it shades. Two reasons: tall casters far up-sun still have to throw their shadow, and
// under a low sun (dusk: 4.5°) the square of the map lies stretched 13-fold on the ground – with the light only 360 m back, most of
// the map lay behind the light or beyond its far plane.
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, dot, float, max, mix, positionWorld, shadow, smoothstep, uniform } = TSL;

/** Distance of the shadow light up-sun of its target (single map) / of a cascade's box (CSM `lightMargin`), metres. */
export const SH_BACK = 2000;
/** Single map: how far beyond its target the light still shades (the ground under a low sun: half the box ÷ tan 4.5°). */
export const SH_BEYOND = 2400;
/** One shadow map, by shadow quality 1 … 3: half width of the box, how far ahead of the player its centre lies, map size. */
export const SH_BOX = [
  { ext: 0, ahead: 0, map: 0 },
  { ext: 120, ahead: 76, map: 1024 },  // reaches 196 m ahead, 0.23 m per texel
  { ext: 150, ahead: 95, map: 1536 },  // 245 m, 0.20 m
  { ext: 180, ahead: 115, map: 2048 }, // 295 m, 0.18 m
] as const;
/** Cascaded shadows: where they end (they fade out over the last quarter) and where the crisp near cascade hands over. */
export const CSM_FAR = 700, CSM_SPLIT = 0.16;
/** Scenery (rock rows, scattered rocks) throws shadows up to this distance when the shadows are cascaded. */
const CSM_DECOR_REACH = 420;

type Cascade = { shadow: THREE.LightShadow & { autoUpdate: boolean; needsUpdate: boolean } };

export interface SunShadow {
  /** cascaded shadows, or null (one map) */ csm: CSMShadowNode | null;
  /** texel of the single map in metres (the game snaps the shadow box to it), 0 = no shadows */ texel: number;
  /** centre of the single map: metres ahead of the player */ ahead: number;
  /** how far away scenery still has to throw shadows, metres */ reach: number;
  /** shadow quality switched live (single map only) */ setQuality(q: number): void;
  /** every frame, after the sun and its target have been placed: `centre` = the target, the two axes of the light's plane */
  update(centre: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void;
  /** the camera's field of view changed: the cascades follow */ onFov(): void;
  dispose(): void;
}

export function setupSunShadow(sun: THREE.DirectionalLight, quality: number, cascaded: boolean): SunShadow {
  const state = { q: quality };
  const box = () => SH_BOX[Math.max(0, Math.min(3, state.q))] ?? SH_BOX[2];
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  const ext = uniform(1), centre = uniform(new THREE.Vector3()), right = uniform(new THREE.Vector3(1, 0, 0)), up = uniform(new THREE.Vector3(0, 0, 1));
  const applyBox = () => {
    const b = box(); if (!b.map) return;
    sun.shadow.mapSize.set(b.map, b.map);
    cam.left = -b.ext; cam.right = b.ext; cam.top = b.ext; cam.bottom = -b.ext; cam.near = 20; cam.far = SH_BACK + SH_BEYOND; cam.updateProjectionMatrix();
    const texel = b.ext * 2 / b.map;
    sun.shadow.bias = -(0.3 + 0.5 * texel) / (cam.far - cam.near); // metres of depth → the map's 0 … 1
    sun.shadow.normalBias = 0.65;
    ext.value = b.ext;
  };
  applyBox();

  let csm: CSMShadowNode | null = null, tuned = false, frame = 0;
  const farAt = new THREE.Vector3(1e9, 0, 0); // where the far cascade was last rendered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let base: any = null;
  if (cascaded && quality > 0) {
    csm = new CSMShadowNode(sun, { cascades: 2, maxFar: CSM_FAR, mode: 'custom', lightMargin: SH_BACK, customSplitsCallback: (_n: number, _near: number, _far: number, out: number[]) => { out.push(CSM_SPLIT, 1); } });
    csm.fade = true; sun.shadow.shadowNode = csm;
  } else {
    // one map: fade the shadow out towards the edge of the map (measured in the light's plane, where the map is a square).
    // (Installed even when the shadows are off at the start: they can be switched on while the race runs.)
    base = shadow(sun);
    const d = positionWorld.sub(centre), edge = max(abs(dot(d, right)), abs(dot(d, up))).div(ext);
    sun.shadow.shadowNode = mix(base, float(1), smoothstep(0.76, 0.97, edge));
  }
  /** Depth range, bias and normal offset of every cascade (their lights exist only after the first material has been built). */
  const tune = () => {
    const lights = (csm as unknown as { lights: Cascade[] } | null)?.lights; if (!lights || !lights.length) return false;
    lights.forEach((l, i) => {
      const sh = l.shadow, c = sh.camera as THREE.OrthographicCamera, size = c.right - c.left, texel = size / sh.mapSize.width;
      c.near = 20; c.far = SH_BACK + size + 40; c.updateProjectionMatrix(); // (`size` = the longest diagonal of the cascade's slice ≥ its depth along the light)
      sh.bias = -(0.3 + 0.5 * texel) / (c.far - c.near);
      sh.normalBias = Math.max(0.65, 1.7 * texel);
      sh.autoUpdate = i === 0; // the far cascade is rendered every second frame (see `update`)
    });
    return true;
  };

  return {
    csm,
    get texel() { const b = box(); return b.map ? b.ext * 2 / b.map : 0; },
    get ahead() { return box().ahead; },
    get reach() { const b = box(); return !b.map ? 150 : csm ? CSM_DECOR_REACH : Math.max(150, b.ext + b.ahead); },
    setQuality(q: number) { if (csm) return; state.q = q; applyBox(); },
    update(c, r, u) {
      centre.value.copy(c); right.value.copy(r); up.value.copy(u);
      if (!csm) return;
      if (!tuned) tuned = tune();
      // The far cascade holds the whole visible world (about 2 km across): render it every second frame. Its map and its matrix
      // stay a pair – three updates the matrix only when it renders the map – and its box has hundreds of metres of slack.
      // After a jump of the camera (respawn, replay cut, a still picture in the test harness) it is rendered at once.
      const lights = (csm as unknown as { lights: Cascade[] }).lights;
      if (tuned && lights[1] && ((frame++ & 1) === 0 || farAt.distanceToSquared(c) > 400)) { lights[1].shadow.needsUpdate = true; farAt.copy(c); }
    },
    onFov() { if (!csm || !csm.camera) return; csm.updateFrustums(); tuned = tune(); },
    dispose() { csm?.dispose(); base?.dispose?.(); },
  };
}
