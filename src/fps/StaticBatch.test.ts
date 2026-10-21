import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticRegistry } from './StaticBatch';

const spec = { shape: 'box' as const, sides: 8, bottomRatio: 1, emissive: '#000000', intensity: 0, castShadow: true, receiveShadow: true };
function fixture() {
  const scene = new THREE.Scene(), frame = new THREE.Group(), parent = new THREE.Group(), marker = new THREE.Group();
  frame.position.set(3, .5, -2); frame.rotation.set(.1, .3, -.2); frame.scale.set(1.4, .8, 1.1);
  parent.position.set(-2, 1.2, 4); parent.rotation.set(.4, -.2, .1); parent.scale.set(.9, 1.3, 1.1);
  marker.position.set(.3, .5, -.8); marker.rotation.set(.2, .6, -.1); marker.scale.set(2, .4, .7);
  scene.add(frame); frame.add(parent); parent.add(marker);
  const registry = new StaticRegistry(); registry.root.position.set(.4, -.2, .7); frame.add(registry.root);
  return { scene, frame, parent, marker, registry };
}
function expectedInstance(marker: THREE.Group, root: THREE.Group) {
  // A separate ordinary Three Object3D is the reference for the original auto-update behavior.
  const reference = new THREE.Group(); reference.position.copy(marker.position); reference.quaternion.copy(marker.quaternion); reference.scale.copy(marker.scale);
  marker.parent?.add(reference); reference.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
  const expected = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(reference.matrixWorld);
  reference.removeFromParent(); return expected;
}
function renderedInstance(registry: StaticRegistry) {
  const mesh = registry.root.children[0] as THREE.InstancedMesh, matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix); return { mesh, matrix };
}
function sameMatrix(actual: THREE.Matrix4, expected: THREE.Matrix4) {
  actual.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i], 5));
}

describe('static leaf-marker matrix freezing', () => {
  it('preserves rotated/scaled ancestors and instance placement while freezing only empty markers', () => {
    const { scene, parent, marker, registry } = fixture();
    const expected = expectedInstance(marker, registry.root);
    const remove = registry.register(marker, '#c59e70', spec); registry.flush();
    const { mesh, matrix } = renderedInstance(registry);
    sameMatrix(matrix, expected);
    expect(marker.visible).toBe(false); expect(marker.matrixAutoUpdate).toBe(false); expect(marker.matrixWorldAutoUpdate).toBe(false);
    expect(parent.matrixAutoUpdate).toBe(true); expect(parent.matrixWorldAutoUpdate).toBe(true);
    expect(mesh.visible).toBe(true); expect(mesh.count).toBe(1); expect(mesh.castShadow).toBe(true);
    const previous = marker.matrixWorld.clone(); scene.updateMatrixWorld(); sameMatrix(marker.matrixWorld, previous);
    remove(); registry.dispose();
  });

  it('refreshes a changed leaf prop and a changed parent when its registration is dirtied', () => {
    const { parent, marker, registry } = fixture();
    const remove = registry.register(marker, '#c59e70', spec); registry.flush();
    const original = renderedInstance(registry).matrix.clone();
    remove(); marker.position.set(2, 1, -3); marker.rotation.set(-.4, .2, .7); marker.scale.set(.5, 2, .8);
    parent.position.x += 1.7; parent.rotation.y += .8;
    const expected = expectedInstance(marker, registry.root);
    const removeAgain = registry.register(marker, '#e4cc91', spec); registry.flush();
    const { mesh, matrix } = renderedInstance(registry);
    sameMatrix(matrix, expected); expect(matrix.equals(original)).toBe(false); expect(mesh.count).toBe(1);
    const color = new THREE.Color(); mesh.getColorAt(0, color);
    expect(color.r).toBeCloseTo(new THREE.Color('#e4cc91').r, 5);
    removeAgain(); registry.dispose();
  });

  it('reuses the registry through StrictMode-style cleanup/setup without stale or duplicated instances', () => {
    const { marker, registry } = fixture();
    const remove = registry.register(marker, '#c59e70', spec); registry.flush();
    const firstMesh = renderedInstance(registry).mesh;
    remove(); registry.dispose(); expect(registry.root.children).toHaveLength(0);
    marker.position.z += 3;
    const expected = expectedInstance(marker, registry.root);
    const removeAgain = registry.register(marker, '#c59e70', spec); registry.flush();
    const { mesh, matrix } = renderedInstance(registry);
    expect(registry.root.children).toHaveLength(1); expect(mesh).not.toBe(firstMesh); expect(mesh.count).toBe(1);
    sameMatrix(matrix, expected);
    removeAgain(); registry.flush(); expect(mesh.visible).toBe(false);
    registry.dispose();
  });
});
