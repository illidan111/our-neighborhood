import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldGeometry } from './worldGeometry';
import type { WorldShape } from './worldGeometry';

type Vec3 = [number, number, number];
type Shape = WorldShape;
type PrimitiveProps = {
  shape: Shape;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color: string;
  emissive?: string;
  intensity?: number;
  sides?: number;
  bottomRatio?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
};
type Instance = { group: THREE.Group; color: string };
type Specification = {
  shape: Shape; sides: number; bottomRatio: number; emissive: string; intensity: number;
  castShadow: boolean; receiveShadow: boolean;
};
type Bucket = {
  spec: Specification;
  instances: Map<symbol, Instance>;
  mesh: THREE.InstancedMesh | null;
  capacity: number;
};

/** A registry of visual instances only: colliders remain where the scene declares them. */
export class StaticRegistry {
  readonly root = new THREE.Group();
  private buckets = new Map<string, Bucket>();
  private dirty = new Set<Bucket>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private depthMaterial: THREE.MeshDepthMaterial | null = null;
  private windTime = { value: 0 };
  private windStrength = { value: 0.035 };
  private matrix = new THREE.Matrix4();
  private inverseRoot = new THREE.Matrix4();
  private color = new THREE.Color();

  register(group: THREE.Group, color: string, spec: Specification): () => void {
    // These are empty transform markers, not the rendered instances or Rapier parents.
    // Preserve their React-owned transforms, but do not compose/multiply them every frame.
    group.matrixAutoUpdate = false;
    group.matrixWorldAutoUpdate = false;
    group.visible = false;
    const key = JSON.stringify(spec);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { spec, instances: new Map(), mesh: null, capacity: 0 };
      this.buckets.set(key, bucket);
    }
    const id = Symbol();
    bucket.instances.set(id, { group, color });
    this.dirty.add(bucket);
    return () => { bucket.instances.delete(id); this.dirty.add(bucket); };
  }

  private geometry(spec: Specification) {
    const key = `${spec.shape}:${spec.sides}:${spec.bottomRatio}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = worldGeometry(spec.shape, spec.sides, spec.bottomRatio);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private material(spec: Specification) {
    const key = `${spec.shape}:${spec.emissive}:${spec.intensity}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: spec.shape === 'box' ? 0.86 : spec.shape === 'cylinder' ? 0.9 : 1,
        flatShading: spec.shape !== 'box' && spec.shape !== 'leaf', emissive: spec.emissive, emissiveIntensity: spec.intensity,
        side: spec.shape === 'grass' || spec.shape === 'flower' ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (spec.shape === 'leaf' || spec.shape === 'grass') this.withWind(material);
      this.materials.set(key, material);
    }
    return material;
  }

  private withWind(material: THREE.Material) {
    material.customProgramCacheKey = () => 'neighborhood-foliage-wind-1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.neighborhoodTime = this.windTime;
      shader.uniforms.neighborhoodWind = this.windStrength;
      shader.vertexShader = `uniform float neighborhoodTime; uniform float neighborhoodWind;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = dot(instanceMatrix[3].xz, vec2(0.41, 0.27));
          float windWeight = clamp(position.y + 0.85, 0.0, 1.5);
          transformed.x += sin(neighborhoodTime * 1.7 + windPhase) * neighborhoodWind * windWeight;
          transformed.z += cos(neighborhoodTime * 1.3 + windPhase) * neighborhoodWind * windWeight * 0.38;
        #endif
      `);
    };
  }

  animate(time: number, delta: number, storm: boolean) {
    this.windTime.value = time;
    this.windStrength.value = THREE.MathUtils.damp(this.windStrength.value, storm ? 0.12 : 0.025, 0.8, delta);
  }

  flush() {
    if (!this.dirty.size) return;
    this.root.updateWorldMatrix(true, false);
    this.inverseRoot.copy(this.root.matrixWorld).invert();
    for (const bucket of this.dirty) {
      const count = bucket.instances.size;
      if (!count) { if (bucket.mesh) bucket.mesh.visible = false; continue; }
      if (!bucket.mesh || count > bucket.capacity) {
        if (bucket.mesh) { this.root.remove(bucket.mesh); bucket.mesh.dispose(); }
        bucket.capacity = 2 ** Math.ceil(Math.log2(Math.max(8, count)));
        bucket.mesh = new THREE.InstancedMesh(this.geometry(bucket.spec), this.material(bucket.spec), bucket.capacity);
        bucket.mesh.name = `static-${bucket.spec.shape}`;
        bucket.mesh.castShadow = bucket.spec.castShadow;
        bucket.mesh.receiveShadow = bucket.spec.receiveShadow;
        if (bucket.spec.shape === 'leaf' || bucket.spec.shape === 'grass') {
          if (!this.depthMaterial) {
            this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
            this.withWind(this.depthMaterial);
          }
          bucket.mesh.customDepthMaterial = this.depthMaterial;
        }
        bucket.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(bucket.mesh);
      }
      const mesh = bucket.mesh;
      mesh.visible = true;
      mesh.count = count;
      let index = 0;
      for (const { group, color } of bucket.instances.values()) {
        // Includes fixed Rapier body transforms and all parent groups. Never read
        // a stale matrix from the prior React render or flatten collider transforms.
        // Matrix auto-updates are disabled only on this leaf. Dirty registrations must
        // explicitly refresh local + world matrices after React prop or parent changes.
        group.updateMatrix();
        if (group.parent) {
          group.parent.updateWorldMatrix(true, false);
          group.matrixWorld.multiplyMatrices(group.parent.matrixWorld, group.matrix);
        } else group.matrixWorld.copy(group.matrix);
        group.matrixWorldNeedsUpdate = false;
        this.matrix.multiplyMatrices(this.inverseRoot, group.matrixWorld);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, this.color.set(color));
        index++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      if (bucket.spec.shape === 'leaf' || bucket.spec.shape === 'grass') {
        // Covers the maximum shader displacement, including scaled crowns.
        mesh.boundingBox?.expandByScalar(1);
        if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
      }
    }
    this.dirty.clear();
  }

  dispose() {
    for (const bucket of this.buckets.values()) {
      if (bucket.mesh) { this.root.remove(bucket.mesh); bucket.mesh.dispose(); }
      bucket.mesh = null; bucket.capacity = 0; this.dirty.add(bucket);
    }
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear(); this.materials.clear();
    this.depthMaterial?.dispose(); this.depthMaterial = null;
    // Keep the registry reusable through StrictMode's setup/cleanup/setup cycle.
  }
}

const BatchContext = createContext<StaticRegistry | null>(null);

export function StaticBatch({ children, storm = false }: { children: ReactNode; storm?: boolean }) {
  const registry = useMemo(() => new StaticRegistry(), []);
  useFrame(({ clock }, delta) => { registry.animate(clock.elapsedTime, delta, storm); registry.flush(); }, 0);
  useEffect(() => () => registry.dispose(), [registry]);
  return <BatchContext.Provider value={registry}>
    {children}<primitive object={registry.root} dispose={null} />
  </BatchContext.Provider>;
}

/** Animation retains normal meshes; its transforms are not frozen into a batch. */
export function Unbatched({ children }: { children: ReactNode }) {
  return <BatchContext.Provider value={null}>{children}</BatchContext.Provider>;
}

export function StaticPrimitive({ shape, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], color,
  emissive = '#000000', intensity = 0, sides = 8, bottomRatio = 1, castShadow = true, receiveShadow = true }: PrimitiveProps) {
  const registry = useContext(BatchContext);
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!registry || !group.current) return;
    return registry.register(group.current, color, { shape, sides, bottomRatio, emissive, intensity, castShadow, receiveShadow });
    // Scalar transforms deliberately avoid registering again for equal tuple props.
  }, [registry, shape, sides, bottomRatio, color, emissive, intensity, castShadow, receiveShadow,
    position[0], position[1], position[2], rotation[0], rotation[1], rotation[2], scale[0], scale[1], scale[2]]);

  if (registry) return <group ref={group} position={position} rotation={rotation} scale={scale} />;
  return <UnbatchedPrimitive shape={shape} position={position} rotation={rotation} scale={scale} color={color} sides={sides} bottomRatio={bottomRatio} castShadow={castShadow} receiveShadow={receiveShadow} emissive={emissive} intensity={intensity} />;
}

function UnbatchedPrimitive({ shape, position, rotation, scale, color, sides = 8, bottomRatio = 1, castShadow, receiveShadow, emissive, intensity }: PrimitiveProps) {
  const geometry = useMemo(() => worldGeometry(shape, sides, bottomRatio), [shape, sides, bottomRatio]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={position} rotation={rotation} scale={scale} castShadow={castShadow} receiveShadow={receiveShadow}>
    <meshStandardMaterial color={color} roughness={shape === 'box' ? 0.86 : shape === 'cylinder' ? 0.9 : 1}
      flatShading={shape !== 'box' && shape !== 'leaf'} side={shape === 'grass' || shape === 'flower' ? THREE.DoubleSide : THREE.FrontSide} emissive={emissive} emissiveIntensity={intensity} />
  </mesh>;
}
