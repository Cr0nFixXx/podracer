// ===== 2026-11-23: plasma heat shield under a pod that flies over lava (look only – user request) =====
// One instanced draw for all pods: a shallow bowl of blue-white plasma below the pod, honeycomb cells, a bright rim and rings that
// run outwards. It fades in over lava and out again behind it; it changes nothing about heat or handling (the lava lake itself does:
// `SurfaceDef.heat`).
import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { abs, dot, instancedBufferAttribute, length, max, min, mix, mod, positionGeometry, pow, sin, smoothstep, step, uniform, varying, vec2, vec3 } = TSL;

/** `strength` (one float per pod, 0 … 1) is written by the game every frame; `time` drives the rings and the flicker. */
export function makeHeatShields(count: number) {
  // the lower cap of a unit sphere, flattened: radius 1 in x and z (scaled to the pod per instance), 0.3 deep, open at the top
  const geo = new THREE.SphereGeometry(1, 32, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5); geo.scale(1, 0.3, 1);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); strength.setUsage(THREE.DynamicDrawUsage);
  const time = uniform(0);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const str = varying(instancedBufferAttribute(strength));
  // (`positionGeometry`, not `positionLocal`: on an instanced mesh the latter is already moved by the instance matrix – world metres;
  //  the pattern then blew up to infinity and the bowl came out as a black disc)
  const p = varying(positionGeometry.xz), r = min(length(p), 1.0); // 0 in the middle … 1 at the rim
  // honeycomb: distance to the nearest cell border (two offset grids of rectangles, the nearer centre wins)
  const q = p.mul(6.5), rr = vec2(1.0, 1.7320508), hh = rr.mul(0.5);
  const a = mod(q, rr).sub(hh), b = mod(q.sub(hh), rr).sub(hh);
  const gv = mix(b, a, step(dot(a, a), dot(b, b))), ag = abs(gv);
  const hd = max(dot(ag, vec2(0.5, 0.8660254)), ag.x); // 0 at a cell's centre … 0.5 on its border
  const cell = smoothstep(0.4, 0.5, hd);
  const ring = pow(sin(r.mul(15.0).sub(time.mul(11.0))).mul(0.5).add(0.5), 3.0);
  const rim = pow(r, 6.0);
  const flick = sin(time.mul(41.0)).mul(0.07).add(0.93);
  // (additive light on dark basalt reads far stronger than its number: 0.14 linear is already a medium blue – keep the fill low,
  //  the lava has to stay visible through the bowl)
  const glow = cell.mul(0.42).add(rim.mul(1.5)).add(ring.mul(0.11)).add(0.012).mul(flick);
  mat.colorNode = mix(vec3(0.1, 0.42, 1.0), vec3(0.8, 0.94, 1.0), min(rim.add(cell.mul(0.25)), 1.0));
  mat.opacityNode = glow.mul(str).mul(0.6);
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'heatShield';
  return { mesh, strength, time: time as { value: number }, dispose: () => { geo.dispose(); mat.dispose(); } };
}
