import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { BOT } from '../game';
import type { FPSState, TargetId } from './model';
import { TARGET_POSITIONS, type WorldPoint } from './landmarks';
import { StaticBatch, StaticPrimitive, Unbatched } from './StaticBatch';

const C = {
  grass: '#8eb965', grassLight: '#afc97d', grassDark: '#6d9d62', cream: '#f5e5bc',
  trim: '#fff3d6', coral: '#dd7858', roofDark: '#b65c48', teal: '#4b9e96',
  dark: '#345b58', wood: '#a97950', lightWood: '#d6ab70', path: '#dac59d',
  stone: '#a5b29b', water: '#65b9c0', yellow: '#f4c767', ink: '#345452',
};
type Vec3 = [number, number, number];

function Box({ position = [0, 0, 0], size = [1, 1, 1], color = C.cream, rotation, emissive, intensity = 0, castShadow = true }: {
  position?: Vec3; size?: Vec3; color?: string; rotation?: Vec3; emissive?: string; intensity?: number; castShadow?: boolean;
}) {
  return <StaticPrimitive shape="box" position={position} rotation={rotation} scale={size} color={color} emissive={emissive} intensity={intensity} castShadow={castShadow} />;
}

function SolidBox(props: Parameters<typeof Box>[0] & { target?: TargetId }) {
  const { position = [0, 0, 0], size = [1, 1, 1], rotation = [0, 0, 0], target, ...visual } = props;
  return <RigidBody type="fixed" colliders={false} position={position} rotation={rotation} userData={target ? { target } : undefined}>
    <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} friction={0.85} />
    <Box size={size} {...visual} />
  </RigidBody>;
}

function Cylinder({ position = [0, 0, 0], radius = 1, bottom, height = 1, color = C.wood, sides = 8, rotation, castShadow = true }: {
  position?: Vec3; radius?: number; bottom?: number; height?: number; color?: string; sides?: number; rotation?: Vec3; castShadow?: boolean;
}) {
  return <StaticPrimitive shape="cylinder" position={position} rotation={rotation} scale={[radius, height, radius]} bottomRatio={(bottom ?? radius) / radius} color={color} sides={sides} castShadow={castShadow} />;
}

function Boulder({ position, scale = [1, 1, 1], color = C.stone, castShadow = true }: { position: Vec3; scale?: Vec3; color?: string; castShadow?: boolean }) {
  return <StaticPrimitive shape="boulder" position={position} scale={scale} color={color} castShadow={castShadow} />;
}

function TextPlate({ lines, width = 2, height = 0.65, position = [0, 0, 0], rotation = [0, 0, 0], background = C.trim, ink = C.ink, fontSize = 62 }: {
  lines: string[]; width?: number; height?: number; position?: Vec3; rotation?: Vec3; background?: string; ink?: string; fontSize?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = Math.max(180, Math.round(1024 * height / width));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = ink; ctx.lineWidth = 8; ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lineHeight = canvas.height / (lines.length + 0.45);
    const size = Math.min(fontSize * 1.6, lineHeight * 0.74);
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * lineHeight, canvas.width - 75));
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }, [lines.join('|'), width, height, background, ink, fontSize]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={[width, height]} /><meshStandardMaterial map={texture} roughness={0.9} side={THREE.DoubleSide} />
  </mesh>;
}

function Roof({ position, width, depth, height = 1.6, color = C.coral }: { position: Vec3; width: number; depth: number; height?: number; color?: string }) {
  const geometry = useMemo(() => {
    const w = width / 2, d = depth / 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -w, 0, -d, w, 0, -d, 0, height, -d,
      w, 0, d, -w, 0, d, 0, height, d,
      -w, 0, d, -w, 0, -d, 0, height, -d, -w, 0, d, 0, height, -d, 0, height, d,
      w, 0, -d, w, 0, d, 0, height, d, w, 0, -d, 0, height, d, 0, height, -d,
    ], 3));
    geo.computeVertexNormals(); return geo;
  }, [width, depth, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <RigidBody type="fixed" colliders="trimesh" position={position}>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} side={THREE.DoubleSide} flatShading roughness={0.86} /></mesh>
  </RigidBody>;
}

function Window({ position, rotation = [0, 0, 0], powered = false, width = 1.6, height = 1.25 }: { position: Vec3; rotation?: Vec3; powered?: boolean; width?: number; height?: number }) {
  return <group position={position} rotation={rotation}>
    <Box size={[width + 0.16, height + 0.16, 0.13]} color={C.trim} />
    <Box position={[0, 0, 0.08]} size={[width, height, 0.05]} color={powered ? '#ffe2a0' : '#73a6a0'} emissive={powered ? '#ffd879' : '#000000'} intensity={powered ? 0.75 : 0} />
    <Box position={[0, 0, 0.12]} size={[0.065, height, 0.06]} color={C.trim} />
    <Box position={[0, 0, 0.12]} size={[width, 0.065, 0.06]} color={C.trim} />
    <Box position={[0, -height / 2 - 0.1, 0.2]} size={[width + 0.35, 0.12, 0.4]} color={C.lightWood} />
  </group>;
}

function Socket({ position, target, installed }: { position: Vec3; target: TargetId; installed: boolean }) {
  const indicator = installed ? '#b4ec86' : '#f0ba5c';
  return <RigidBody type="fixed" colliders={false} position={position} userData={{ target }}>
    <CuboidCollider args={[0.38, 0.5, 0.23]} />
    <Box size={[0.76, 1, 0.4]} color={C.dark} />
    <Box position={[0, 0.02, 0.22]} size={[0.58, 0.7, 0.08]} color={installed ? '#719c67' : '#233f41'} />
    <Box position={[0, 0.37, 0.28]} size={[0.35, 0.08, 0.07]} color={indicator} emissive={indicator} intensity={installed ? 1.2 : 0.15} />
    <TextPlate lines={[installed ? 'ПИТАНИЕ ЕСТЬ' : 'АККУМУЛЯТОР']} width={1.15} height={0.25} position={[0, 0.7, 0.24]} />
    {installed ? <>
      <Box position={[0, -0.02, 0.37]} size={[0.49, 0.61, 0.3]} color={C.yellow} />
      <TextPlate lines={['⚡']} width={0.27} height={0.32} position={[0, -0.02, 0.525]} background={C.yellow} />
    </> : <>
      <Box position={[-0.2, -0.05, 0.3]} size={[0.05, 0.48, 0.1]} color={C.lightWood} />
      <Box position={[0.2, -0.05, 0.3]} size={[0.05, 0.48, 0.1]} color={C.lightWood} />
    </>}
  </RigidBody>;
}

function SupplyCrate({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return <group position={position} scale={scale}>
    <Box size={[0.85, 0.72, 0.66]} color={C.lightWood} />
    {[-0.31, 0.31].map(x => <Box key={x} position={[x, 0, 0.34]} size={[0.08, 0.74, 0.03]} color={C.wood} />)}
    <Box position={[0, 0, 0.36]} size={[0.76, 0.08, 0.04]} color={C.cream} rotation={[0, 0, 0.6]} />
  </group>;
}

function Fan({ position, powered }: { position: Vec3; powered: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (rotor.current && powered) rotor.current.rotation.z -= delta * 5; });
  return <group position={position}>
    <Cylinder position={[0, -0.25, 0]} radius={0.035} height={0.5} color={C.dark} />
    <Box position={[0, -0.49, 0]} size={[0.42, 0.05, 0.3]} color={C.dark} />
    <mesh><torusGeometry args={[0.31, 0.035, 6, 16]} /><meshStandardMaterial color={C.trim} /></mesh>
    <Unbatched><group ref={rotor}>{[0, 1, 2].map(i => <Box key={i} position={[0, 0, 0]} size={[0.52, 0.12, 0.035]} color={C.teal} rotation={[0, 0, i * Math.PI / 3]} />)}</group></Unbatched>
  </group>;
}

function Home({ powered, supplies }: { powered: boolean; supplies: boolean }) {
  return <group>
    <SolidBox position={[-14, -0.07, 15]} size={[8.6, 0.2, 10.6]} color={C.stone} />
    <Box position={[-14, 0.035, 15]} size={[7.85, 0.018, 9.85]} color="#cdae78" />
    <SolidBox position={[-18, 1.6, 15]} size={[0.26, 3.2, 10]} />
    <SolidBox position={[-10, 1.6, 15]} size={[0.26, 3.2, 10]} />
    <SolidBox position={[-14, 1.6, 20]} size={[8, 3.2, 0.26]} />
    <SolidBox position={[-16.55, 1.6, 10]} size={[2.9, 3.2, 0.26]} />
    <SolidBox position={[-11.45, 1.6, 10]} size={[2.9, 3.2, 0.26]} />
    <SolidBox position={[-14, 2.91, 10]} size={[2.2, 0.58, 0.26]} />
    <SolidBox position={[-14, 3.24, 15]} size={[8.7, 0.18, 10.7]} color={C.trim} />
    <Roof position={[-14, 3.33, 15]} width={9.1} depth={11.1} height={2} />
    <Box position={[-11.4, 4.3, 17.9]} size={[0.7, 2.2, 0.8]} color={C.cream} />
    <Box position={[-11.4, 5.42, 17.9]} size={[0.88, 0.16, 0.97]} color={C.roofDark} />
    {[-15.16, -12.84].map(x => <Box key={x} position={[x, 1.28, 9.8]} size={[0.16, 2.56, 0.2]} color={C.trim} />)}
    <Box position={[-14, 2.62, 9.8]} size={[2.5, 0.17, 0.24]} color={C.trim} />
    <TextPlate lines={['ОБЩИЙ ДОМ']} width={3.6} height={0.56} position={[-14, 3.02, 9.79]} rotation={[0, Math.PI, 0]} />
    <Window position={[-16.6, 1.8, 9.82]} rotation={[0, Math.PI, 0]} powered={powered} width={1.6} />
    <Window position={[-11.5, 1.9, 9.82]} rotation={[0, Math.PI, 0]} powered={powered} width={1.65} />
    <Window position={[-18.15, 1.75, 15.5]} rotation={[0, -Math.PI / 2, 0]} powered={powered} />
    <Window position={[-10.15, 1.8, 16]} rotation={[0, -Math.PI / 2, 0]} powered={powered} />
    <Window position={[-16.5, 1.8, 10.15]} powered={powered} />
    <Box position={[-14, 0.055, 14.5]} size={[3.5, 0.02, 3.7]} color="#8daaa0" />
    <SolidBox position={[-17.35, 0.42, 16.6]} size={[1, 0.8, 2.5]} color={C.teal} />
    <SolidBox position={[-17.65, 0.92, 16.6]} size={[0.4, 0.7, 2.5]} color={C.dark} />
    <Box position={[-17.2, 0.9, 15.8]} size={[0.56, 0.18, 0.7]} color={C.yellow} rotation={[0, 0.2, -0.15]} />
    <SolidBox position={[-10.9, 0.36, 17.2]} size={[1.4, 0.65, 2.4]} color={C.lightWood} />
    <SolidBox position={[-10.9, 0.77, 17.2]} size={[1.42, 0.22, 2.4]} color={C.trim} />
    <Box position={[-10.9, 0.9, 17.58]} size={[1.45, 0.09, 1.5]} color={C.coral} />
    <Box position={[-10.9, 0.94, 16.28]} size={[1, 0.2, 0.5]} color={C.trim} />
    <SolidBox position={[-16.5, 0.49, 19.15]} size={[2.1, 0.95, 0.85]} color={C.lightWood} />
    <Fan position={[-16.5, 1.49, 19.15]} powered={powered} />
    <RigidBody type="fixed" colliders={false} position={TARGET_POSITIONS.note} userData={{ target: 'note' }}>
      <CuboidCollider args={[0.55, 0.48, 0.1]} />
      <Box size={[1.1, 0.96, 0.17]} color={C.wood} />
      <TextPlate lines={['ЛИЧНАЯ ЗАПИСКА', 'до грозы ещё есть время', 'E — прочитать']} width={0.94} height={0.77} position={[0, 0, -0.093]} rotation={[0, Math.PI, 0]} fontSize={45} />
      <Box position={[0, -0.72, 0]} size={[0.11, 0.65, 0.12]} color={C.wood} />
    </RigidBody>
    <RigidBody type="fixed" colliders={false} position={TARGET_POSITIONS.home_supply} userData={{ target: 'home_supply' }}>
      <CuboidCollider args={[0.8, 0.4, 0.6]} />
      <Box position={[0, -0.31, 0]} size={[1.6, 0.18, 1.2]} color={C.lightWood} />
      <Box position={[0, 0.12, 0.54]} size={[1.6, 0.32, 0.12]} color={C.teal} />
      <TextPlate lines={['ПРИПАСЫ ДЛЯ ВСЕХ']} width={1.48} height={0.26} position={[0, 0.12, 0.607]} />
      {supplies && <><SupplyCrate position={[-0.35, 0.17, -0.08]} scale={0.78} /><SupplyCrate position={[0.38, 0.17, -0.08]} scale={0.78} /></>}
    </RigidBody>
    <Socket position={TARGET_POSITIONS.home_battery} target="home_battery" installed={powered} />
    <SolidBox position={[-10.45, 0.45, 13.9]} size={[0.42, 0.8, 1.15]} color={C.dark} />
    {[0, 1, 2, 3, 4].map(i => <Box key={i} position={[-10.675, 0.46, 13.5 + i * 0.2]} size={[0.035, 0.56, 0.095]} color={powered ? '#edb469' : '#87988c'} emissive={powered ? '#f79945' : '#000000'} intensity={powered ? 1.15 : 0} />)}
    <TextPlate lines={['ОБОГРЕВАТЕЛЬ']} width={1.2} height={0.23} position={[-10.68, 0.99, 13.9]} rotation={[0, -Math.PI / 2, 0]} />
    {powered && <pointLight position={[-10.85, 0.55, 13.9]} color="#ffb36b" intensity={1.8} distance={2.4} decay={2} />}
    <Cylinder position={[-14, 3.04, 14]} radius={0.28} bottom={0.4} height={0.18} color={powered ? '#ffe6b1' : C.trim} />
    {powered && <pointLight position={[-14, 2.65, 14]} color="#ffdb9d" intensity={13} distance={11} decay={2} />}
    <TextPlate lines={['УБЕЖИЩЕ ОТ ГРОЗЫ', 'ящик → на полку у стены', 'аккумулятор → справа у двери']} width={2.3} height={0.8} position={[-17.82, 1.7, 12]} rotation={[0, Math.PI / 2, 0]} fontSize={42} />
    <Box position={[-14, 0.042, 9.05]} size={[2.8, 0.018, 1.3]} color={C.lightWood} />
  </group>;
}

function Shop({ powered, aftermath }: { powered: boolean; aftermath: boolean }) {
  const fan = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (fan.current && powered) fan.current.rotation.z += delta * 2; });
  return <group>
    <SolidBox position={[-16, 1.65, -13]} size={[9, 3.3, 8]} color={C.teal} />
    <Box position={[-16, 0.2, -8.91]} size={[9.1, 0.4, 0.25]} color={C.dark} />
    <Roof position={[-16, 3.32, -13]} width={10} depth={8.8} height={1.7} color={C.coral} />
    <Box position={[-16, 3.28, -13]} size={[9.8, 0.19, 8.8]} color={C.trim} />
    <Window position={[-18.3, 1.65, -8.86]} powered={powered} width={2.6} height={1.65} />
    <Window position={[-13.5, 1.7, -8.86]} powered={powered} width={1.75} height={1.55} />
    <Box position={[-16, 1.12, -8.82]} size={[1.2, 2.24, 0.2]} color={C.dark} />
    <Box position={[-16, 1.65, -8.7]} size={[0.92, 0.9, 0.035]} color={powered ? '#ffd696' : '#88b9ad'} />
    <Cylinder position={[-15.57, 0.99, -8.62]} radius={0.055} height={0.05} color={C.yellow} rotation={[Math.PI / 2, 0, 0]} />
    <TextPlate lines={['У БОРИСА']} width={3.9} height={0.75} position={[-16, 3.79, -8.58]} background={C.trim} />
    <TextPlate lines={[powered ? 'ХОЛОДИЛЬНИК РАБОТАЕТ' : aftermath ? 'ПРОДУКТЫ БЕЗ ХОЛОДА' : 'НУЖНО ПИТАНИЕ']} width={2.45} height={0.4} position={[-18.3, 0.81, -8.62]} background={powered ? '#c9dda2' : C.yellow} />
    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <Box key={i} position={[-20 + i, 2.72, -8.05]} size={[1, 0.1, 1.9]} color={i % 2 ? C.trim : C.coral} rotation={[-0.1, 0, 0]} />)}
    {[-20.1, -11.9].map(x => <SolidBox key={x} position={[x, 1.29, -7.3]} size={[0.09, 2.58, 0.09]} color={C.trim} />)}
    <Socket position={TARGET_POSITIONS.shop_battery} target="shop_battery" installed={powered} />
    <SolidBox position={[-19.5, 0.45, -7.5]} size={[1.25, 0.9, 0.8]} color={C.wood} />
    {Array.from({ length: 6 }, (_, i) => <Boulder key={i} position={[-19.9 + (i % 3) * 0.35, 0.97, -7.65 + Math.floor(i / 3) * 0.35]} scale={[0.14, 0.14, 0.14]} color={powered || !aftermath ? '#e8a44f' : '#8f8151'} />)}
    <Box position={[-12.3, 4.14, -13]} size={[0.22, 1.8, 0.22]} color={C.dark} />
    <Unbatched><group position={[-12.3, 5.2, -12.86]} ref={fan}>{[0, 1, 2, 3].map(i => <Box key={i} size={[0.12, 1.3, 0.035]} color={C.yellow} rotation={[0, 0, i * Math.PI / 4]} />)}</group></Unbatched>
    {powered && <pointLight position={[-16, 2.3, -8]} color="#ffdc99" intensity={10} distance={8} decay={2} />}
  </group>;
}

function Generator() {
  return <group>
    <SolidBox position={[12, 0.02, -14]} size={[7, 0.12, 7]} color={C.stone} />
    <SolidBox position={[12, 0.85, -14.5]} size={[3.5, 1.6, 2.1]} color={C.yellow} />
    <Box position={[12, 0.97, -13.4]} size={[2.8, 1.08, 0.06]} color={C.dark} />
    {Array.from({ length: 8 }, (_, i) => <Box key={i} position={[10.9 + i * 0.31, 0.96, -13.35]} size={[0.1, 0.84, 0.04]} color={C.teal} />)}
    <Cylinder position={[13.3, 2, -15]} radius={0.12} height={1.2} color={C.dark} />
    <Cylinder position={[10.4, 0.6, -15.1]} radius={0.45} height={0.25} color={C.dark} rotation={[0, 0, Math.PI / 2]} />
    {[9.1, 14.9].flatMap(x => [-11.9, -17].map(z => <SolidBox key={`${x}:${z}`} position={[x, 1.65, z]} size={[0.15, 3.25, 0.15]} color={C.wood} />))}
    <Box position={[12, 3.35, -14.5]} size={[6.6, 0.18, 6.1]} rotation={[0.045, 0, 0]} color={C.teal} />
    <TextPlate lines={['ГЕНЕРАТОРНАЯ']} width={4.7} height={0.58} position={[12, 2.77, -11.8]} />
    <TextPlate lines={['ОДИН АККУМУЛЯТОР', 'ДОМ ИЛИ МАГАЗИН?']} width={2.1} height={0.7} position={[12, 1.85, -13.35]} background={C.yellow} fontSize={47} />
    <Box position={[12, 0.05, -10]} size={[1.15, 0.06, 0.95]} color={C.dark} />
    <TextPlate lines={['РЕЗЕРВ']} width={1.05} height={0.27} position={[12, 0.09, -9.5]} rotation={[-Math.PI / 2, 0, 0]} background={C.yellow} />
    <SolidBox position={[15.1, 0.65, -16]} size={[0.9, 1.3, 1.2]} color={C.teal} />
  </group>;
}

function Path({ from, to, width = 3.3 }: { from: [number, number]; to: [number, number]; width?: number }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  return <Box position={[(from[0] + to[0]) / 2, 0.012, (from[1] + to[1]) / 2]} size={[width, 0.018, Math.hypot(dx, dz)]} rotation={[0, Math.atan2(dx, dz), 0]} color={C.path} />;
}

function Tree({ position, scale = 1, autumn = false, shape = 0 }: { position: Vec3; scale?: number; autumn?: boolean; shape?: number }) {
  return <RigidBody type="fixed" colliders={false} position={position}>
    <CuboidCollider args={[0.22 * scale, 1.45 * scale, 0.22 * scale]} position={[0, 1.45 * scale, 0]} />
    <group scale={scale}>
      <Cylinder position={[0, 1.25, 0]} radius={0.17} bottom={0.26} height={2.5} sides={6} />
      <Cylinder position={[0.3, 2.1, 0]} radius={0.09} height={1.1} sides={5} rotation={[0, 0, -0.65]} />
      <Boulder position={[0, 3.7, 0]} scale={shape ? [1.4, 2.3, 1.3] : [1.85, 1.7, 1.7]} color={autumn ? '#e6b75c' : '#81af64'} />
      <Boulder position={[-0.85, 3.15, 0.1]} scale={[1.2, 1.2, 1.3]} color={autumn ? '#d39b57' : '#699b59'} />
      <Boulder position={[0.7, 3.25, 0.45]} scale={[1.1, 1.35, 1.2]} color={autumn ? '#efc66b' : '#a6c673'} />
    </group>
  </RigidBody>;
}

function Fence({ from, to, color = C.lightWood }: { from: [number, number]; to: [number, number]; color?: string }) {
  const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz), count = Math.ceil(length / 1.6);
  return <RigidBody type="fixed" colliders={false} position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation={[0, Math.atan2(dx, dz), 0]}>
    <CuboidCollider args={[0.1, 0.55, length / 2]} position={[0, 0.55, 0]} />
    {[0.42, 0.88].map(y => <Box key={y} position={[0, y, 0]} size={[0.1, 0.12, length]} color={color} />)}
    {Array.from({ length: count + 1 }, (_, i) => <Box key={i} position={[0, 0.61, -length / 2 + length * i / count]} size={[0.17, 1.22, 0.17]} color={color} />)}
  </RigidBody>;
}

function FlowerPatch({ x, z, color = C.yellow }: { x: number; z: number; color?: string }) {
  return <group position={[x, 0, z]}>
    {[[-0.3, 0.05], [0.2, 0.25], [0.05, -0.2]].map(([dx, dz], i) => <group key={i} position={[dx, 0, dz]}>
      <Cylinder radius={0.018} height={0.3 + i * 0.06} position={[0, 0.15, 0]} color={C.grassDark} sides={4} castShadow={false} />
      <Boulder position={[0, 0.33 + i * 0.035, 0]} scale={[0.13, 0.08, 0.13]} color={color} castShadow={false} />
    </group>)}
  </group>;
}

function Signpost() {
  return <group position={[-4.9, 0, 3.3]}>
    <SolidBox position={[0, 1.2, 0]} size={[0.16, 2.4, 0.16]} color={C.wood} />
    <Box position={[0, 2.13, 0]} size={[2.3, 0.42, 0.12]} color={C.lightWood} />
    <TextPlate lines={['← ОБЩИЙ ДОМ']} width={2.2} height={0.34} position={[0, 2.13, 0.066]} />
    <Box position={[0, 1.65, 0]} size={[2.3, 0.42, 0.12]} color={C.lightWood} />
    <TextPlate lines={['↑ МАГАЗИН']} width={2.2} height={0.34} position={[0, 1.65, 0.066]} />
    <Box position={[0, 1.17, 0]} size={[2.3, 0.42, 0.12]} color={C.lightWood} />
    <TextPlate lines={['ГЕНЕРАТОР →']} width={2.2} height={0.34} position={[0, 1.17, 0.066]} />
  </group>;
}

function Plaza({ storm }: { storm: boolean }) {
  const bell = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (bell.current) bell.current.rotation.z = storm ? Math.sin(clock.elapsedTime * 3.5) * 0.2 : Math.sin(clock.elapsedTime) * 0.025; });
  return <group>
    <Cylinder position={[0, 0.014, 0]} radius={5.8} height={0.025} color={C.path} sides={14} />
    <RigidBody type="fixed" position={TARGET_POSITIONS.day_bell} colliders={false} userData={{ target: 'day_bell' }}>
      <CuboidCollider args={[0.82, 1.1, 0.48]} position={[0, 0.1, 0]} />
      <Box position={[0, -0.85, 0]} size={[1.9, 0.3, 1.35]} color={C.stone} />
      {[-0.65, 0.65].map(x => <Box key={x} position={[x, 0.3, 0]} size={[0.14, 2.4, 0.16]} color={C.wood} />)}
      <Box position={[0, 1.46, 0]} size={[1.65, 0.19, 0.2]} color={C.wood} />
      <Unbatched><group ref={bell} position={[0, 1.25, 0]}>
        <Cylinder position={[0, -0.23, 0]} radius={0.21} bottom={0.43} height={0.55} color={C.yellow} sides={10} />
        <Cylinder position={[0, -0.51, 0]} radius={0.47} height={0.07} color="#c5913e" sides={10} />
        <Cylinder position={[0, -0.7, 0]} radius={0.022} height={0.4} color={C.dark} />
        <Boulder position={[0, -0.94, 0]} scale={[0.1, 0.1, 0.1]} color={C.coral} />
      </group></Unbatched>
      <TextPlate lines={['КОЛОКОЛ ПЛОЩАДИ', 'E — закончить день']} width={2.1} height={0.57} position={[0, -0.29, 0.5]} />
      <TextPlate lines={['КОЛОКОЛ ПЛОЩАДИ', 'E — закончить день']} width={2.1} height={0.57} position={[0, -0.29, -0.5]} rotation={[0, Math.PI, 0]} />
    </RigidBody>
    <SolidBox position={[3.7, 0.43, -2.8]} size={[2.5, 0.85, 0.55]} color={C.wood} />
    <Box position={[3.7, 0.95, -3.05]} size={[2.5, 0.35, 0.1]} color={C.lightWood} />
    <SolidBox position={[-3.3, 0.43, -3.1]} size={[2.5, 0.85, 0.55]} color={C.wood} />
    <Box position={[-3.3, 0.95, -3.35]} size={[2.5, 0.35, 0.1]} color={C.lightWood} />
    <Signpost />
    <TextPlate lines={['МОСТ ЧЕРЕЗ РЕЧКУ →']} width={2.7} height={0.37} position={[6.8, 1.45, 3.9]} />
    <SolidBox position={[6.8, 0.73, 3.9]} size={[0.13, 1.46, 0.13]} color={C.wood} />
  </group>;
}

function Bridge({ repaired, aftermath }: { repaired: boolean; aftermath: boolean }) {
  const damagedByStorm = aftermath && !repaired;
  return <group>
    {[21.4, 22.3, 23.2, 24.1, 25, 25.9, 26.8, 27.7].map((x, i) => {
      const missing = i === 3 || i === 4;
      const washedAway = damagedByStorm && (i === 2 || i === 5);
      if ((missing && !repaired) || washedAway) return null;
      return <SolidBox key={x} position={[x, 0.06, 4]} size={[0.87, 0.16, 3.3]} color={missing ? '#e3c894' : C.wood} />;
    })}
    {[2.33, 5.67].map(z => <group key={z}>
      <SolidBox position={[24.55, 0.52, z]} size={[7.8, 0.12, 0.12]} color={C.lightWood} />
      <SolidBox position={[24.55, 0.98, z]} size={[7.8, 0.12, 0.12]} color={C.lightWood} />
      {[21, 23.3, 25.5, 28].map(x => <SolidBox key={x} position={[x, 0.55, z]} size={[0.16, 1.3, 0.16]} color={C.wood} />)}
      <Box position={[24.5, -0.25, z]} size={[8, 0.3, 0.2]} color={C.dark} />
    </group>)}
    {repaired && <>
      <Box position={[24.55, -0.15, 4]} size={[0.17, 0.2, 3.25]} color={C.lightWood} rotation={[0, 0.25, 0]} />
      <Box position={[24.55, 0.16, 4]} size={[2, 0.035, 0.12]} color={C.dark} />
    </>}
    <RigidBody type="fixed" colliders={false} position={TARGET_POSITIONS.bridge_repair} userData={{ target: 'bridge_repair' }}>
      <CuboidCollider args={[0.65, 0.7, 0.45]} />
      <Box size={[1.3, 0.12, 0.9]} color={C.lightWood} />
      {[-0.5, 0.5].map(x => <Box key={x} position={[x, -0.33, 0]} size={[0.12, 0.66, 0.7]} color={C.wood} />)}
      <TextPlate lines={[repaired ? 'МОСТ УКРЕПЛЁН' : damagedByStorm ? 'ГРОЗА СМЫЛА НАСТИЛ' : 'МОСТУ НУЖНЫ ДОСКИ', repaired ? 'МОЖНО ПРОЙТИ' : damagedByStorm ? 'НУЖЕН РЕМОНТ' : 'принеси доски с площади']} width={2.2} height={0.63} position={[0, 0.83, 0]} />
      <Box position={[0, 0.46, -0.05]} size={[0.12, 0.9, 0.1]} color={C.wood} />
      <Box position={[0, 0.14, 0.1]} size={[0.55, 0.15, 0.14]} color={C.dark} rotation={[0, 0.3, 0]} />
      <Box position={[-0.18, 0.12, 0.18]} size={[0.09, 0.08, 0.5]} color={C.wood} rotation={[0, 0.3, 0]} />
    </RigidBody>
    {!repaired && <Box position={[23.8, -0.53, 5]} size={[0.7, 0.12, 2.2]} color={C.wood} rotation={[0.12, 0.4, 0.25]} />}
    {damagedByStorm && <>
      <SolidBox position={[24.5, -0.11, 8]} size={[0.87, 0.16, 3.3]} color={C.wood} rotation={[0.03, 0.48, 0.08]} />
      <SolidBox position={[25.6, -0.2, 11.2]} size={[0.87, 0.16, 2.5]} color={C.wood} rotation={[-0.08, -0.7, 0.12]} />
    </>}
    <Path from={[28, 4]} to={[33, 4]} width={3.1} />
    <SolidBox position={[30.2, 0.53, 4]} size={[4.6, 0.16, 3.1]} rotation={[0, 0, Math.atan(1.2 / 4.6)]} color={C.path} />
    <SolidBox position={[35, 0.53, 6]} size={[5, 1.2, 14]} color={C.grassLight} />
    <Box position={[35, 1.14, 4]} size={[5, 0.018, 3.1]} color={C.path} />
    <SolidBox position={[35.4, 1.56, 7.3]} size={[2.4, 0.85, 0.55]} color={C.lightWood} />
    <Box position={[35.4, 2.05, 7.6]} size={[2.4, 0.35, 0.1]} color={C.wood} />
  </group>;
}

function NPC({ id, position, happy }: { id: 'nina' | 'boris' | 'mira'; position: WorldPoint; happy: boolean }) {
  const bot = BOT.find(bot => bot.id === id)!;
  const body = useRef<RapierRigidBody>(null), avatar = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null), rightLeg = useRef<THREE.Group>(null), leftArm = useRef<THREE.Group>(null), rightArm = useRef<THREE.Group>(null);
  const offset = id === 'nina' ? 0 : id === 'boris' ? 3 : 6;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + offset;
    // Short patrols keep each bot at its identifiable landmark; animation is presentation only.
    const activity = THREE.MathUtils.smoothstep(Math.sin(t * 0.27), 0.4, 0.75);
    const dx = Math.sin(t * 0.7) * 0.35 * activity;
    body.current?.setNextKinematicTranslation({ x: position[0] + dx, y: position[1], z: position[2] });
    if (avatar.current) { avatar.current.position.y = Math.sin(t * 2) * 0.018; avatar.current.rotation.y = id === 'nina' ? -0.7 : id === 'mira' ? -0.35 : 0.25; }
    const stride = Math.sin(t * 6) * 0.32 * activity + Math.sin(t * 1.2) * 0.025 * (1 - activity);
    if (leftLeg.current) leftLeg.current.rotation.x = stride;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride;
    if (leftArm.current) leftArm.current.rotation.x = -stride;
    if (rightArm.current) { rightArm.current.rotation.x = stride; rightArm.current.rotation.z = happy ? -0.9 + Math.sin(t * 4) * 0.18 : -0.09; }
  });
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={position} userData={{ target: id }}>
    <CuboidCollider args={[0.33, 0.88, 0.3]} position={[0, 0.88, 0]} />
    <group ref={avatar}>
      <Cylinder position={[0, 0.93, 0]} radius={0.29} bottom={0.34} height={0.62} color={bot.color} sides={7} />
      <Box position={[0, 0.63, 0]} size={[0.53, 0.22, 0.35]} color={C.dark} />
      <group position={[-0.16, 0.58, 0]} ref={leftLeg}><Box position={[0, -0.22, 0]} size={[0.2, 0.46, 0.22]} color={C.dark} /><Box position={[0, -0.48, 0.06]} size={[0.25, 0.16, 0.4]} color="#e3c09a" /></group>
      <group position={[0.16, 0.58, 0]} ref={rightLeg}><Box position={[0, -0.22, 0]} size={[0.2, 0.46, 0.22]} color={C.dark} /><Box position={[0, -0.48, 0.06]} size={[0.25, 0.16, 0.4]} color="#e3c09a" /></group>
      <group position={[-0.34, 1.16, 0]} ref={leftArm} rotation={[0, 0, 0.09]}><Cylinder position={[0, -0.24, 0]} radius={0.105} height={0.48} color={bot.color} sides={6} /><Boulder position={[0, -0.51, 0]} scale={[0.12, 0.14, 0.12]} color="#f0c39e" /></group>
      <group position={[0.34, 1.16, 0]} ref={rightArm} rotation={[0, 0, -0.09]}><Cylinder position={[0, -0.24, 0]} radius={0.105} height={0.48} color={bot.color} sides={6} /><Boulder position={[0, -0.51, 0]} scale={[0.12, 0.14, 0.12]} color="#f0c39e" /></group>
      <Boulder position={[0, 1.5, 0.015]} scale={[0.35, 0.37, 0.32]} color="#efc6a4" />
      {[-0.11, 0.11].map(x => <Box key={x} position={[x, 1.54, 0.304]} size={[0.055, 0.08, 0.03]} color={C.dark} />)}
      <Box position={[0, 1.4, 0.315]} size={[happy ? 0.14 : 0.1, 0.035, 0.026]} color="#925d4d" rotation={[0, 0, happy ? 0 : -0.1]} />
      <Boulder position={[0, 1.49, 0.34]} scale={[0.065, 0.07, 0.09]} color="#dfa583" />
      {id === 'nina' ? <><Cylinder position={[0, 1.81, 0]} radius={0.35} height={0.13} color={C.yellow} sides={8} /><Boulder position={[0.3, 1.5, -0.13]} scale={[0.19, 0.27, 0.19]} color="#8a6044" /></> : id === 'boris' ? <><Cylinder position={[0, 1.83, 0]} radius={0.36} height={0.19} color={bot.color} sides={8} /><Box position={[0, 1.76, 0.3]} size={[0.5, 0.07, 0.3]} color={bot.color} /><Box position={[0, 1.38, 0.26]} size={[0.2, 0.09, 0.08]} color="#7c5747" /></> : <><Boulder position={[0, 1.8, -0.02]} scale={[0.36, 0.19, 0.32]} color="#654f48" /><Box position={[0, 1.75, 0.29]} size={[0.45, 0.09, 0.1]} color={C.yellow} /></>}
      <TextPlate lines={[`${bot.name} · БОТ`]} position={[0, 2.15, 0]} width={1.3} height={0.3} background={bot.color} ink="#ffffff" />
    </group>
  </RigidBody>;
}

const TREES: [number, number, number, boolean?][] = [
  [-23, 8, 1.1], [-23, 18, 1.3], [-19, 24, 0.95, true], [-9, 24, 1.2], [-5, 19, 1.1],
  [4, 14, 1.3], [15, 12, 1], [17, 19, 1.4], [19, -5, 0.85, true], [18, -19, 1.2],
  [5, -19, 1.3], [-7, -19, 1.15], [-23, -10, 1.1], [-23, -19, 1.4], [-28, -3, 1.2],
  [-31, 8, 1.2, true], [-28, 26, 1.3], [-15, 30, 1.2], [0, 28, 1.5], [13, 29, 1.2],
  [19, 34, 1.1], [29, -9, 1.2], [34, -19, 1.5], [32, 20, 1.3], [29, 29, 1.4],
  [-33, -22, 1.5], [-13, -27, 1.3], [1, -28, 1.4], [19, -27, 1.2],
];

function Scenery() {
  return <group>
    {TREES.map(([x, z, scale, autumn], i) => <Tree key={i} position={[x, 0, z]} scale={scale} autumn={autumn} shape={i % 3 === 0 ? 1 : 0} />)}
    {[-33, -22, -10, 4, 18, 32].flatMap((x, i) => [-38, 47].map((z, j) => <Boulder key={`${x}:${z}`} position={[x, -2.5, z]} scale={[12, 8 + (i % 3) * 2, 10]} color={j ? '#90b48a' : '#8cae94'} castShadow={false} />))}
    {[-24, -7, 13, 30].map((z, i) => <Boulder key={z} position={[-50, -2, z]} scale={[13, 9 + i, 14]} color="#a7bf8f" castShadow={false} />)}
    {[-20, 4, 30].map((z, i) => <Boulder key={z} position={[52, -2, z]} scale={[12, 11 + i * 2, 16]} color="#8ca98c" castShadow={false} />)}
    <Fence from={[-21, 10]} to={[-21, 21]} /><Fence from={[-21, 21]} to={[-7, 21]} /><Fence from={[-7, 13]} to={[-7, 21]} />
    <Fence from={[-22, -6]} to={[-22, -19]} /><Fence from={[-22, -19]} to={[-11, -19]} />
    <Fence from={[8, -18]} to={[16, -18]} /><Fence from={[16, -18]} to={[16, -12]} />
    <Fence from={[20.5, 8]} to={[20.5, 22]} /><Fence from={[20.5, -20]} to={[20.5, 0]} />
    <Fence from={[-35, -28]} to={[20, -28]} /><Fence from={[-35, -28]} to={[-35, 34]} /><Fence from={[-35, 34]} to={[20, 34]} />
    <Fence from={[29, -28]} to={[37, -28]} /><Fence from={[37, -28]} to={[37, -2]} /><Fence from={[37, 15]} to={[37, 34]} />
    {[[7, 8], [6.5, 8.5], [-8, 7], [-20, 6], [-8, -14], [15.7, 9], [19, -3], [-24, 21], [2, 18], [6, -15]].map(([x, z], i) => <FlowerPatch key={i} x={x} z={z} color={i % 2 ? '#e99a86' : C.yellow} />)}
    {[[-26, 14], [9, 22], [1, -25]].map(([x, z], i) => <group key={i}>
      <SolidBox position={[x, 1.42, z]} size={[5.5, 2.8, 5]} color={i === 1 ? '#e6b382' : '#ebd6ae'} />
      <Roof position={[x, 2.85, z]} width={6.3} depth={5.8} height={1.7} color={i === 1 ? C.teal : C.coral} />
      <Box position={[x, 1.05, z - 2.53]} size={[1, 2.1, 0.12]} color={C.teal} />
      <Window position={[x - 1.6, 1.5, z - 2.58]} rotation={[0, Math.PI, 0]} width={1.1} height={1.1} />
      <Window position={[x + 1.6, 1.5, z - 2.58]} rotation={[0, Math.PI, 0]} width={1.1} height={1.1} />
      <Box position={[x + 1.8, 4, z + 1.4]} size={[0.5, 1.4, 0.6]} color={C.cream} />
    </group>)}
    {[[21.6, -11], [26.8, 13], [21.6, 19], [27.6, -3], [21.7, 28]].map(([x, z], i) => <RigidBody key={i} type="fixed" colliders={false} position={[x, -0.04, z]}>
      <CuboidCollider args={[0.6, 0.4, 0.5]} /><Boulder position={[0, 0, 0]} scale={[0.9, 0.55, 0.7]} color={C.stone} />
    </RigidBody>)}
  </group>;
}

function Weather({ phase }: { phase: FPSState['phase'] }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null), ambient = useRef<THREE.HemisphereLight>(null), rain = useRef<THREE.LineSegments>(null), water = useRef<THREE.Mesh>(null);
  const blend = useRef(0);
  const rainGeometry = useMemo(() => {
    const vertices: number[] = [];
    for (let i = 0; i < 650; i++) {
      const x = Math.sin(i * 73.17) * 37, z = Math.sin(i * 41.37 + 8) * 34, y = ((i * 17.217) % 15);
      const underRoof = (x > -18.6 && x < -9.4 && z > 9.4 && z < 20.6)
        || (x > -21 && x < -11 && z > -18 && z < -7)
        || (x > 8.5 && x < 15.5 && z > -18 && z < -11);
      if (underRoof) continue;
      vertices.push(x, y, z, x - 0.12, y + 0.63, z - 0.03);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); return geo;
  }, []);
  useEffect(() => {
    scene.background = new THREE.Color('#b7d9d5'); scene.fog = new THREE.Fog('#b7d9d5', 37, 105);
    return () => { scene.fog = null; rainGeometry.dispose(); };
  }, [scene, rainGeometry]);
  const sky = useMemo(() => new THREE.Color(), []), sunColor = useMemo(() => new THREE.Color('#b7d9d5'), []), stormColor = useMemo(() => new THREE.Color('#778d99'), []);
  useFrame(({ clock }, delta) => {
    const target = phase === 'storm' ? 1 : phase === 'aftermath' ? 0.27 : 0;
    blend.current = THREE.MathUtils.damp(blend.current, target, 0.65, delta);
    sky.copy(sunColor).lerp(stormColor, blend.current);
    (scene.background as THREE.Color)?.copy(sky);
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.copy(sky); scene.fog.near = 37 - blend.current * 17; scene.fog.far = 105 - blend.current * 41; }
    if (sun.current) sun.current.intensity = 2.3 - blend.current * 1.6;
    if (ambient.current) ambient.current.intensity = 1.8 - blend.current * 0.35;
    if (rain.current) {
      rain.current.visible = blend.current > 0.06;
      rain.current.position.y = -((clock.elapsedTime * 7) % 9);
      (rain.current.material as THREE.LineBasicMaterial).opacity = blend.current * (phase === 'aftermath' ? 0.15 : 0.45);
    }
    if (water.current) water.current.position.y = -0.2 + blend.current * 0.12 + Math.sin(clock.elapsedTime * 1.2) * 0.012;
  });
  return <>
    <hemisphereLight ref={ambient} args={['#d7ece8', '#9ba878', 1.8]} />
    <directionalLight ref={sun} position={[-18, 29, 15]} intensity={2.3} color="#fff1d2" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-near={1} shadow-camera-far={85} shadow-bias={-0.00025} shadow-normalBias={0.025} />
    <mesh ref={water} position={[24.5, -0.2, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[5, 73]} /><meshStandardMaterial color={C.water} roughness={0.3} metalness={0.1} transparent opacity={0.9} /></mesh>
    {Array.from({ length: 22 }, (_, i) => <Box key={i} position={[22.7 + (i % 4) * 0.95, -0.183, -27 + i * 3]} size={[0.55 + (i % 3) * 0.18, 0.008, 0.04]} color="#b4dce0" castShadow={false} />)}
    <lineSegments ref={rain} geometry={rainGeometry} visible={false}><lineBasicMaterial color="#cfdfec" transparent opacity={0} depthWrite={false} /></lineSegments>
    {[[-15, 18, -30], [18, 21, -39], [32, 19, 15], [-32, 20, 12]].map(([x, y, z], i) => <group key={i} position={[x, y, z]}>
      <Boulder position={[0, 0, 0]} scale={[5, 1.5, 2.2]} color="#e9eee0" castShadow={false} /><Boulder position={[3, 0.3, 0]} scale={[3, 1.7, 2]} color="#e9eee0" castShadow={false} />
    </group>)}
  </>;
}

/** Static environment and remote participant presentation; the local controller owns movement/items. */
function Neighborhood({ state }: { state: FPSState }) {
  const homePowered = state.batteryAt === 'home', shopPowered = state.batteryAt === 'shop';
  return <StaticBatch>
    <Weather phase={state.phase} />
    <SolidBox position={[-8, -0.5, 4]} size={[60, 1, 68]} color={C.grass} />
    <SolidBox position={[32.5, -0.5, 4]} size={[11, 1, 68]} color={C.grass} />
    <SolidBox position={[24.5, -1.3, 4]} size={[5, 1, 68]} color="#a9a879" />
    <Box position={[-15, 0.006, 4]} size={[15, 0.01, 8]} color={C.grassLight} />
    <Box position={[9, 0.006, 3]} size={[13, 0.01, 17]} color="#a0be73" />
    <Path from={[-14, 10]} to={[-14, 6]} /><Path from={[-14, 6]} to={[-3, 0]} />
    <Path from={[-16, -8]} to={[-10, -4]} /><Path from={[-10, -4]} to={[0, 0]} />
    <Path from={[0, 0]} to={[12, -8]} /><Path from={[12, -8]} to={[12, -11.5]} />
    <Path from={[3, 1]} to={[10, 4]} /><Path from={[10, 4]} to={[21, 4]} />
    <Path from={[-16, -6]} to={[-14, 7]} width={2.5} />
    <Home powered={homePowered} supplies={state.deliveredSupplies} />
    <Shop powered={shopPowered} aftermath={state.phase === 'aftermath'} />
    <Generator />
    <Plaza storm={state.phase === 'storm'} />
    <Bridge repaired={state.bridgeRepaired} aftermath={state.phase === 'aftermath'} />
    <Scenery />
    <Unbatched>
      <NPC id="nina" position={TARGET_POSITIONS.nina} happy={homePowered} />
      <NPC id="boris" position={TARGET_POSITIONS.boris} happy={shopPowered} />
      <NPC id="mira" position={TARGET_POSITIONS.mira} happy={state.bridgeRepaired} />
    </Unbatched>
  </StaticBatch>;
}

// Camera checkpoints, hover prompts and diary events do not alter the scenery.
export default memo(Neighborhood, (before, after) => before.state.phase === after.state.phase
  && before.state.batteryAt === after.state.batteryAt
  && before.state.deliveredSupplies === after.state.deliveredSupplies
  && before.state.bridgeRepaired === after.state.bridgeRepaired);
