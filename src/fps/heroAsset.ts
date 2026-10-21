import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MToonMaterial, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export const HERO_MODEL_URL = '/models/neighborhood-hero.vrm';
export const HERO_HEIGHT = 1.72;
export type HeroBone = { node: THREE.Object3D; position: THREE.Vector3; worldPosition: THREE.Vector3 };
export type HeroAsset = {
  vrm: VRM;
  scale: number;
  feetOffset: number;
  bones: Partial<Record<VRMHumanBoneName, HeroBone>>;
  metrics: { triangles: number; drawMeshes: number; skeletons: number; textures: number };
};

let resource: Promise<HeroAsset> | undefined;
let resourceFailed = false;

function roundedPanel(width: number, height: number, depth: number, bevel = 0.012) {
  const shape = new THREE.Shape(), x = width / 2, y = height / 2, r = Math.min(0.025, width * 0.22, height * 0.22);
  shape.moveTo(-x + r, -y); shape.lineTo(x - r, -y); shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r); shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y); shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r); shape.quadraticCurveTo(-x, -y, -x + r, -y);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 4 });
}

function strap(points: THREE.Vector3[], width = 0.025) {
  const curve = new THREE.CatmullRomCurve3(points), positions: number[] = [], indices: number[] = [];
  const p = new THREE.Vector3(), tangent = new THREE.Vector3(), across = new THREE.Vector3();
  for (let i = 0; i <= 24; i++) {
    curve.getPoint(i / 24, p); curve.getTangent(i / 24, tangent);
    across.set(-tangent.y, tangent.x, 0).normalize().multiplyScalar(width / 2);
    positions.push(p.x - across.x, p.y - across.y, p.z,
      p.x + across.x, p.y + across.y, p.z);
    if (i < 24) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Original accessory only; the hero's anatomy, face, hair, costume topology and skinning are the licensed model. */
function addSatchel(asset: HeroAsset) {
  const hips = asset.bones.hips!;
  const group = new THREE.Group(); group.name = 'OriginalNeighbourhoodSatchel';
  group.position.y = -hips.worldPosition.y;
  const leather = new THREE.MeshStandardMaterial({ color: '#c77760', roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d7ae76', roughness: 0.86, side: THREE.DoubleSide });
  const bag = new THREE.Mesh(roundedPanel(0.185, 0.205, 0.055), leather);
  bag.position.set(-0.196, 0.803, -0.12); bag.rotation.set(0.09, -0.19, -0.09); bag.castShadow = true; bag.receiveShadow = true;
  const flap = new THREE.Mesh(roundedPanel(0.185, 0.1, 0.008, 0.007), leather);
  flap.position.set(0, 0.062, -0.018); bag.add(flap);
  const buckle = new THREE.Mesh(roundedPanel(0.025, 0.039, 0.005, 0.003), trim);
  buckle.position.set(0.002, 0.006, -0.032); bag.add(buckle);
  const frontStrap = strap([new THREE.Vector3(0.092, 1.295, 0.065), new THREE.Vector3(0.032, 1.21, 0.148),
    new THREE.Vector3(-0.062, 1.036, 0.155), new THREE.Vector3(-0.19, 0.875, 0.085)]);
  const backStrap = strap([new THREE.Vector3(0.092, 1.295, -0.063), new THREE.Vector3(0.025, 1.18, -0.137),
    new THREE.Vector3(-0.08, 1.016, -0.143), new THREE.Vector3(-0.196, 0.875, -0.12)]);
  const straps = new THREE.Mesh(mergeGeometries([frontStrap, backStrap]), trim);
  frontStrap.dispose(); backStrap.dispose(); straps.castShadow = true;
  group.add(bag, straps); hips.node.add(group);
}

function prepareHero(vrm: VRM): HeroAsset {
  if (!vrm?.humanoid) throw new Error('Модель героя не содержит скелет humanoid.');
  // Preserve the supplied license/settings in the original asset. Rendering changes happen only in memory.
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.combineMorphs(vrm);
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.rotateVRM0(vrm);
  const textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  let triangles = 0, drawMeshes = 0;
  vrm.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true; object.receiveShadow = true;
    // One nearby player is always visible; pre-animation skinned bounds must not cull raised hands/hair.
    object.frustumCulled = false;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    const surface = list.find(material => !(material instanceof MToonMaterial && material.isOutline));
    if (surface && list.length > 1 && list.every(material => material instanceof MToonMaterial)) {
      object.material = surface; object.geometry.clearGroups();
      for (const material of list) if (material !== surface) material.dispose();
    }
    for (const material of list) {
      if (!(material instanceof MToonMaterial) || material.isOutline) continue;
      material.outlineWidthMode = 'none'; material.outlineWidthFactor = 0;
      material.shadingToonyFactor = 0.45; material.shadingShiftFactor = -0.04;
      material.giEqualizationFactor = 0.8; material.parametricRimColorFactor.set('#000000');
      material.toneMapped = true;
      if (material.name.startsWith('Tops_')) {
        material.color.set('#609b94'); material.shadeColorFactor.set('#3b6c73');
      } else if (material.name.startsWith('Bottoms_')) {
        // Keep the supplied folds while giving near-black shorts a cool navy tint.
        material.color.set('#cad9f6'); material.shadeColorFactor.set('#66758e');
      } else if (material.name.startsWith('Shoes_')) {
        material.color.set('#f5ead4'); material.shadeColorFactor.set('#99a7b3');
      }
      for (const value of Object.values(material.uniforms)) {
        if (value.value instanceof THREE.Texture) { value.value.anisotropy = 2; textures.add(value.value); }
      }
    }
    const count = object.geometry.index?.count ?? object.geometry.getAttribute('position').count;
    triangles += count / 3; drawMeshes++;
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  vrm.humanoid.resetNormalizedPose(); vrm.update(0); vrm.scene.updateMatrixWorld(true);
  for (const skeleton of skeletons) skeleton.update();
  const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
  const scale = HERO_HEIGHT / (bounds.max.y - bounds.min.y);
  const bones: HeroAsset['bones'] = {};
  for (const [name, bone] of Object.entries(vrm.humanoid.normalizedHumanBones)) {
    if (!bone) continue;
    bones[name as VRMHumanBoneName] = { node: bone.node, position: bone.node.position.clone(), worldPosition: bone.node.getWorldPosition(new THREE.Vector3()) };
  }
  const asset: HeroAsset = { vrm, scale, feetOffset: -bounds.min.y * scale, bones,
    metrics: { triangles, drawMeshes, skeletons: skeletons.size, textures: textures.size } };
  addSatchel(asset);
  vrm.scene.getObjectByName('OriginalNeighbourhoodSatchel')?.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    asset.metrics.drawMeshes++;
    asset.metrics.triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  vrm.scene.scale.setScalar(scale); vrm.scene.position.y = asset.feetOffset;
  vrm.expressionManager?.setValue('happy', 0.08);
  return asset;
}

/** The local game and review studio are mutually exclusive routes. One bounded VRM instance is cached.
 * Cloning only the scene would leave spring/expression/constraint managers pointing at the old bones.
 * A new party resets this complete instance; it does not allocate another set of textures/skeletons. */
export function preloadHeroAvatar(): Promise<HeroAsset> {
  if (!resource) {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    resource = loader.loadAsync(HERO_MODEL_URL).then(gltf => prepareHero(gltf.userData.vrm as VRM)).catch(error => {
      resourceFailed = true;
      throw new Error(`Не удалось загрузить модель героя: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  return resource;
}

export function retryHeroAvatar() {
  if (resourceFailed) { resource = undefined; resourceFailed = false; }
  return preloadHeroAvatar();
}
