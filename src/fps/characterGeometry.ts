import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Ring = { y: number; x: number; z: number; cx?: number; cz?: number; power?: number };
type Point = [number, number, number];

/** A hand-authored series of rounded rectangular sections, rather than stacked primitives. */
export function loft(rings: Ring[], segments = 24): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (const ring of rings) {
    const exponent = 2 / (ring.power ?? 2.6);
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments, c = Math.cos(angle), s = Math.sin(angle);
      positions.push((ring.cx ?? 0) + ring.x * Math.sign(c) * Math.abs(c) ** exponent,
        ring.y, (ring.cz ?? 0) + ring.z * Math.sign(s) * Math.abs(s) ** exponent);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments;
    const c = a + segments, d = b + segments;
    indices.push(a, c, b, b, c, d);
  }
  // End caps have their own centre, avoiding long triangles across the silhouette.
  for (const end of [0, rings.length - 1]) {
    const ring = rings[end], centre = positions.length / 3;
    positions.push(ring.cx ?? 0, ring.y, ring.cz ?? 0);
    for (let i = 0; i < segments; i++) {
      const a = end * segments + i, b = end * segments + (i + 1) % segments;
      if (end === 0) indices.push(centre, a, b); else indices.push(centre, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function transformed(geometry: THREE.BufferGeometry, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]) {
  const copy = geometry.clone();
  copy.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
  return copy;
}

export function join(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  merged.computeBoundingSphere();
  return merged;
}

function softPatch(points: [number, number][], depth = 0.012) {
  const shape = new THREE.Shape(); shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.012,
    bevelThickness: 0.008, bevelSegments: 2, steps: 1, curveSegments: 4 });
  geometry.deleteAttribute('uv');
  return geometry;
}

function stroke(points: Point[], radius: number, segments = 8) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(path, segments, radius, 6, false);
  geometry.deleteAttribute('uv');
  return geometry;
}

function pebble(x: number, y: number, z: number) {
  return loft([
    { y: -y, x: x * 0.1, z: z * 0.1, power: 2 },
    { y: -y * 0.7, x: x * 0.76, z: z * 0.76, power: 2 },
    { y: 0, x, z, power: 2.2 },
    { y: y * 0.7, x: x * 0.76, z: z * 0.76, power: 2 },
    { y, x: x * 0.1, z: z * 0.1, power: 2 },
  ], 16);
}

function jacket() {
  return loft([
    { y: -0.045, x: 0.275, z: 0.165 }, { y: -0.02, x: 0.307, z: 0.188 },
    { y: 0.04, x: 0.32, z: 0.2 }, { y: 0.17, x: 0.318, z: 0.205 },
    { y: 0.31, x: 0.301, z: 0.198 }, { y: 0.45, x: 0.286, z: 0.184 },
    { y: 0.54, x: 0.277, z: 0.164 }, { y: 0.595, x: 0.235, z: 0.145 },
    { y: 0.645, x: 0.155, z: 0.121 }, { y: 0.665, x: 0.095, z: 0.095 },
  ]);
}

function head() {
  const face = loft([
    { y: -0.226, x: 0.045, z: 0.055, cz: 0.012 },
    { y: -0.205, x: 0.128, z: 0.126, cz: 0.012 },
    { y: -0.153, x: 0.196, z: 0.169, cz: 0.005 },
    { y: -0.075, x: 0.223, z: 0.185 }, { y: 0.025, x: 0.23, z: 0.19 },
    { y: 0.12, x: 0.222, z: 0.187 }, { y: 0.181, x: 0.185, z: 0.165 },
    { y: 0.211, x: 0.108, z: 0.1 }, { y: 0.218, x: 0.025, z: 0.03 },
  ], 32);
  const ear = pebble(0.045, 0.073, 0.039), nose = pebble(0.034, 0.042, 0.038);
  const result = join([face, transformed(ear, [-0.23, -0.025, -0.005], [0, 0, -0.13]),
    transformed(ear, [0.23, -0.025, -0.005], [0, 0, 0.13]), transformed(nose, [0, -0.036, 0.192])]);
  ear.dispose(); nose.dispose(); return result;
}

function faceMarks() {
  const eye = pebble(0.0125, 0.026, 0.008);
  const result = join([
    transformed(eye, [-0.083, 0.03, 0.191]), transformed(eye, [0.083, 0.03, 0.191]),
    stroke([[-0.115, 0.094, 0.188], [-0.085, 0.104, 0.197], [-0.055, 0.098, 0.192]], 0.009),
    stroke([[0.055, 0.101, 0.192], [0.086, 0.107, 0.197], [0.114, 0.097, 0.188]], 0.009),
    stroke([[-0.065, -0.104, 0.18], [-0.033, -0.119, 0.188], [0.005, -0.121, 0.19], [0.048, -0.107, 0.184]], 0.0055, 12),
  ]);
  eye.dispose(); return result;
}

function hair() {
  const rings = 11, segments = 32, positions: number[] = [], indices: number[] = [];
  // This shell follows the same rounded-square sections as the skull. A circular cap
  // would cut through the skull's broad temples and leave unintended bare patches.
  const profile = [
    [-0.05, 0.24, 0.203], [0.04, 0.245, 0.205], [0.12, 0.24, 0.203],
    [0.18, 0.207, 0.185], [0.215, 0.15, 0.14], [0.24, 0.085, 0.08], [0.255, 0.008, 0.008],
  ];
  for (let row = 0; row < rings; row++) {
    const t = row / (rings - 1);
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, front = Math.max(0, Math.sin(a));
      const low = -0.025 + front * 0.169 + Math.abs(Math.cos(a)) * 0.035;
      const y = low * (1 - t) + 0.255 * t;
      let section = 0;
      while (section < profile.length - 2 && y > profile[section + 1][0]) section++;
      const lower = profile[section], upper = profile[section + 1];
      const blend = (y - lower[0]) / (upper[0] - lower[0]);
      const rx = THREE.MathUtils.lerp(lower[1], upper[1], blend);
      const rz = THREE.MathUtils.lerp(lower[2], upper[2], blend);
      const c = Math.cos(a), s = Math.sin(a), exponent = 2 / 2.6;
      positions.push(Math.sign(c) * Math.abs(c) ** exponent * rx, y,
        Math.sign(s) * Math.abs(s) ** exponent * rz - 0.002);
    }
  }
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, c, b, b, c, d);
  }
  const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cap.setIndex(indices); cap.computeVertexNormals();
  // Three swept locks share the cap material and produce one intentional, side-swept outline.
  return join([cap,
    stroke([[-0.197, 0.142, 0.128], [-0.12, 0.185, 0.198], [0.015, 0.235, 0.192], [0.105, 0.259, 0.119]], 0.044, 16),
    stroke([[-0.127, 0.2, 0.134], [-0.028, 0.245, 0.158], [0.101, 0.258, 0.128], [0.17, 0.238, 0.068]], 0.039, 16),
    stroke([[-0.221, 0.12, 0.055], [-0.217, 0.062, 0.076], [-0.211, 0.021, 0.061]], 0.021, 8),
  ]);
}

function collar() {
  const left = softPatch([[-0.115, 0.659], [-0.21, 0.611], [-0.223, 0.559], [-0.179, 0.486], [-0.065, 0.533], [-0.025, 0.611]]);
  const right = softPatch([[0.115, 0.659], [0.21, 0.611], [0.223, 0.559], [0.179, 0.486], [0.065, 0.533], [0.025, 0.611]].reverse() as [number, number][]);
  const result = join([transformed(left, [0, 0, 0.17], [0, 0.08, 0]), transformed(right, [0, 0, 0.17], [0, -0.08, 0])]);
  left.dispose(); right.dispose(); return result;
}

function pockets() {
  const pocket = softPatch([[-0.066, 0.075], [0.066, 0.075], [0.067, -0.053], [0.045, -0.077], [-0.045, -0.077], [-0.067, -0.053]], 0.006);
  const result = join([transformed(pocket, [-0.177, 0.09, 0.197], [0, -0.06, 0]), transformed(pocket, [0.177, 0.09, 0.197], [0, 0.06, 0])]);
  pocket.dispose(); return result;
}

function buttons() {
  const button = pebble(0.014, 0.018, 0.008);
  const result = join([transformed(button, [0.009, 0.11, 0.21]), transformed(button, [0.009, 0.29, 0.205]),
    transformed(button, [0.009, 0.46, 0.186])]);
  button.dispose(); return result;
}

function mitten(side: number) {
  const palm = loft([
    { y: -0.165, x: 0.032, z: 0.035, cx: side * 0.007 },
    { y: -0.147, x: 0.056, z: 0.048, cx: side * 0.006 },
    { y: -0.092, x: 0.068, z: 0.055 }, { y: -0.028, x: 0.057, z: 0.05 },
    { y: 0.015, x: 0.043, z: 0.044 },
  ], 20);
  const thumb = pebble(0.028, 0.055, 0.032);
  const result = join([palm, transformed(thumb, [-side * 0.053, -0.066, 0.025], [0.18, 0, -side * 0.45])]);
  thumb.dispose(); return result;
}

function sleeve(upper: boolean) {
  return upper ? loft([
    { y: -0.28, x: 0.099, z: 0.101 }, { y: -0.25, x: 0.11, z: 0.111 },
    { y: -0.14, x: 0.125, z: 0.129 }, { y: -0.045, x: 0.131, z: 0.137 },
    { y: 0.035, x: 0.105, z: 0.106 }, { y: 0.066, x: 0.061, z: 0.063 },
  ], 20) : loft([
    { y: -0.258, x: 0.081, z: 0.083 }, { y: -0.246, x: 0.091, z: 0.092 },
    { y: -0.21, x: 0.096, z: 0.097 }, { y: -0.195, x: 0.091, z: 0.094 },
    { y: -0.10, x: 0.099, z: 0.106 }, { y: -0.015, x: 0.111, z: 0.114 },
    { y: 0.025, x: 0.098, z: 0.101 },
  ], 20);
}

function leg(upper: boolean) {
  return loft(upper ? [
    { y: -0.328, x: 0.094, z: 0.101 }, { y: -0.30, x: 0.113, z: 0.118 },
    { y: -0.15, x: 0.127, z: 0.139 }, { y: 0.01, x: 0.135, z: 0.147 },
    { y: 0.06, x: 0.11, z: 0.122 },
  ] : [
    { y: -0.323, x: 0.078, z: 0.084 }, { y: -0.30, x: 0.1, z: 0.103 },
    { y: -0.265, x: 0.105, z: 0.106 }, { y: -0.14, x: 0.109, z: 0.111 },
    { y: -0.025, x: 0.112, z: 0.117 }, { y: 0.03, x: 0.098, z: 0.103 },
  ], 20);
}

function boot(sole: boolean) {
  return loft(sole ? [
    { y: 0.012, x: 0.116, z: 0.19, cz: 0.054 }, { y: 0.019, x: 0.131, z: 0.206, cz: 0.055 },
    { y: 0.041, x: 0.133, z: 0.205, cz: 0.055 }, { y: 0.051, x: 0.123, z: 0.198, cz: 0.055 },
  ] : [
    { y: 0.045, x: 0.125, z: 0.196, cz: 0.055 }, { y: 0.083, x: 0.127, z: 0.195, cz: 0.055 },
    { y: 0.123, x: 0.119, z: 0.18, cz: 0.052 }, { y: 0.157, x: 0.099, z: 0.131, cz: 0.015 },
    { y: 0.199, x: 0.089, z: 0.096, cz: -0.011 }, { y: 0.211, x: 0.081, z: 0.087, cz: -0.011 },
  ], 24);
}

/** Shared for every character, including the first-person hands. Never allocated in useFrame. */
export const CHARACTER_GEOMETRY = {
  jacket: jacket(), head: head(), face: faceMarks(), hair: hair(), collar: collar(), pockets: pockets(), buttons: buttons(),
  undershirt: loft([{ y: 0.57, x: 0.086, z: 0.101 }, { y: 0.69, x: 0.093, z: 0.101 }, { y: 0.714, x: 0.078, z: 0.085 }], 20),
  upperSleeve: sleeve(true), lowerSleeve: sleeve(false), leftHand: mitten(-1), rightHand: mitten(1),
  hips: loft([{ y: 0.51, x: 0.209, z: 0.143 }, { y: 0.59, x: 0.26, z: 0.168 }, { y: 0.72, x: 0.258, z: 0.165 }], 24),
  upperLeg: leg(true), lowerLeg: leg(false), boot: boot(false), sole: boot(true),
};

export const CHARACTER_PALETTE = {
  jacket: '#7e8964', cream: '#e8d9ac', trousers: '#35494a', boot: '#695343', sole: '#493e34',
  skin: '#e5ad83', hair: '#493426', face: '#332a24', button: '#94754d',
};

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
export function characterMaterial(color: string, roughness = 0.91) {
  const key = `${color}:${roughness}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materialCache.set(key, material);
  }
  return material;
}
