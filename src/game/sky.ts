import * as THREE from 'three/webgpu';
import * as TSLmod from 'three/tsl';
import type { ThemeDef } from './data';
import { macroTexture } from './textures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLmod as any;
const { atan, cameraProjectionMatrix, cross, dot, exp, float, floor, fract, length, max, mix, modelViewMatrix, normalize, oneMinus, positionLocal, pow, sin, smoothstep, step, texture, uniform, vec2, vec3, vec4 } = TSL;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const ssInv = (a: number, b: number, x: N) => oneMinus(smoothstep(b, a, x));

export function sunDirection(theme: ThemeDef) {
  const el = theme.sunElev * Math.PI / 180, az = theme.sunAz * Math.PI / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

export function sunDirection2(theme: ThemeDef) {
  const el = (theme.sunElev - 2.5) * Math.PI / 180, az = (theme.sunAz + 7) * Math.PI / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

/**
 * Fast procedural sky dome (TSL):
 *  - Uses 2 samples of pre-baked `macroTexture()` for clouds instead of 6-octave ALU noise (~8× faster).
 *  - Only compiles the starfield / asteroid belt / ringed gas-giant branch on Oovo IV (`prison`).
 *  - `forEnv = true` omits razor-sharp 12× HDR sun discs so PMREM reflections never strobe on glossy/bumpy surfaces!
 */
export function makeSky(theme: ThemeDef, forEnv = false) {
  const isPrison = theme.terrain === 'prison';
  const hasSun2 = !forEnv && (theme.id === 'desert' || theme.id === 'mesa');
  const uniforms = {
    top: uniform(new THREE.Color(theme.skyTop)),
    horizon: uniform(new THREE.Color(theme.skyHorizon)),
    sunColor: uniform(new THREE.Color(theme.sunColor)),
    sunDir: uniform(sunDirection(theme)),
    clouds: uniform(theme.clouds),
    time: uniform(0),
    sunDir2: uniform(sunDirection2(theme)),
    flash: uniform(0), // lightning: lights the cloud deck from inside (weather.ts)
  };

  const d = normalize(positionLocal);
  const sd = max(dot(d, normalize(uniforms.sunDir)), 0.0);
  let col = mix(uniforms.horizon, uniforms.top, pow(max(d.y, 0.0), 0.55));
  col = mix(col, uniforms.horizon.mul(0.6), ssInv(0.0, -0.25, d.y));
  // Smooth solar corona; omit pinpoint 12× HDR disc in PMREM so reflections stay silky & flicker-free
  col = col.add(uniforms.sunColor.mul(pow(sd, 6.0).mul(0.35).add(pow(sd, forEnv ? 24.0 : 64.0).mul(forEnv ? 0.45 : 0.75))));

  // Night starfield (twinkle-free hash stars, hidden by clouds and near the horizon)
  if ((theme.stars ?? 0) > 0 && !isPrison && !forEnv) {
    const h21s = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
    const cellS = floor(d.mul(210.0)); const sh = h21s(cellS.xy.add(cellS.z.mul(vec2(17.31, 41.7))));
    col = col.add(vec3(0.8, 0.88, 1.0).mul(step(0.9955, sh)).mul(sh.sub(0.9955).mul(180.0).add(0.25)).mul(smoothstep(0.02, 0.35, d.y)).mul(theme.stars ?? 0));
  }
  let covN: N = float(0.0);
  if (theme.clouds > 0.001) {
    const m = macroTexture();
    const cuv = d.xz.div(max(d.y, 0.0).add(0.1)).mul(0.26).add(vec2(uniforms.time.mul(0.0025), uniforms.time.mul(0.0014)));
    const cn = texture(m, cuv).r.mul(0.65).add(texture(m, cuv.mul(2.3).add(0.37)).g.mul(0.35));
    const cov = smoothstep(oneMinus(uniforms.clouds), oneMinus(uniforms.clouds).add(0.34), cn);
    // Cloud albedo is lit by the ambient sky level: white by day, dark at night / under ash skies (was a constant 48 % white)
    const hc = new THREE.Color(theme.skyHorizon), tc = new THREE.Color(theme.skyTop);
    const lit = Math.min(1, (0.2126 * hc.r + 0.7152 * hc.g + 0.0722 * hc.b) * 2.4 + (0.2126 * tc.r + 0.7152 * tc.g + 0.0722 * tc.b) * 0.8);
    let cc = mix(uniforms.horizon.mul(1.08), vec3(lit), 0.48).mul(pow(sd, 4.0).mul(0.45).add(0.75));
    cc = mix(cc, uniforms.sunColor.mul(1.3), pow(sd, 12.0).mul(0.55));
    col = mix(col, cc, cov.mul(smoothstep(0.0, 0.16, d.y)).mul(0.85));
    covN = cov;
  }
  if (!forEnv) col = col.add(vec3(0.5, 0.6, 0.85).mul(uniforms.flash).mul(covN.mul(0.75).add(0.25)).mul(smoothstep(-0.05, 0.3, d.y)));

  if (!forEnv) {
    col = col.add(uniforms.sunColor.mul(smoothstep(0.9992, 0.9997, sd).mul(8.5)));
    if (hasSun2) {
      const sdB = max(dot(d, normalize(uniforms.sunDir2)), 0.0);
      col = col.add(uniforms.sunColor.mul(vec3(1.0, 0.82, 0.62)).mul(smoothstep(0.9995, 0.99975, sdB).mul(6.5).add(pow(sdB, 48.0).mul(0.28))));
    }
  }

  if (isPrison && !forEnv) {
    const m = macroTexture();
    const h21 = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
    const cell = floor(d.mul(250.0)); const starH = h21(cell.xy.add(cell.z.mul(vec2(17.31, 41.7))));
    let night = col.add(vec3(0.85, 0.9, 1.0).mul(step(0.996, starH)).mul(smoothstep(-0.1, 0.3, d.y)));
    const belt = normalize(vec3(d.x, d.y.mul(0.4).sub(0.15), d.z));
    const band = exp(pow(d.y.add(0.05).mul(9.0), 2.0).negate());
    const beltN = texture(m, vec2(atan(belt.z, belt.x).mul(0.48), belt.y.mul(3.2))).r;
    night = night.add(vec3(0.35, 0.3, 0.25).mul(band).mul(beltN).mul(0.8));
    const gp = normalize(vec3(-0.25, 0.32, 0.91));
    const along = dot(d, gp); const front = step(0.0, along);
    const gdist = length(cross(d, gp));
    const disc = ssInv(0.13, 0.125, gdist).mul(front);
    const pBands = texture(m, vec2(d.x.mul(2.5), d.y.mul(8.0)).add(0.3)).r;
    const planetCol = mix(vec3(0.62, 0.5, 0.36), vec3(0.85, 0.72, 0.5), pBands).mul(ssInv(0.13, 0.0, gdist).mul(0.45).add(0.55));
    night = mix(night, planetCol, disc);
    const axis = normalize(vec3(0.55, 0.75, -0.35));
    const radialV = d.sub(gp.mul(along)); const radial = length(radialV);
    const tilt = dot(normalize(radialV.add(1e-5)), axis).abs();
    const ring = smoothstep(0.16, 0.17, radial).mul(ssInv(0.32, 0.3, radial)).mul(ssInv(0.045, 0.01, tilt)).mul(oneMinus(disc)).mul(front);
    const gap = ssInv(0.004, 0.0, radial.sub(0.23).abs().sub(0.004));
    col = night.add(vec3(0.62, 0.55, 0.42).mul(ring).mul(oneMinus(gap)).mul(0.85));
  }

  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  mat.colorNode = col;
  if (!forEnv) {
    const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1.0));
    mat.vertexNode = vec4(clip.x, clip.y, clip.w, clip.w);
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(forEnv ? 500 : 9000, 36, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
