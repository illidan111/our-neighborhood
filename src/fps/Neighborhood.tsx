import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { BOT } from '../game';
import type { FPSState, TargetId } from './model';
import { TARGET_POSITIONS, type WorldPoint } from './landmarks';
import { StaticBatch, StaticPrimitive, Unbatched } from './StaticBatch';
import { Character } from './Character';
import type { CharacterMotion } from './Character';
import { GRAPHICS } from './quality';
import type { GraphicsQuality } from './quality';

const C = {
  grass: '#8ea96d', grassLight: '#a5b97d', grassDark: '#557954', cream: '#ead9b9',
  trim: '#f5e8ce', coral: '#bd7557', roofDark: '#895744', teal: '#608f89',
  dark: '#354e50', wood: '#936c4b', lightWood: '#c59e70', path: '#bcb7a0',
  stone: '#a6ada7', water: '#579da9', yellow: '#dfb768', ink: '#34494a',
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
    <Box position={[0, height + 0.035, 0]} size={[0.18, 0.16, depth + 0.18]} color={C.roofDark} />
    {[-1, 1].map(side => <group key={side}>
      <Box position={[side * width / 2, -0.025, 0]} size={[0.14, 0.16, depth + 0.15]} color={C.roofDark} />
      {Array.from({ length: 4 }, (_, i) => {
        const t = (i + 1) / 5;
        return <Box key={i} position={[side * width / 2 * t, height * (1 - t) + 0.025, 0]} size={[0.065, 0.045, depth]} color={i % 2 ? C.roofDark : '#d08a65'} castShadow={false} />;
      })}
      {[-1, 1].map(end => <Box key={end} position={[side * width / 4, height / 2, end * (depth / 2 + 0.025)]} size={[Math.hypot(width / 2, height), 0.14, 0.13]} rotation={[0, 0, -side * Math.atan2(height, width / 2)]} color={C.roofDark} />)}
    </group>)}
  </RigidBody>;
}

function Window({ position, rotation = [0, 0, 0], powered = false, width = 1.6, height = 1.25 }: { position: Vec3; rotation?: Vec3; powered?: boolean; width?: number; height?: number }) {
  return <group position={position} rotation={rotation}>
    <Box size={[width + 0.16, height + 0.16, 0.13]} color={C.trim} />
    <Box position={[0, 0, 0.08]} size={[width, height, 0.05]} color={powered ? '#ffe2a0' : '#73a6a0'} emissive={powered ? '#ffd879' : '#000000'} intensity={powered ? 0.75 : 0} />
    <Box position={[0, 0, 0.12]} size={[0.065, height, 0.06]} color={C.trim} />
    <Box position={[0, 0, 0.12]} size={[width, 0.065, 0.06]} color={C.trim} />
    <Box position={[0, -height / 2 - 0.1, 0.2]} size={[width + 0.35, 0.12, 0.4]} color={C.lightWood} />
    {[-1, 1].map(side => <group key={side} position={[side * (width / 2 + 0.25), 0, 0.04]}>
      <Box size={[0.28, height + 0.1, 0.11]} color={C.teal} />
      <Box position={[0, height * 0.34, 0.07]} size={[0.3, 0.055, 0.05]} color={C.dark} />
      <Box position={[0, -height * 0.34, 0.07]} size={[0.3, 0.055, 0.05]} color={C.dark} />
    </group>)}
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
    <TextPlate lines={['ПРОДУКТЫ · У БОРИСА']} width={4.4} height={0.75} position={[-16, 3.79, -8.58]} background={C.wood} ink={C.trim} />
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
  const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz);
  const rows = Math.max(1, Math.floor(length / 0.95)), columns = Math.max(2, Math.round(width / 0.85));
  return <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation={[0, Math.atan2(dx, dz), 0]}>
    <Box position={[0, 0.012, 0]} size={[width, 0.018, length]} color="#9aa47d" castShadow={false} />
    {Array.from({ length: rows * columns }, (_, i) => {
      const row = Math.floor(i / columns), column = i % columns;
      const jitter = Math.sin(row * 9.13 + column * 4.97 + from[0]);
      return <StaticPrimitive key={i} shape="paver" position={[(column + 0.5) / columns * width - width / 2 + jitter * 0.07, 0.032, (row + 0.5) / rows * length - length / 2 + jitter * 0.05]} scale={[width / columns * 0.51, 0.045, length / rows * 0.51]} rotation={[0, jitter * 0.22, 0]} color={['#c5c2af', '#b5b7a8', '#d0c8b1', '#bcbba8'][(row + column) % 4]} castShadow={false} />;
    })}
  </group>;
}

function Tree({ position, scale = 1, autumn = false, shape = 0 }: { position: Vec3; scale?: number; autumn?: boolean; shape?: number }) {
  return <RigidBody type="fixed" colliders={false} position={position}>
    <CuboidCollider args={[0.22 * scale, 1.45 * scale, 0.22 * scale]} position={[0, 1.45 * scale, 0]} />
    <group scale={scale}>
      <Cylinder position={[0, 1.25, 0]} radius={0.17} bottom={0.26} height={2.5} sides={6} />
      <Cylinder position={[0.3, 2.1, 0]} radius={0.09} height={1.1} sides={5} rotation={[0, 0, -0.65]} />
      <StaticPrimitive shape="leaf" position={[0, 3.7, 0]} scale={shape ? [1.4, 2.3, 1.3] : [1.85, 1.7, 1.7]} color={autumn ? '#c6b46b' : '#7d9c5c'} />
      <StaticPrimitive shape="leaf" position={[-0.85, 3.15, 0.1]} scale={[1.2, 1.2, 1.3]} color={autumn ? '#b6a264' : '#62834e'} />
      <StaticPrimitive shape="leaf" position={[0.7, 3.25, 0.45]} scale={[1.1, 1.35, 1.2]} color={autumn ? '#d5c17c' : '#a0b574'} />
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

function FlowerPatch({ x, z, y = 0, color = '#c4b3d4', sparse = false }: { x: number; z: number; y?: number; color?: string; sparse?: boolean }) {
  return <group position={[x, y, z]}>
    {Array.from({ length: sparse ? 4 : 8 }, (_, i) => {
      const a = i * 2.4, radius = Math.sqrt(i + 1) * 0.21, height = 0.27 + (i % 3) * 0.09;
      return <group key={i} position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]}>
        <StaticPrimitive shape="grass" scale={[0.35, height * 1.15, 0.35]} rotation={[0, a, 0]} color={i % 2 ? '#668653' : '#839c5e'} castShadow={false} />
        <Cylinder radius={0.009} height={height} position={[0, height / 2, 0]} color={C.grassDark} sides={4} castShadow={false} />
        <StaticPrimitive shape="flower" position={[0, height, 0]} scale={[0.13, 0.13, 0.13]} rotation={[0.12, a, 0.22]} color={i % 3 === 0 ? '#f1e9d4' : color} castShadow={false} />
        <Boulder position={[0, height + 0.011, 0]} scale={[0.027, 0.019, 0.027]} color="#d6b66c" castShadow={false} />
      </group>;
    })}
  </group>;
}

/** A small optional side garden: four fixed step/platform colliders, outside all task paths. */
function GardenTerrace() {
  return <group>
    <SolidBox position={[-26, 0.3, 2]} size={[5, 0.6, 5]} color={C.stone} />
    <Box position={[-26, 0.605, 2]} size={[4.9, 0.02, 4.9]} color={C.grassLight} castShadow={false} />
    {[0, 1, 2].map(i => <SolidBox key={i} position={[-22.05 - i * 0.65, (i + 1) * 0.075, 2]} size={[0.68, (i + 1) * 0.15, 2]} color={i % 2 ? '#b7b8ab' : '#c9c6b5'} />)}
    {[-0.35, 4.35].map(z => <Box key={z} position={[-26, 0.7, z]} size={[5.1, 0.18, 0.28]} color="#bdc0b2" />)}
    {Array.from({ length: 12 }, (_, i) => <Box key={i} position={[-23.485, 0.12 + Math.floor(i / 6) * 0.28, -0.13 + (i % 6) * 0.83]} size={[0.04, 0.23, 0.76]} color={i % 3 ? '#b7b8ac' : '#9baba2'} />)}
    <FlowerPatch x={-27.3} z={0.7} y={0.62} color="#d4a6ad" />
    <FlowerPatch x={-27.3} z={3.5} y={0.62} color="#b9abd2" />
    <TextPlate lines={['САД СОСЕДЕЙ']} width={1.6} height={0.36} position={[-27.7, 1.52, 2]} rotation={[0, Math.PI / 2, 0]} />
    <Box position={[-27.7, 1.1, 2]} size={[0.1, 0.95, 0.12]} color={C.wood} />
  </group>;
}

function RouteGardens({ quality }: { quality: GraphicsQuality }) {
  const beds: [number, number, string][] = [
    [-17.6, 5, '#d2a4ab'], [-17.8, 2.5, '#cab5d4'], [-17.9, -0.3, '#cab5d4'], [-18.1, -3, '#d9b68c'],
    [-11.7, 4.6, '#e2c69a'], [-11.8, 1.7, '#d5b0c0'], [-20.1, -5.3, '#d2a4ab'], [-18.2, -5.8, '#d5b0c0'],
    [6.8, 5.7, '#c0b3d5'], [9, 6.3, '#d4b2c8'], [12, 6.5, '#c0b3d5'], [15.2, 6.5, '#c0b3d5'],
    [17.5, 2, '#e8d6ab'], [9.4, -8.4, '#d2bd88'], [14.8, -9, '#d2bd88'], [16.7, -11.7, '#e8d6ab'],
  ];
  return <group>
    {beds.map(([x, z, color], i) => <group key={i}>
      <FlowerPatch x={x} z={z} color={color} sparse={quality === 'low'} />
      {quality !== 'low' && <FlowerPatch x={x + 0.8} z={z + 0.45} color={color} />}
      {[-1, 1].map(side => <StaticPrimitive key={side} shape="grass" position={[x + side * 0.78, 0.02, z - 0.45]} scale={[0.65, 0.5, 0.65]} rotation={[0, i * 1.7, 0]} color={i % 2 ? '#8ba367' : '#708d54'} castShadow={false} />)}
    </group>)}
    <GardenTerrace />
    {/* Window boxes and an entrance lintel leave the 2.2 m doorway fully clear. */}
    {[-16.6, -11.5].map(x => <group key={x}>
      <Box position={[x, 1.0, 9.63]} size={[1.85, 0.3, 0.42]} color={C.wood} />
      <FlowerPatch x={x} z={9.6} y={1.16} sparse color="#d7a9b2" />
    </group>)}
    <Box position={[-14, 2.74, 9.63]} size={[2.75, 0.22, 0.42]} color={C.wood} />
    <Box position={[-16, 0.035, -6.3]} size={[3.8, 0.05, 1.8]} color={C.stone} castShadow={false} />
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
  const motion = useRef<CharacterMotion>({ speed: 0, distance: 0, animation: 'idle' });
  const previous = useRef({ x: position[0], z: position[2] });
  const target = useRef({ x: position[0], y: position[1], z: position[2] });
  const offset = id === 'nina' ? 0 : id === 'boris' ? 3 : 6;
  const restingAngle = id === 'nina' ? -0.7 : id === 'mira' ? -0.35 : 0.25;
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + offset;
    // Preserve the original patrol and collider. Only presentation follows actual travel.
    const activity = THREE.MathUtils.smoothstep(Math.sin(t * 0.27), 0.4, 0.75);
    const dx = Math.sin(t * 0.7) * 0.35 * activity;
    target.current.x = position[0] + dx;
    body.current?.setNextKinematicTranslation(target.current);
    const actual = body.current?.translation();
    if (actual) {
      const x = actual.x - previous.current.x, z = actual.z - previous.current.z;
      const travel = Math.hypot(x, z);
      motion.current.speed = travel / Math.max(delta, 0.0001);
      motion.current.distance += travel;
      motion.current.animation = motion.current.speed > 0.025 ? 'walk' : 'idle';
      previous.current.x = actual.x; previous.current.z = actual.z;
      if (avatar.current) {
        const angle = motion.current.speed > 0.025 ? Math.atan2(x, z) : restingAngle;
        const difference = Math.atan2(Math.sin(angle - avatar.current.rotation.y), Math.cos(angle - avatar.current.rotation.y));
        avatar.current.rotation.y += difference * (1 - Math.exp(-delta * 9));
      }
    }
  });
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={position} userData={{ target: id }}>
    <CuboidCollider args={[0.33, 0.88, 0.3]} position={[0, 0.88, 0]} />
    <group ref={avatar} rotation={[0, restingAngle, 0]}>
      <Character variant="base" color={bot.color} motion={motion.current} reactionToken={happy ? 1 : undefined} />
    </group>
    <TextPlate lines={[`${bot.name} · БОТ`]} position={[0, 2.2, 0]} width={1.05} height={0.24} background={C.trim} ink={C.ink} />
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
    {[-52, -25, 3, 31, 58].map((x, i) => <StaticPrimitive key={`mountain-${i}`} shape="mountain" position={[x, -2, -68 - (i % 2) * 8]} scale={[25, 23 + (i % 3) * 7, 21]} rotation={[0, i * 0.47, 0]} color={i % 2 ? '#a2b9ba' : '#91acae'} castShadow={false} receiveShadow={false} />)}
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

function Weather({ phase, quality }: { phase: FPSState['phase']; quality: GraphicsQuality }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null), ambient = useRef<THREE.HemisphereLight>(null), rain = useRef<THREE.LineSegments>(null), water = useRef<THREE.Mesh>(null);
  const blend = useRef(0), rainfall = useRef(0);
  const qualitySettings = GRAPHICS[quality];
  const rainGeometry = useMemo(() => {
    const vertices: number[] = [];
    for (let i = 0; i < qualitySettings.rainCount; i++) {
      const x = Math.sin(i * 73.17) * 37, z = Math.sin(i * 41.37 + 8) * 34, y = ((i * 17.217) % 15);
      const underRoof = (x > -18.6 && x < -9.4 && z > 9.4 && z < 20.6)
        || (x > -21 && x < -11 && z > -18 && z < -7)
        || (x > 8.5 && x < 15.5 && z > -18 && z < -11);
      if (underRoof) continue;
      vertices.push(x, y, z, x - 0.23, y + 0.74, z - 0.07);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); return geo;
  }, [qualitySettings.rainCount]);
  useEffect(() => {
    scene.background = new THREE.Color('#c1dce4'); scene.fog = new THREE.Fog('#c1dce4', 40, 122);
    return () => { scene.fog = null; rainGeometry.dispose(); };
  }, [scene, rainGeometry]);
  useEffect(() => {
    // Three allocates a shadow target lazily; changing mapSize alone does not resize it.
    if (sun.current) { sun.current.shadow.map?.dispose(); sun.current.shadow.map = null; }
  }, [quality]);
  const sky = useMemo(() => new THREE.Color(), []), sunColor = useMemo(() => new THREE.Color('#c1dce4'), []), stormColor = useMemo(() => new THREE.Color('#7c909e'), []);
  useFrame(({ clock }, delta) => {
    const target = phase === 'storm' ? 1 : phase === 'aftermath' ? 0.27 : 0;
    blend.current = THREE.MathUtils.damp(blend.current, target, 0.65, delta);
    sky.copy(sunColor).lerp(stormColor, blend.current);
    (scene.background as THREE.Color)?.copy(sky);
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.copy(sky); scene.fog.near = 40 - blend.current * 13; scene.fog.far = 122 - blend.current * 37; }
    if (sun.current) sun.current.intensity = 2.15 - blend.current * 1.4;
    if (ambient.current) ambient.current.intensity = 1.45 - blend.current * 0.12;
    rainfall.current = THREE.MathUtils.damp(rainfall.current, phase === 'storm' ? 1 : 0, 0.85, delta);
    if (rain.current) {
      rain.current.position.y = -((clock.elapsedTime * 7) % 9);
      (rain.current.material as THREE.LineBasicMaterial).opacity = rainfall.current * 0.48;
    }
    if (water.current) water.current.position.y = -0.2 + blend.current * 0.12 + Math.sin(clock.elapsedTime * 1.2) * 0.012;
  });
  return <>
    <hemisphereLight ref={ambient} args={['#dce5f0', '#b5aaa0', 1.45]} />
    <directionalLight ref={sun} position={[-18, 29, 15]} intensity={2.15} color="#fff0d6" castShadow={qualitySettings.shadowMap > 0} shadow-mapSize={[qualitySettings.shadowMap || 512, qualitySettings.shadowMap || 512]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-near={1} shadow-camera-far={85} shadow-bias={-0.00025} shadow-normalBias={0.025} />
    <mesh ref={water} position={[24.5, -0.2, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[5, 73]} /><meshStandardMaterial color={C.water} roughness={0.3} metalness={0.1} transparent opacity={0.9} /></mesh>
    {Array.from({ length: 22 }, (_, i) => <Box key={i} position={[22.7 + (i % 4) * 0.95, -0.183, -27 + i * 3]} size={[0.55 + (i % 3) * 0.18, 0.008, 0.04]} color="#b4dce0" castShadow={false} />)}
    <lineSegments ref={rain} geometry={rainGeometry}><lineBasicMaterial color="#cfdfec" transparent opacity={0} depthWrite={false} /></lineSegments>
    {[[-15, 18, -30], [18, 21, -39], [32, 19, 15], [-32, 20, 12]].map(([x, y, z], i) => <group key={i} position={[x, y, z]}>
      <Boulder position={[0, 0, 0]} scale={[5, 1.5, 2.2]} color="#e9eee0" castShadow={false} /><Boulder position={[3, 0.3, 0]} scale={[3, 1.7, 2]} color="#e9eee0" castShadow={false} />
    </group>)}
  </>;
}

const StaticScenery = memo(Scenery);
const StaticRouteGardens = memo(RouteGardens);
const StableHome = memo(Home);
const StableShop = memo(Shop);
const StaticGenerator = memo(Generator);
const StableBridge = memo(Bridge);

/** Static environment and remote participant presentation; the local controller owns movement/items. */
function Neighborhood({ state, quality = 'high' }: { state: FPSState; quality?: GraphicsQuality }) {
  const homePowered = state.batteryAt === 'home', shopPowered = state.batteryAt === 'shop';
  return <StaticBatch storm={state.phase === 'storm'}>
    <Weather phase={state.phase} quality={quality} />
    <SolidBox position={[-8, -0.5, 4]} size={[60, 1, 68]} color={C.grass} />
    <SolidBox position={[32.5, -0.5, 4]} size={[11, 1, 68]} color={C.grass} />
    <SolidBox position={[24.5, -1.3, 4]} size={[5, 1, 68]} color="#a9a879" />
    <Box position={[-15, 0.006, 4]} size={[15, 0.01, 8]} color={C.grassLight} />
    <Box position={[9, 0.006, 3]} size={[13, 0.01, 17]} color="#98ae73" />
    <Path from={[-14, 10]} to={[-14, 6]} /><Path from={[-14, 6]} to={[-3, 0]} />
    <Path from={[-16, -8]} to={[-10, -4]} /><Path from={[-10, -4]} to={[0, 0]} />
    <Path from={[0, 0]} to={[12, -8]} /><Path from={[12, -8]} to={[12, -11.5]} />
    <Path from={[3, 1]} to={[10, 4]} /><Path from={[10, 4]} to={[21, 4]} />
    <Path from={[-16, -6]} to={[-14, 7]} width={2.5} />
    <StableHome powered={homePowered} supplies={state.deliveredSupplies} />
    <StableShop powered={shopPowered} aftermath={state.phase === 'aftermath'} />
    <StaticGenerator />
    <Plaza storm={state.phase === 'storm'} />
    <StableBridge repaired={state.bridgeRepaired} aftermath={state.phase === 'aftermath'} />
    <StaticScenery />
    <StaticRouteGardens quality={quality} />
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
  && before.state.bridgeRepaired === after.state.bridgeRepaired
  && before.quality === after.quality);
