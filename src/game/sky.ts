import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { atan, cameraProjectionMatrix, cross, dot, exp, float, floor, fract, length, max, mix, modelViewMatrix, normalize, oneMinus, positionLocal, pow, sin, smoothstep, step, uniform, vec2, vec3, vec4 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

export function sunDirection(theme: ThemeDef) {
  const el = theme.sunElev * Math.PI / 180, az = theme.sunAz * Math.PI / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

/** Procedural sky dome (TSL): gradient, sun + halo, fbm clouds; Oovo IV adds stars, asteroid belt and a ringed gas giant. */
export function sunDirection2(theme: ThemeDef) {
  const el = (theme.sunElev - 2.5) * Math.PI / 180, az = (theme.sunAz + 7) * Math.PI / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

export function makeSky(theme: ThemeDef) {
  const uniforms = {
    top: uniform(new THREE.Color(theme.skyTop)), horizon: uniform(new THREE.Color(theme.skyHorizon)), sunColor: uniform(new THREE.Color(theme.sunColor)),
    sunDir: uniform(sunDirection(theme)), clouds: uniform(theme.clouds), stars: uniform(theme.terrain === 'prison' ? 1.0 : 0.0), time: uniform(0),
    sun2: uniform(theme.id === 'desert' || theme.id === 'mesa' ? 1.0 : 0.0), sunDir2: uniform(sunDirection2(theme)), // Tatooine twin suns
  };
  const h21 = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
  const noise = (p: N) => {
    const i = floor(p), f = fract(p); const s = f.mul(f).mul(float(3).sub(f.mul(2)));
    return mix(mix(h21(i), h21(i.add(vec2(1, 0))), s.x), mix(h21(i.add(vec2(0, 1))), h21(i.add(vec2(1, 1))), s.x), s.y);
  };
  const fbm = (p: N, oct = 6) => { let s = float(0), a = 0.5, q = p; for (let k = 0; k < oct; k++) { s = s.add(noise(q).mul(a)); q = q.mul(2.03); a *= 0.5; } return s; };

  const d = normalize(positionLocal);
  const sd = max(dot(d, normalize(uniforms.sunDir)), 0.0);
  let col = mix(uniforms.horizon, uniforms.top, pow(max(d.y, 0.0), 0.55));
  col = mix(col, uniforms.horizon.mul(0.6), ssInv(0.0, -0.25, d.y));
  col = col.add(uniforms.sunColor.mul(pow(sd, 6.0).mul(0.35).add(pow(sd, 64.0).mul(0.8))));
  // clouds
  const cuv = d.xz.div(max(d.y, 0.0).add(0.08)).mul(1.6).add(vec2(uniforms.time.mul(0.004), uniforms.time.mul(0.002)));
  const cov = smoothstep(oneMinus(uniforms.clouds), oneMinus(uniforms.clouds).add(0.35), fbm(cuv));
  let cc = mix(uniforms.horizon.mul(1.1), vec3(1), 0.5).mul(pow(sd, 4.0).mul(0.5).add(0.75));
  cc = mix(cc, uniforms.sunColor.mul(1.4), pow(sd, 12.0).mul(0.6));
  col = mix(col, cc, cov.mul(smoothstep(0.0, 0.15, d.y)).mul(0.85));
  col = col.add(uniforms.sunColor.mul(smoothstep(0.9993, 0.9997, sd).mul(12.0)));
  const sdB = max(dot(d, normalize(uniforms.sunDir2)), 0.0);
  col = col.add(uniforms.sunColor.mul(vec3(1.0, 0.82, 0.62)).mul(smoothstep(0.99955, 0.99975, sdB).mul(9.0).add(pow(sdB, 48.0).mul(0.3))).mul(uniforms.sun2));

  // night sky of the prison moon (blended by `stars`)
  const cell = floor(d.mul(260.0)); const starH = h21(cell.xy.add(cell.z.mul(vec2(17.31, 41.7))));
  let night = col.add(vec3(0.85, 0.9, 1.0).mul(step(0.996, starH)).mul(smoothstep(-0.1, 0.3, d.y)));
  const belt = normalize(vec3(d.x, d.y.mul(0.4).sub(0.15), d.z));
  const band = exp(pow(d.y.add(0.05).mul(9.0), 2.0).negate());
  night = night.add(vec3(0.35, 0.3, 0.25).mul(band).mul(fbm(vec2(atan(belt.z, belt.x).mul(3.0), belt.y.mul(20.0)), 5)).mul(0.8));
  const gp = normalize(vec3(-0.25, 0.32, 0.91));
  const along = dot(d, gp); const front = step(0.0, along);
  const gdist = length(cross(d, gp));
  const disc = ssInv(0.13, 0.125, gdist).mul(front);
  const planetCol = mix(vec3(0.62, 0.5, 0.36), vec3(0.85, 0.72, 0.5), fbm(d.xy.mul(40).add(3), 5)).mul(ssInv(0.13, 0.0, gdist).mul(0.45).add(0.55));
  night = mix(night, planetCol, disc);
  const axis = normalize(vec3(0.55, 0.75, -0.35));
  const radialV = d.sub(gp.mul(along)); const radial = length(radialV);
  const tilt = dot(normalize(radialV.add(1e-5)), axis).abs();
  const ring = smoothstep(0.16, 0.17, radial).mul(oneMinus(smoothstep(0.3, 0.32, radial))).mul(ssInv(0.045, 0.01, tilt)).mul(oneMinus(disc)).mul(front);
  const gap = ssInv(0.004, 0.0, radial.sub(0.23).abs().sub(0.004));
  night = night.add(vec3(0.62, 0.55, 0.42).mul(ring).mul(oneMinus(gap)).mul(0.85));

  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  mat.colorNode = mix(col, night, uniforms.stars);
  // always at the far plane (z = w) – independent of the camera far distance
  const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1.0));
  mat.vertexNode = vec4(clip.x, clip.y, clip.w, clip.w);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
