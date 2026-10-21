import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VRM, VRMHumanoid } from '@pixiv/three-vrm';
import type { VRMHumanBones, VRMHumanBoneName, VRMMeta } from '@pixiv/three-vrm';
import { HeroRig } from './heroRig';
import type { HeroAsset } from './heroAsset';
import type { HeroMotion } from './heroAnimation';

/** Use the shipped model's actual bind skeleton without images/WebGL. This catches differences
 * between analytic IK and the imported hierarchy; it does not substitute for a visual playtest. */
function skeletonFixture() {
  const bytes = readFileSync(new URL('../../public/models/neighborhood-hero.vrm', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const nodes = json.nodes.map((data: { translation?: number[]; rotation?: number[]; scale?: number[] }) => {
    const node = new THREE.Object3D();
    if (data.translation) node.position.fromArray(data.translation);
    if (data.rotation) node.quaternion.fromArray(data.rotation);
    if (data.scale) node.scale.fromArray(data.scale);
    return node;
  }) as THREE.Object3D[];
  json.nodes.forEach((data: { children?: number[] }, i: number) => data.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group();
  json.scenes[json.scene ?? 0].nodes.forEach((i: number) => scene.add(nodes[i]));
  scene.updateMatrixWorld(true);
  const humanBones = Object.fromEntries(Object.entries(json.extensions.VRMC_vrm.humanoid.humanBones)
    .map(([name, data]) => [name, { node: nodes[(data as { node: number }).node] }])) as VRMHumanBones;
  const humanoid = new VRMHumanoid(humanBones); scene.add(humanoid.normalizedHumanBonesRoot);
  const vrm = new VRM({ scene, humanoid, meta: json.extensions.VRMC_vrm.meta as VRMMeta });
  const bones: HeroAsset['bones'] = {};
  for (const [name, bone] of Object.entries(humanoid.normalizedHumanBones))
    bones[name as VRMHumanBoneName] = { node: bone.node, position: bone.node.position.clone(), worldPosition: bone.node.getWorldPosition(new THREE.Vector3()) };
  const scale = 1.72 / (1.61541808 - 0.0147038084), feetOffset = -0.0147038084 * scale;
  const asset: HeroAsset = { vrm, bones, scale, feetOffset, metrics: { triangles: 0, drawMeshes: 0, skeletons: 1, textures: 0 } };
  scene.scale.setScalar(scale); scene.position.y = feetOffset;
  return asset;
}

const motion: HeroMotion = { speed: 4.2, distance: 0, grounded: true, verticalVelocity: 0, held: null, heading: 0, previewTime: 1 };

describe('animation on the actual shipped humanoid hierarchy', () => {
  it('keeps the supporting ankle at its floor-relative height and fixed world Z as the player travels', () => {
    const asset = skeletonFixture(), rig = new HeroRig(asset), foot = asset.bones.leftFoot!;
    rig.reset({ ...motion, distance: 0.06 * 2.25 }); asset.vrm.scene.updateMatrixWorld(true);
    const first = foot.node.getWorldPosition(new THREE.Vector3());
    rig.update({ ...motion, distance: 0.11 * 2.25 }, 1 / 60); asset.vrm.scene.updateMatrixWorld(true);
    const second = foot.node.getWorldPosition(new THREE.Vector3());
    expect(first.y).toBeCloseTo(foot.worldPosition.y * asset.scale + asset.feetOffset, 5);
    expect(second.y).toBeCloseTo(first.y, 5);
    expect(first.z + 0.06 * 2.25).toBeCloseTo(second.z + 0.11 * 2.25, 5);
  });
  it.each(['crate', 'battery', 'boards'] as const)('puts both wrists symmetrically at the held %s near-side grip', held => {
    const asset = skeletonFixture(), rig = new HeroRig(asset);
    rig.reset({ ...motion, speed: 0, distance: 0, held, animation: 'carry', previewTime: 0 });
    asset.vrm.scene.updateMatrixWorld(true);
    const left = asset.bones.leftHand!.node.getWorldPosition(new THREE.Vector3());
    const right = asset.bones.rightHand!.node.getWorldPosition(new THREE.Vector3());
    expect(left.y).toBeCloseTo(1.15, 2); expect(right.y).toBeCloseTo(1.15, 2);
    expect(left.x).toBeCloseTo(-right.x, 3); expect(left.z).toBeCloseTo(right.z, 3);
    expect(left.z).toBeCloseTo(held === 'crate' ? 0.22 : held === 'battery' ? 0.32 : 0.34, 3);
  });
});
