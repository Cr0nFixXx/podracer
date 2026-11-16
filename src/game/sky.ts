import * as THREE from 'three';
import type { ThemeDef } from './data';

export function sunDirection(theme: ThemeDef) {
  const el = theme.sunElev * Math.PI / 180, az = theme.sunAz * Math.PI / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

export function makeSky(theme: ThemeDef) {
  const uniforms = {
    top: { value: new THREE.Color(theme.skyTop) },
    horizon: { value: new THREE.Color(theme.skyHorizon) },
    sunColor: { value: new THREE.Color(theme.sunColor) },
    sunDir: { value: sunDirection(theme) },
    clouds: { value: theme.clouds },
    stars: { value: theme.terrain === 'prison' ? 1.0 : 0.0 },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, horizon, sunColor, sunDir; uniform float clouds, time, stars;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        col = mix(col, horizon * 0.6, smoothstep(0.0, -0.25, d.y));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.8);
        // clouds
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.08) * 1.6 + vec2(time * 0.004, time * 0.002);
          float c = fbm(uv);
          float cov = smoothstep(1.0 - clouds, 1.0 - clouds + 0.35, c);
          vec3 cc = mix(horizon * 1.1, vec3(1.0), 0.5) * (0.75 + 0.5 * pow(sd, 4.0));
          cc = mix(cc, sunColor * 1.4, pow(sd, 12.0) * 0.6);
          col = mix(col, cc, cov * smoothstep(0.0, 0.15, d.y) * 0.85);
        }
        col += sunColor * smoothstep(0.9993, 0.9997, sd) * 12.0;
        if (stars > 0.5) {
          vec3 sd2 = normalize(d * 400.0 + vec3(0.3, 0.1, 0.0));
          float star = hash(floor(sd2.xy * 220.0)) > 0.992 ? 1.0 : 0.0;
          col += vec3(0.85, 0.9, 1.0) * star * smoothstep(-0.1, 0.3, d.y);
          // asteroid belt band
          vec3 belt = normalize(vec3(d.x, d.y * 0.4 - 0.15, d.z));
          float band = exp(-pow((d.y + 0.05) * 9.0, 2.0));
          float clump = fbm(vec2(atan(belt.z, belt.x) * 3.0, belt.y * 20.0));
          col += vec3(0.35, 0.3, 0.25) * band * clump * 0.8;
          // gas giant with tilted rings
          vec3 gp = normalize(vec3(-0.25, 0.32, 0.91));
          float gdist = length(cross(d, gp));
          float disc = smoothstep(0.13, 0.125, gdist);
          vec3 planetCol = mix(vec3(0.62, 0.5, 0.36), vec3(0.85, 0.72, 0.5), fbm(d.xy * 40.0 + 3.0));
          planetCol *= 0.55 + 0.45 * smoothstep(0.13, 0.0, gdist);
          col = mix(col, planetCol, disc);
          vec3 axis = normalize(vec3(0.55, 0.75, -0.35));
          float along = dot(d, gp);
          float radial = length(d - gp * along);
          float tilt = abs(dot(normalize(d - gp * along + 1e-5), axis));
          float ring = smoothstep(0.16, 0.17, radial) * (1.0 - smoothstep(0.30, 0.32, radial)) * smoothstep(0.045, 0.01, tilt) * (1.0 - disc);
          float gap = smoothstep(0.004, 0.0, abs(radial - 0.23) - 0.004);
          col += vec3(0.62, 0.55, 0.42) * ring * (1.0 - gap) * 0.85;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
