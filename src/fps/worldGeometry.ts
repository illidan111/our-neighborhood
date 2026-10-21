import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type WorldShape = 'box' | 'cylinder' | 'boulder' | 'leaf' | 'grass' | 'flower' | 'paver' | 'mountain';

/** Small opaque meshes shared by every instance; no downloaded textures or alpha cards. */
export function worldGeometry(shape: WorldShape, sides: number, bottomRatio: number): THREE.BufferGeometry {
  if (shape === 'box') return new THREE.BoxGeometry(1, 1, 1);
  if (shape === 'cylinder') return new THREE.CylinderGeometry(1, bottomRatio, 1, sides);
  if (shape === 'paver') {
    const geometry = new THREE.CylinderGeometry(0.94, 1, 1, 7);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i), angle = Math.atan2(z, x);
      const irregularity = 1 + Math.sin(angle * 3 + 0.6) * 0.095 + Math.cos(angle * 2) * 0.065;
      vertices.setXYZ(i, x * irregularity, vertices.getY(i), z * irregularity);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  if (shape === 'boulder') return new THREE.DodecahedronGeometry(1, 0);
  if (shape === 'leaf') {
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const radius = 1 + Math.sin(Math.atan2(z, x) * 5 + y * 2.4) * 0.14 + Math.cos(y * 8 + x * 3) * 0.07;
      vertices.setXYZ(i, x * radius, y * radius * 0.91, z * radius);
    }
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    const smooth = mergeVertices(geometry);
    smooth.computeVertexNormals();
    geometry.dispose();
    return smooth;
  }
  const points: number[] = [];
  if (shape === 'mountain') {
    // A low irregular ridge, not a cone: broad shoulders and rounded subsidiary peaks.
    const point = (column: number, row: number) => {
      const x = column / 6 - 1, z = row / 5 - 1;
      const edge = Math.max(0, 1 - Math.pow(Math.abs(x), 3)) * Math.max(0, 1 - z * z);
      const ridge = 0.5 + Math.exp(-Math.pow((x + 0.21) * 3, 2)) * 0.43 + Math.exp(-Math.pow((x - 0.53) * 5, 2)) * 0.24;
      const y = edge * ridge * (0.92 + Math.sin(x * 7 + z * 4) * 0.08);
      return [x, y, z];
    };
    for (let x = 0; x < 12; x++) for (let z = 0; z < 10; z++)
      points.push(...point(x, z), ...point(x, z + 1), ...point(x + 1, z), ...point(x + 1, z), ...point(x, z + 1), ...point(x + 1, z + 1));
  } else if (shape === 'grass') {
    for (let blade = 0; blade < 6; blade++) {
      const angle = blade * 2.4, length = 0.65 + (blade % 3) * 0.16;
      const dx = Math.cos(angle), dz = Math.sin(angle), width = 0.075;
      const left = [-dz * width, 0, dx * width], right = [dz * width, 0, -dx * width];
      const middle = [dx * 0.18, length * 0.55, dz * 0.18], tip = [dx * 0.39, length, dz * 0.39];
      points.push(...left, ...right, ...middle, ...middle, ...right, ...tip);
    }
  } else {
    // Five gently cupped petals, built as one flower instead of five draw calls.
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      for (let segment = 0; segment < 10; segment++) {
        const vertex = (step: number) => {
          const a = step * Math.PI * 2 / 10, x = Math.cos(a) * 0.3, z = 0.4 + Math.sin(a) * 0.48;
          return [x * Math.cos(angle) + z * Math.sin(angle), 0.12 * z * z, -x * Math.sin(angle) + z * Math.cos(angle)];
        };
        points.push(Math.sin(angle) * 0.4, 0.04, Math.cos(angle) * 0.4, ...vertex(segment), ...vertex(segment + 1));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}
