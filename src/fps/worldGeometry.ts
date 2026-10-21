import * as THREE from 'three';

export type WorldShape = 'box' | 'cylinder' | 'boulder' | 'leaf' | 'grass' | 'flower' | 'paver' | 'mountain';

/** Small opaque meshes shared by every instance; no downloaded textures or alpha cards. */
export function worldGeometry(shape: WorldShape, sides: number, bottomRatio: number): THREE.BufferGeometry {
  if (shape === 'box') return new THREE.BoxGeometry(1, 1, 1);
  if (shape === 'cylinder') return new THREE.CylinderGeometry(1, bottomRatio, 1, sides);
  if (shape === 'paver') return new THREE.CylinderGeometry(0.94, 1, 1, 7);
  if (shape === 'boulder') return new THREE.DodecahedronGeometry(1, 0);
  if (shape === 'leaf') return new THREE.IcosahedronGeometry(1, 2);
  const points: number[] = [];
  if (shape === 'mountain') {
    const ring = (i: number, level: number) => {
      i %= 8;
      const angle = i * Math.PI / 4, radius = level === 0 ? 0.34 : 1;
      const height = level === 0 ? 0.53 + Math.sin(i * 7.13) * 0.18 : 0;
      return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
    };
    for (let i = 0; i < 8; i++) {
      points.push(0.07, 1, -0.03, ...ring(i + 1, 0), ...ring(i, 0));
      points.push(...ring(i, 0), ...ring(i + 1, 0), ...ring(i, 1), ...ring(i + 1, 0), ...ring(i + 1, 1), ...ring(i, 1));
    }
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
