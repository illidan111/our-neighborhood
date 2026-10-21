import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BOT } from "../game";
import "./scene.css";

type Place = "home" | "shop" | "power" | "square" | "bridge";
type Vec3 = [number, number, number];
interface Props {
  world: {
    bridge: number;
    home: number;
    power: number;
    shop: number;
    weather: "sun" | "cloud" | "storm";
  };
  supplies: number;
  privateSupplies?: number;
  playerColor: string;
  selected: Place | null;
  onSelect: (place: Place) => void;
  interactive?: boolean;
}

const botColors = Object.fromEntries(BOT.map((bot) => [bot.id, bot.color]));

const C = {
  cream: "#f7e9c6",
  trim: "#fff6df",
  roof: "#e77b55",
  roofEdge: "#c96548",
  green: "#93ad62",
  darkGreen: "#567d54",
  lightGreen: "#c1ce77",
  path: "#e2d1ad",
  wood: "#aa7650",
  woodLight: "#c5925e",
  water: "#68bfbd",
  dark: "#405b55",
  turquoise: "#529f91",
  sand: "#c3b493",
  rock: "#c2b39a",
  glass: "#5e8d8a",
};
const locations: Record<Place, { name: string; point: Vec3; label: Vec3 }> = {
  home: {
    name: "Общий дом",
    point: [-3.05, 0, 1.2],
    label: [-3.05, 3.25, 1.3],
  },
  shop: { name: "Магазин", point: [-2.8, 0, -2.5], label: [-2.8, 2.9, -2.5] },
  power: {
    name: "Электростанция",
    point: [2.25, 0, -2.5],
    label: [2.35, 3.5, -2.5],
  },
  square: { name: "Площадь", point: [0.4, 0, 1.15], label: [0.4, 1.7, 1.15] },
  bridge: { name: "Мост", point: [4.2, 0, 2.25], label: [4.35, 1.55, 2.25] },
};

function Box({
  position = [0, 0, 0],
  size = [1, 1, 1],
  color = C.cream,
  rotation,
  ...props
}: {
  position?: Vec3;
  size?: Vec3;
  color?: string;
  rotation?: Vec3;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      {...props}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function Ball({
  position,
  scale = [1, 1, 1],
  color,
  detail = 1,
}: {
  position: Vec3;
  scale?: Vec3;
  color: string;
  detail?: number;
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <icosahedronGeometry args={[1, detail]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Cylinder({
  position,
  radius,
  height,
  color,
  topRadius,
  segments = 12,
}: {
  position: Vec3;
  radius: number;
  height: number;
  color: string;
  topRadius?: number;
  segments?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <cylinderGeometry
        args={[topRadius ?? radius, radius, height, segments]}
      />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function Roof({
  width,
  depth,
  height,
}: {
  width: number;
  depth: number;
  height: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -width / 2,
      0,
      -depth / 2,
      width / 2,
      0,
      -depth / 2,
      0,
      height,
      -depth / 2,
      -width / 2,
      0,
      depth / 2,
      width / 2,
      0,
      depth / 2,
      0,
      height,
      depth / 2,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    g.setIndex([
      0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
    ]);
    g.computeVertexNormals();
    return g;
  }, [width, depth, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={C.roof} flatShading />
    </mesh>
  );
}

function Window({
  position,
  rotation = [0, 0, 0],
  lit = true,
  width = 0.53,
  height = 0.64,
}: {
  position: Vec3;
  rotation?: Vec3;
  lit?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <group position={position} rotation={rotation}>
      <Box size={[width + 0.13, height + 0.13, 0.08]} color={C.trim} />
      <mesh position={[0, 0, 0.048]}>
        <boxGeometry args={[width, height, 0.035]} />
        <meshStandardMaterial
          color={lit ? "#eccd7d" : C.glass}
          emissive={lit ? "#eccd7d" : "#000000"}
          emissiveIntensity={lit ? 0.25 : 0}
        />
      </mesh>
      <Box
        position={[0, 0, 0.08]}
        size={[0.045, height, 0.035]}
        color={C.wood}
      />
      <Box
        position={[0, 0, 0.08]}
        size={[width, 0.045, 0.035]}
        color={C.wood}
      />
      <Box
        position={[0, -height / 2 - 0.06, 0.1]}
        size={[width + 0.25, 0.09, 0.2]}
        color={C.trim}
      />
    </group>
  );
}

function Sandbag({
  position,
  rotation = 0,
}: {
  position: Vec3;
  rotation?: number;
}) {
  return (
    <mesh position={position} rotation={[0, rotation, 0]} castShadow>
      <capsuleGeometry args={[0.11, 0.26, 2, 6]} />
      <meshStandardMaterial color="#b6a47a" roughness={1} />
    </mesh>
  );
}

function Protection({ level, width = 2.6 }: { level: number; width?: number }) {
  return (
    <group>
      {Array.from({ length: level * 7 }, (_, i) => (
        <group
          key={i}
          position={[
            -width / 2 + ((i % 7) * width) / 6,
            0.13 + Math.floor(i / 7) * 0.18,
            1.55,
          ]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <Sandbag position={[0, 0, 0]} />
        </group>
      ))}
    </group>
  );
}

function Home({
  level,
  lit,
  privateSupplies,
}: {
  level: number;
  lit: boolean;
  privateSupplies: number;
}) {
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[3.45, 0.2, 2.7]} color={C.sand} />
      <Box position={[0, 1.04, 0]} size={[3.1, 1.9, 2.3]} />
      <Box position={[0, 0.3, 0]} size={[3.2, 0.22, 2.4]} color="#d4c7a7" />
      <group position={[0, 1.99, 0]}>
        <Roof width={3.5} depth={2.7} height={1.08} />
      </group>
      <Box position={[0, 3.06, 0]} size={[0.12, 0.1, 2.8]} color={C.roofEdge} />
      {[-1, -0.5, 0, 0.5, 1].map((z) => (
        <group key={z}>
          <Box
            position={[-0.88, 2.54, z]}
            size={[2.02, 0.035, 0.025]}
            rotation={[0, 0, 0.552]}
            color="#ef9572"
          />
          <Box
            position={[0.88, 2.54, z]}
            size={[2.02, 0.035, 0.025]}
            rotation={[0, 0, -0.552]}
            color="#dc704f"
          />
        </group>
      ))}
      <Box
        position={[0.95, 2.67, -0.5]}
        size={[0.35, 0.95, 0.4]}
        color={C.cream}
      />
      <Box
        position={[0.95, 3.16, -0.5]}
        size={[0.46, 0.13, 0.51]}
        color={C.roofEdge}
      />
      <Box
        position={[0.4, 0.7, 1.18]}
        size={[0.63, 1.22, 0.08]}
        color={C.dark}
      />
      <Box
        position={[0.4, 0.72, 1.24]}
        size={[0.49, 1.1, 0.05]}
        color={C.wood}
      />
      <Ball
        position={[0.57, 0.72, 1.29]}
        scale={[0.035, 0.035, 0.035]}
        color="#e8bd60"
      />
      <Window position={[-0.82, 1.12, 1.17]} lit={lit} />
      <Window position={[1.16, 1.12, 1.17]} lit={lit} width={0.4} />
      <Window
        position={[-1.57, 1.12, -0.44]}
        rotation={[0, -Math.PI / 2, 0]}
        lit={lit}
      />
      <Window
        position={[-1.57, 1.12, 0.5]}
        rotation={[0, -Math.PI / 2, 0]}
        lit={lit}
      />
      <Box
        position={[0.4, 0.15, 1.44]}
        size={[1.13, 0.22, 0.6]}
        color="#e3d6b5"
      />
      <Box
        position={[0.4, 0.06, 1.75]}
        size={[1.3, 0.12, 0.3]}
        color={C.sand}
      />
      <Protection level={level} />
      {privateSupplies > 0 && (
        <Crate position={[0.95, 0.2, 1.45]} color={C.turquoise} />
      )}
      <FlowerBox position={[-0.85, 0.48, 1.28]} />
    </group>
  );
}

function Crate({
  position,
  color = C.woodLight,
  fruit = false,
}: {
  position: Vec3;
  color?: string;
  fruit?: boolean;
}) {
  return (
    <group position={position}>
      <Box position={[0, 0.2, 0]} size={[0.42, 0.4, 0.4]} color={color} />
      {[0.08, 0.22, 0.36].map((y) => (
        <Box
          key={y}
          position={[0, y, 0.212]}
          size={[0.46, 0.085, 0.025]}
          color={C.wood}
        />
      ))}
      <Box
        position={[0, 0.2, 0.23]}
        size={[0.04, 0.45, 0.03]}
        rotation={[0, 0, -0.75]}
        color="#d6ad74"
      />
      {fruit &&
        [-0.12, 0.1].map((x, i) => (
          <Ball
            key={x}
            position={[x, 0.44, 0]}
            scale={[0.11, 0.1, 0.11]}
            color={i ? "#e2aa48" : "#e78158"}
          />
        ))}
    </group>
  );
}

function Shop({
  level,
  supplies,
  lit,
}: {
  level: number;
  supplies: number;
  lit: boolean;
}) {
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[2.7, 0.2, 2.5]} color={C.sand} />
      <Box position={[0, 1.03, 0]} size={[2.5, 1.88, 2.1]} />
      <Box position={[0, 2.04, 0]} size={[2.8, 0.2, 2.4]} color={C.turquoise} />
      <Box position={[0, 2.17, 0]} size={[2.58, 0.1, 2.16]} color="#84b9a2" />
      <Box
        position={[-0.58, 0.8, 1.09]}
        size={[0.63, 1.4, 0.08]}
        color={C.dark}
      />
      <Window
        position={[-0.58, 1.08, 1.14]}
        width={0.46}
        height={0.55}
        lit={lit}
      />
      <Window
        position={[0.62, 1.05, 1.09]}
        width={0.85}
        height={0.8}
        lit={lit}
      />
      <Window
        position={[-1.27, 1.08, -0.3]}
        rotation={[0, -Math.PI / 2, 0]}
        lit={lit}
        width={0.8}
      />
      <Box
        position={[0, 1.8, 1.1]}
        size={[1.75, 0.32, 0.1]}
        color={C.turquoise}
      />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <group key={i}>
          <Box
            position={[-0.96 + i * 0.32, 1.54, 1.4]}
            rotation={[0.24, 0, 0]}
            size={[0.32, 0.075, 0.75]}
            color={i % 2 ? C.trim : "#6aa895"}
          />
          <Box
            position={[-0.96 + i * 0.32, 1.38, 1.76]}
            size={[0.32, 0.21, 0.07]}
            color={i % 2 ? C.trim : "#6aa895"}
          />
        </group>
      ))}
      <Box
        position={[-0.95, 2.37, -0.55]}
        size={[0.28, 0.5, 0.32]}
        color={C.roofEdge}
      />
      {Array.from(
        { length: Math.max(0, Math.min(20, Math.floor(supplies))) },
        (_, i) => (
          <Crate
            key={i}
            position={[
              1.57 + (i % 2) * 0.45,
              0.1 + Math.floor(i / 10) * 0.42,
              -1.05 + Math.floor((i % 10) / 2) * 0.45,
            ]}
            fruit={i + 10 >= supplies}
          />
        ),
      )}
      {level > 0 && (
        <>
          <Box
            position={[0.62, 0.65, 1.19]}
            size={[1.07, 0.13, 0.1]}
            rotation={[0, 0, -0.25]}
            color={C.woodLight}
          />
          <Box
            position={[0.62, 1.12, 1.19]}
            size={[1.07, 0.13, 0.1]}
            rotation={[0, 0, 0.18]}
            color={C.woodLight}
          />
        </>
      )}
      {level > 1 && <Protection level={1} width={2.5} />}
      <FlowerBox position={[-1.4, 0.25, 0.85]} />
    </group>
  );
}

function Power({ level }: { level: number }) {
  const lit = level === 2;
  return (
    <group>
      <Box position={[0, 0.12, 0]} size={[2.6, 0.24, 2.15]} color="#b9bbaa" />
      <Box position={[-0.37, 0.9, 0]} size={[1.75, 1.6, 1.8]} color="#d2d6bd" />
      <Box position={[-0.37, 1.77, 0]} size={[1.95, 0.15, 2]} color="#6a8d86" />
      <Box
        position={[0.85, 0.65, 0.23]}
        size={[0.64, 1.1, 1.3]}
        color="#6b8d80"
      />
      {[-0.25, -0.05, 0.15, 0.35, 0.55].map((z) => (
        <Box
          key={z}
          position={[1.185, 0.68, z]}
          size={[0.03, 0.55, 0.065]}
          color={C.dark}
        />
      ))}
      <Window
        position={[-0.8, 1.05, 0.92]}
        lit={lit}
        width={0.46}
        height={0.53}
      />
      <Box
        position={[0.14, 0.65, 0.94]}
        size={[0.46, 1.05, 0.08]}
        color={C.dark}
      />
      <Box
        position={[-0.36, 1.38, 0.96]}
        size={[0.13, 0.46, 0.06]}
        color="#e9b44e"
        rotation={[0, 0, -0.4]}
      />
      <Box
        position={[-0.22, 1.12, 0.96]}
        size={[0.13, 0.43, 0.06]}
        color="#e9b44e"
        rotation={[0, 0, -0.4]}
      />
      <Cylinder
        position={[0.4, 2.06, -0.48]}
        radius={0.24}
        height={1.8}
        color="#e88863"
        segments={12}
      />
      <Cylinder
        position={[0.4, 2.23, -0.48]}
        radius={0.245}
        height={0.33}
        color={C.cream}
        segments={12}
      />
      <Cylinder
        position={[0.4, 2.98, -0.48]}
        radius={0.28}
        height={0.12}
        color={C.dark}
        segments={12}
      />
      <Cylinder
        position={[-0.8, 1.94, -0.45]}
        radius={0.2}
        height={0.2}
        color="#a0b8ac"
      />
      <mesh position={[0.84, 1.23, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial
          color={lit ? "#cff084" : "#785f59"}
          emissive={lit ? "#b5e865" : "#000000"}
          emissiveIntensity={lit ? 0.8 : 0}
        />
      </mesh>
      {level > 1 && (
        <>
          <Box
            position={[0.87, 1.3, 0.18]}
            size={[0.9, 0.13, 1.55]}
            color="#e8bd61"
          />
          <Box
            position={[0.87, 0.19, 0.18]}
            size={[0.9, 0.16, 1.55]}
            color={C.rock}
          />
        </>
      )}
      <Fence position={[-1.55, 0, -0.7]} length={2.7} rotation={Math.PI / 2} />
    </group>
  );
}

function Fountain({ lit }: { lit: boolean }) {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current)
      water.current.scale.y = 0.9 + Math.sin(clock.elapsedTime * 2.3) * 0.1;
  });
  return (
    <group>
      <Cylinder
        position={[0, 0.025, 0]}
        radius={1.6}
        height={0.05}
        color={C.path}
        segments={32}
      />
      {Array.from({ length: 18 }, (_, i) => (
        <Box
          key={i}
          position={[
            Math.sin((i * Math.PI) / 9) * 1.43,
            0.07,
            Math.cos((i * Math.PI) / 9) * 1.43,
          ]}
          size={[0.43, 0.05, 0.18]}
          rotation={[0, (i * Math.PI) / 9, 0]}
          color="#cfbc97"
        />
      ))}
      <Cylinder
        position={[0, 0.15, 0]}
        radius={0.8}
        height={0.25}
        color="#dedbc2"
        segments={20}
      />
      <Cylinder
        position={[0, 0.28, 0]}
        radius={0.65}
        height={0.03}
        color={C.water}
        segments={24}
      />
      <Cylinder
        position={[0, 0.52, 0]}
        radius={0.19}
        topRadius={0.12}
        height={0.5}
        color={C.trim}
      />
      <Cylinder
        position={[0, 0.74, 0]}
        radius={0.37}
        topRadius={0.42}
        height={0.1}
        color="#e0e2cf"
        segments={20}
      />
      <Cylinder
        position={[0, 0.8, 0]}
        radius={0.34}
        height={0.025}
        color={C.water}
        segments={20}
      />
      <Ball position={[0, 0.92, 0]} scale={[0.1, 0.12, 0.1]} color={C.trim} />
      {lit && (
        <mesh ref={water} position={[0, 1.1, 0]}>
          <sphereGeometry args={[0.07, 7, 7]} />
          <meshStandardMaterial color="#b9f0e7" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Bridge({ level }: { level: number }) {
  return (
    <group rotation={[0, 0, 0]}>
      {[-0.62, 0.62].map((z) => (
        <Box
          key={z}
          position={[0, 0.28, z]}
          size={[2.55, 0.16, 0.14]}
          color={C.wood}
        />
      ))}
      {Array.from({ length: 11 }, (_, i) => {
        const broken = level === 0 && i > 3 && i < 7;
        if (broken && i === 5) return null;
        return (
          <Box
            key={i}
            position={[-1.25 + i * 0.25, broken ? 0.18 : 0.43, 0]}
            size={[0.23, 0.12, 1.44]}
            rotation={[broken ? -0.22 : 0, 0, broken ? 0.32 : 0]}
            color={level > 1 ? C.woodLight : i % 3 ? "#b88655" : "#cf9c65"}
          />
        );
      })}
      {[-1.15, 0, 1.15].flatMap((x) =>
        [-0.7, 0.7].map((z) => (
          <Box
            key={`${x}-${z}`}
            position={[x, 0.73, z]}
            size={[0.14, 1.08, 0.14]}
            color={C.wood}
          />
        )),
      )}
      {[-0.7, 0.7].map((z) => (
        <group key={z}>
          <Box
            position={[0, 1.04, z]}
            size={[2.62, 0.13, 0.12]}
            color={C.woodLight}
          />
          <Box
            position={[0, 0.66, z]}
            size={[2.5, 0.09, 0.09]}
            color={C.wood}
          />
        </group>
      ))}
      {level > 0 &&
        [-0.6, 0.6].map((x) => (
          <Box
            key={x}
            position={[x, 0.59, 0.76]}
            size={[0.85, 0.1, 0.1]}
            rotation={[0, 0, x > 0 ? 0.6 : -0.6]}
            color="#e0b97d"
          />
        ))}
      {level === 0 && (
        <group position={[-1.4, 0.5, 0.9]} rotation={[0, 0.16, 0]}>
          <Box size={[0.05, 0.65, 0.06]} color={C.wood} />
          <Box
            position={[0, 0.24, 0]}
            size={[0.52, 0.3, 0.07]}
            color="#edbc57"
          />
          <Box
            position={[0, 0.26, 0.04]}
            size={[0.055, 0.14, 0.025]}
            color={C.dark}
          />
        </group>
      )}
    </group>
  );
}

function Tree({
  position,
  scale = 1,
  pine = false,
  variant = 0,
}: {
  position: Vec3;
  scale?: number;
  pine?: boolean;
  variant?: number;
}) {
  const crown = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (crown.current)
      crown.current.rotation.z =
        Math.sin(clock.elapsedTime * 0.8 + position[0]) * 0.018;
  });
  return (
    <group position={position} scale={scale}>
      <Cylinder
        position={[0, 0.55, 0]}
        radius={0.11}
        topRadius={0.07}
        height={1.1}
        color={C.wood}
        segments={6}
      />
      <group ref={crown} position={[0, 0.55, 0]}>
        {pine ? (
          <>
            {[0, 0.4, 0.78].map((y, i) => (
              <mesh key={y} position={[0, 0.5 + y, 0]} castShadow>
                <coneGeometry args={[0.62 - i * 0.15, 1, 7]} />
                <meshStandardMaterial
                  color={i % 2 ? "#6f985d" : "#527e56"}
                  roughness={1}
                />
              </mesh>
            ))}
          </>
        ) : (
          <>
            <Ball
              position={[0, 0.8, 0]}
              scale={[0.65, 0.72, 0.6]}
              color={variant % 2 ? "#a5b662" : "#8fa553"}
            />
            <Ball
              position={[-0.36, 0.55, 0.1]}
              scale={[0.48, 0.48, 0.44]}
              color={variant % 2 ? "#b5c36c" : "#9dae59"}
            />
            <Ball
              position={[0.4, 0.68, -0.1]}
              scale={[0.46, 0.51, 0.46]}
              color={variant % 2 ? "#9eae5f" : "#879e50"}
            />
          </>
        )}
      </group>
    </group>
  );
}

function FlowerBox({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Box size={[0.67, 0.22, 0.3]} color={C.woodLight} />
      {[-0.22, 0, 0.22].map((x, i) => (
        <group key={x}>
          <Ball
            position={[x, 0.18, 0]}
            scale={[0.16, 0.16, 0.16]}
            color={C.darkGreen}
          />
          <Ball
            position={[x, 0.3, 0]}
            scale={[0.075, 0.06, 0.075]}
            color={i % 2 ? "#efb980" : "#ec9380"}
          />
        </group>
      ))}
    </group>
  );
}

function Shrub({
  position,
  color = C.green,
  flowers = false,
}: {
  position: Vec3;
  color?: string;
  flowers?: boolean;
}) {
  return (
    <group position={position}>
      <Ball position={[0, 0.19, 0]} scale={[0.4, 0.3, 0.32]} color={color} />
      {flowers &&
        [-0.2, 0.06, 0.22].map((x, i) => (
          <Ball
            key={x}
            position={[x, 0.42 - i * 0.03, 0.1]}
            scale={[0.07, 0.055, 0.07]}
            color={i % 2 ? "#f8e8ae" : "#ef997e"}
          />
        ))}
    </group>
  );
}

function Fence({
  position,
  length,
  rotation = 0,
}: {
  position: Vec3;
  length: number;
  rotation?: number;
}) {
  const count = Math.ceil(length / 0.6);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: count + 1 }, (_, i) => (
        <Box
          key={i}
          position={[-length / 2 + (i * length) / count, 0.38, 0]}
          size={[0.12, 0.75, 0.12]}
          color={C.woodLight}
        />
      ))}
      {[0.25, 0.58].map((y) => (
        <Box
          key={y}
          position={[0, y, 0]}
          size={[length, 0.09, 0.08]}
          color={C.wood}
        />
      ))}
    </group>
  );
}

function Lamp({ position, lit }: { position: Vec3; lit: boolean }) {
  return (
    <group position={position}>
      <Cylinder
        position={[0, 0.08, 0]}
        radius={0.16}
        height={0.16}
        color={C.dark}
      />
      <Cylinder
        position={[0, 0.8, 0]}
        radius={0.045}
        height={1.6}
        color={C.dark}
        segments={8}
      />
      <Box position={[0, 1.66, 0]} size={[0.26, 0.08, 0.26]} color={C.dark} />
      <mesh position={[0, 1.83, 0]}>
        <boxGeometry args={[0.18, 0.29, 0.18]} />
        <meshStandardMaterial
          color={lit ? "#ffe4a3" : "#a0b5a4"}
          emissive={lit ? "#f8cf75" : "#000000"}
          emissiveIntensity={lit ? 0.6 : 0}
        />
      </mesh>
      <mesh position={[0, 2.03, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.24, 0.19, 4]} />
        <meshStandardMaterial color={C.dark} />
      </mesh>
    </group>
  );
}

function Bench({
  position,
  rotation = 0,
}: {
  position: Vec3;
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-0.38, 0.38].map((x) => (
        <group key={x}>
          <Box
            position={[x, 0.22, 0]}
            size={[0.08, 0.44, 0.38]}
            color={C.dark}
          />
          <Box
            position={[x, 0.58, -0.15]}
            size={[0.06, 0.65, 0.07]}
            color={C.dark}
          />
        </group>
      ))}
      {[-0.1, 0.08].map((z) => (
        <Box
          key={z}
          position={[0, 0.44, z]}
          size={[1.12, 0.09, 0.15]}
          color={C.woodLight}
        />
      ))}
      {[0.67, 0.84].map((y) => (
        <Box
          key={y}
          position={[0, y, -0.17]}
          size={[1.12, 0.13, 0.08]}
          color={C.woodLight}
        />
      ))}
    </group>
  );
}

function Bunting() {
  const cable = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.2, 1.9, -1),
        new THREE.Vector3(0.2, 1.53, -0.9),
        new THREE.Vector3(1.7, 1.9, -0.9),
      ]),
    [],
  );
  return (
    <group>
      <mesh>
        <tubeGeometry args={[cable, 16, 0.013, 4, false]} />
        <meshStandardMaterial color={C.dark} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const p = cable.getPoint((i + 0.5) / 9);
        return (
          <mesh
            key={i}
            position={[p.x, p.y - 0.14, p.z]}
            rotation={[0, 0, Math.PI]}
          >
            <coneGeometry args={[0.12, 0.28, 3]} />
            <meshStandardMaterial
              color={["#e88965", "#e6c976", "#6faaa0"][i % 3]}
            />
          </mesh>
        );
      })}
      {[-1.2, 1.7].map((x) => (
        <Cylinder
          key={x}
          position={[x, 0.96, -1]}
          radius={0.025}
          height={1.93}
          color={C.wood}
          segments={6}
        />
      ))}
    </group>
  );
}

function Character({
  position,
  color,
  kind,
  angle = 0,
  phase = 0,
}: {
  position: Vec3;
  color: string;
  kind: number;
  angle?: number;
  phase?: number;
}) {
  const body = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (body.current) {
      body.current.position.y = 0.015 + Math.sin(t * 2) * 0.025;
      body.current.rotation.z = Math.sin(t * 1.3) * 0.035;
    }
    if (arm.current) arm.current.rotation.z = -0.25 + Math.sin(t * 1.4) * 0.13;
  });
  return (
    <group position={position} rotation={[0, angle, 0]} scale={1.1}>
      <group ref={body}>
        {[-0.105, 0.105].map((x) => (
          <group key={x}>
            <Box
              position={[x, 0.14, 0]}
              size={[0.13, 0.25, 0.14]}
              color="#465954"
            />
            <Ball
              position={[x, 0.055, 0.055]}
              scale={[0.095, 0.065, 0.14]}
              color="#5d574c"
            />
          </group>
        ))}
        <mesh position={[0, 0.4, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.17, 4, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <group ref={arm} position={[0.23, 0.51, 0]} rotation={[0, 0, -0.25]}>
          <Box
            position={[0, -0.12, 0]}
            size={[0.115, 0.25, 0.12]}
            color={color}
          />
          <Ball
            position={[0, -0.26, 0]}
            scale={[0.075, 0.085, 0.075]}
            color="#e4af81"
          />
        </group>
        <group position={[-0.23, 0.51, 0]} rotation={[0, 0, 0.2]}>
          <Box
            position={[0, -0.12, 0]}
            size={[0.115, 0.25, 0.12]}
            color={color}
          />
          <Ball
            position={[0, -0.25, 0]}
            scale={[0.075, 0.085, 0.075]}
            color="#e4af81"
          />
        </group>
        <Ball
          position={[0, 0.76, 0]}
          scale={[0.245, 0.26, 0.23]}
          color="#f0c08f"
          detail={2}
        />
        <Ball
          position={[0, 0.73, 0.23]}
          scale={[0.065, 0.06, 0.07]}
          color="#e2a87d"
        />
        {[-0.085, 0.085].map((x) => (
          <Ball
            key={x}
            position={[x, 0.8, 0.209]}
            scale={[0.024, 0.034, 0.018]}
            color="#354c43"
          />
        ))}
        <Box
          position={[0, 0.66, 0.212]}
          size={[0.07, 0.018, 0.015]}
          color="#a76754"
        />
        {kind === 0 && (
          <>
            <Ball
              position={[0, 0.94, -0.03]}
              scale={[0.26, 0.14, 0.23]}
              color="#6a4434"
            />
            <Ball
              position={[-0.21, 0.78, -0.05]}
              scale={[0.09, 0.18, 0.15]}
              color="#6a4434"
            />
            <Ball
              position={[0.21, 0.78, -0.05]}
              scale={[0.09, 0.18, 0.15]}
              color="#6a4434"
            />
            <Ball
              position={[0, 0.98, 0]}
              scale={[0.255, 0.13, 0.245]}
              color={C.roof}
            />
            <Box
              position={[0, 0.93, 0.23]}
              size={[0.28, 0.04, 0.19]}
              color={C.roofEdge}
            />
          </>
        )}
        {kind === 1 && (
          <>
            <Ball
              position={[0, 0.94, -0.06]}
              scale={[0.24, 0.15, 0.22]}
              color="#d1d0b8"
            />
            {[-0.085, 0.085].map((x) => (
              <mesh key={x} position={[x, 0.79, 0.231]}>
                <torusGeometry args={[0.066, 0.012, 5, 12]} />
                <meshStandardMaterial color={C.dark} />
              </mesh>
            ))}
            <Box
              position={[0, 0.79, 0.235]}
              size={[0.055, 0.015, 0.015]}
              color={C.dark}
            />
            <Ball
              position={[0, 0.64, 0.14]}
              scale={[0.14, 0.09, 0.1]}
              color="#d1d0b8"
            />
          </>
        )}
        {kind === 2 && (
          <>
            <Ball
              position={[0, 0.96, 0]}
              scale={[0.27, 0.19, 0.25]}
              color="#edbc52"
            />
            <Cylinder
              position={[0, 0.94, 0]}
              radius={0.31}
              height={0.065}
              color="#e5ae40"
              segments={12}
            />
            <Box
              position={[0, 1.1, 0]}
              size={[0.05, 0.07, 0.33]}
              color="#f4d079"
            />
            <Box
              position={[0, 0.41, 0.19]}
              size={[0.2, 0.2, 0.04]}
              color="#456d69"
            />
          </>
        )}
        {kind === 3 && (
          <>
            <Ball
              position={[0, 0.96, -0.03]}
              scale={[0.255, 0.16, 0.24]}
              color="#5e4941"
            />
            <Ball
              position={[0.15, 1.06, -0.12]}
              scale={[0.14, 0.13, 0.14]}
              color="#5e4941"
            />
            {[-0.25, 0.25].map((x) => (
              <Ball
                key={x}
                position={[x, 0.83, 0]}
                scale={[0.065, 0.11, 0.1]}
                color="#d8c3a1"
              />
            ))}
            <mesh position={[0, 0.84, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.25, 0.025, 5, 16, Math.PI]} />
              <meshStandardMaterial color={C.dark} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

function Terrain() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const points = [
      [-6.7, -2.7],
      [-5.3, -4.6],
      [-2.7, -5.05],
      [0.5, -4.85],
      [3.5, -4.5],
      [5.7, -3],
      [6.5, -0.5],
      [6.2, 2.5],
      [4.6, 4.45],
      [1.7, 4.9],
      [-1.9, 4.8],
      [-4.6, 3.7],
      [-6.3, 1.6],
    ];
    points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
  }, []);
  const stones = useMemo(
    () =>
      Array.from({ length: 39 }, (_, i) => {
        const a = (i / 39) * Math.PI * 2;
        return {
          pos: [
            Math.cos(a) * (6.2 + Math.sin(i * 5) * 0.2),
            -0.39,
            Math.sin(a) * (4.5 + Math.cos(i) * 0.2),
          ] as Vec3,
          size: [
            0.58 + Math.sin(i * 3) * 0.13,
            0.6 + Math.cos(i) * 0.15,
            0.53,
          ] as Vec3,
        };
      }),
    [],
  );
  return (
    <group>
      <mesh
        position={[0, -0.8, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
      >
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.76,
              bevelEnabled: true,
              bevelSize: 0.18,
              bevelThickness: 0.13,
              bevelSegments: 1,
              steps: 1,
            },
          ]}
        />
        <meshStandardMaterial color={C.sand} roughness={1} />
      </mesh>
      <mesh
        position={[0, 0.095, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#b6c481" roughness={1} />
      </mesh>
      {stones.map(({ pos, size }, i) => (
        <Ball
          key={i}
          position={pos}
          scale={size}
          color={i % 3 ? "#c9b999" : "#b4a68e"}
          detail={0}
        />
      ))}
      <Box
        position={[0, 0.12, -0.7]}
        size={[7.6, 0.035, 1.15]}
        color={C.path}
      />
      <Box
        position={[0.55, 0.12, 1.55]}
        size={[1.27, 0.035, 6.5]}
        color={C.path}
      />
      <Box
        position={[-2.5, 0.12, 2.86]}
        size={[5.8, 0.035, 0.85]}
        color={C.path}
      />
      <Box
        position={[2.9, 0.12, 2.25]}
        size={[3.4, 0.035, 0.95]}
        color={C.path}
      />
      <Box
        position={[-2.7, 0.12, -0.2]}
        size={[1.1, 0.035, 3.4]}
        color={C.path}
      />
      {Array.from({ length: 15 }, (_, i) => (
        <Box
          key={i}
          position={[
            -4.6 + (i % 5) * 1.2,
            0.145,
            -0.8 + Math.floor(i / 5) * 0.3,
          ]}
          size={[0.55, 0.025, 0.22]}
          color={i % 2 ? "#e8d7b6" : "#d8c8a5"}
        />
      ))}
      <group position={[4.25, 0.15, 0.5]} rotation={[0, -0.14, 0]}>
        <Box size={[1.8, 0.035, 7.8]} color={C.water} />
        <Box
          position={[-0.7, 0.008, 1.1]}
          size={[0.4, 0.02, 3.9]}
          color="#8dd4ca"
        />
        {Array.from({ length: 16 }, (_, i) => (
          <Box
            key={i}
            position={[
              -0.62 + (i % 4) * 0.38,
              0.028,
              -3.2 + Math.floor(i / 4) * 1.7,
            ]}
            size={[0.18 + (i % 3) * 0.07, 0.014, 0.025]}
            color="#a4e0d5"
          />
        ))}
      </group>
      <mesh position={[4.8, -0.23, 4.2]} rotation={[0.12, 0.01, 0]}>
        <boxGeometry args={[1.6, 0.85, 0.12]} />
        <meshStandardMaterial color="#8bd6cb" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function Garden() {
  const trees: [number, number, number, boolean][] = [
    [-5.65, 2.2, 1, false],
    [-5.85, -0.2, 0.85, true],
    [-5.2, -2.9, 1.15, false],
    [-4.3, -4.1, 1.05, true],
    [-1, -4.2, 1, false],
    [0.1, -4.1, 0.85, true],
    [4.3, -3.45, 1.05, false],
    [5.15, -2.6, 1.1, true],
    [5.7, 0.1, 0.85, false],
    [5.35, 3.2, 0.75, true],
    [-4.15, 3.35, 0.8, false],
    [-2.1, 3.8, 0.86, false],
    [0.3, 4.15, 0.6, true],
    [2.3, 3.95, 0.76, false],
    [-5.4, 1.3, 0.75, true],
  ];
  return (
    <group>
      {trees.map(([x, z, scale, pine], i) => (
        <Tree
          key={i}
          position={[x, 0.1, z]}
          scale={scale}
          pine={pine}
          variant={i}
        />
      ))}
      {Array.from({ length: 27 }, (_, i) => {
        const a = (i / 27) * Math.PI * 2;
        return (
          <Shrub
            key={i}
            position={[
              Math.cos(a) * (5.5 + Math.sin(i) * 0.3),
              0.1,
              Math.sin(a) * 3.9,
            ]}
            color={i % 3 ? "#9bae64" : "#c0c875"}
            flowers={i % 2 === 0}
          />
        );
      })}
      {[
        [-1.3, 1.8],
        [1.7, 2.7],
        [1.9, 0.2],
        [-4.7, 2.7],
        [2.5, -3.9],
        [3.2, 3.8],
      ].map(([x, z], i) => (
        <Shrub key={i} position={[x, 0.1, z]} flowers />
      ))}
      <Fence position={[-3.1, 0.1, 3.6]} length={2.3} />
      <Fence position={[-5.2, 0.1, -1.1]} length={1.6} rotation={Math.PI / 2} />
      <Fence position={[2.2, 0.1, -4]} length={2.5} />
      <Bench position={[-1.3, 0.1, 0.65]} rotation={Math.PI / 2} />
      <Bench position={[1.2, 0.1, 3.05]} rotation={Math.PI} />
      <FlowerBox position={[1.96, 0.25, 2.85]} />
      {[-2.1, 0, 2.2].map((z, i) => (
        <Ball
          key={i}
          position={[3.27, 0.17, z]}
          scale={[0.35, 0.3, 0.4]}
          color={C.rock}
          detail={0}
        />
      ))}
    </group>
  );
}

function Rain({ storm }: { storm: boolean }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(90 * 6);
    for (let i = 0; i < 90; i++) {
      const x = Math.sin(i * 127.1) * 6.6,
        y = (i * 0.137) % 6,
        z = Math.cos(i * 311.7) * 4.5;
      positions.set([x, y, z, x + 0.07, y + 0.3, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  useFrame((_, delta) => {
    if (!storm || !ref.current) return;
    const a = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 2) {
      let y = a.getY(i) - delta * 4.7;
      if (y < 0.1) y = 6;
      a.setY(i, y);
      a.setY(i + 1, y + 0.3);
    }
    a.needsUpdate = true;
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!storm) return null;
  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color="#b1d6d4" transparent opacity={0.55} />
    </lineSegments>
  );
}

function Cloud({
  position,
  scale = 1,
  grey,
}: {
  position: Vec3;
  scale?: number;
  grey: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.position.x =
        position[0] + Math.sin(clock.elapsedTime * 0.12 + position[2]) * 0.22;
  });
  return (
    <group ref={ref} position={position} scale={scale}>
      <Ball
        position={[0, 0, 0]}
        scale={[1, 0.28, 0.5]}
        color={grey ? "#b7c3bb" : "#fff9e9"}
      />
      <Ball
        position={[-0.37, 0.18, 0]}
        scale={[0.49, 0.36, 0.41]}
        color={grey ? "#b7c3bb" : "#fff9e9"}
      />
      <Ball
        position={[0.3, 0.24, 0]}
        scale={[0.56, 0.4, 0.44]}
        color={grey ? "#b7c3bb" : "#fff9e9"}
      />
    </group>
  );
}

function CameraRig({ selected }: { selected: Place | null }) {
  const { camera, size } = useThree();
  const focus = useRef(new THREE.Vector3(0, 0.25, 0.1));
  useFrame((_, delta) => {
    const narrow = size.width < 700;
    const p = selected ? locations[selected].point : [0, 0, 0];
    const target = new THREE.Vector3(
      p[0] * 0.18,
      narrow ? 0.65 : 0.5,
      p[2] * 0.18,
    );
    focus.current.lerp(target, 1 - Math.exp(-delta * 3));
    camera.position.set(
      focus.current.x + 12,
      focus.current.y + 11,
      focus.current.z + 15,
    );
    camera.lookAt(focus.current);
    if (camera instanceof THREE.OrthographicCamera) {
      const base = Math.min(
        size.width / (narrow ? 14.5 : 17),
        size.height / (narrow ? 12 : 12.7),
      );
      camera.zoom = THREE.MathUtils.lerp(
        camera.zoom,
        base * (selected ? 1.045 : 1),
        1 - Math.exp(-delta * 3.5),
      );
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function Location({
  id,
  selected,
  onSelect,
  children,
  radius = 1.7,
  interactive = true,
}: {
  id: Place;
  selected: Place | null;
  onSelect: (p: Place) => void;
  children: React.ReactNode;
  radius?: number;
  interactive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const place = locations[id];
  const active = selected === id;
  return (
    <>
      <group
        position={place.point}
        onPointerOver={
          interactive
            ? (e) => {
                e.stopPropagation();
                setHovered(true);
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? () => {
                setHovered(false);
                document.body.style.cursor = "";
              }
            : undefined
        }
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation();
                onSelect(id);
              }
            : undefined
        }
      >
        {children}
        {(hovered || active) && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.19, 0]}>
            <ringGeometry args={[radius, radius + 0.045, 48]} />
            <meshBasicMaterial
              color={active ? "#ef845e" : "#fff5d2"}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </>
  );
}

type LabelsRef = RefObject<Record<Place, HTMLDivElement | null>>;

// Keep the labels in the main React DOM tree. Separate React roots created by
// Html can race during StrictMode unmounts; projecting positions avoids that.
function LabelPositions({ labels }: { labels: LabelsRef }) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const id of Object.keys(locations) as Place[]) {
      const node = labels.current[id];
      if (!node) continue;
      point.set(...locations[id].label).project(camera);
      node.style.transform = `translate3d(${(point.x * 0.5 + 0.5) * size.width}px,${(-point.y * 0.5 + 0.5) * size.height}px,0) translate(-50%,-50%)`;
      node.style.visibility = "visible";
    }
  });
  return null;
}

function World({
  world,
  supplies,
  privateSupplies = 0,
  playerColor,
  selected,
  onSelect,
  labels,
  interactive = true,
}: Props & { labels: LabelsRef }) {
  const storm = world.weather === "storm";
  const lit = world.power === 2;
  return (
    <>
      <color attach="background" args={["#f4f1e6"]} />
      <ambientLight
        intensity={storm ? 0.75 : 1.2}
        color={storm ? "#c7dce0" : "#fff6e5"}
      />
      <hemisphereLight intensity={1.5} color="#fff4dc" groundColor="#abb58c" />
      <directionalLight
        position={[-5, 10, 6]}
        intensity={storm ? 1.2 : 2.6}
        color={storm ? "#d3e3df" : "#fff3d7"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-radius={4}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.15, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={0.12} />
      </mesh>
      <group position={[0, 0, 0]}>
        <Terrain />
        <Garden />
        <Location
          id="home"
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          radius={2}
        >
          <Home
            level={world.home}
            lit={lit}
            privateSupplies={privateSupplies}
          />
        </Location>
        <Location
          id="shop"
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
        >
          <Shop level={world.shop} supplies={supplies} lit={lit} />
        </Location>
        <Location
          id="power"
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
        >
          <Power level={world.power} />
        </Location>
        <Location
          id="square"
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          radius={1.58}
        >
          <Fountain lit={lit} />
        </Location>
        <Location
          id="bridge"
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          radius={1.5}
        >
          <Bridge level={world.bridge} />
        </Location>
        <Lamp position={[-1.35, 0.1, -1.2]} lit={lit} />
        <Lamp position={[1.9, 0.1, -0.6]} lit={lit} />
        <Lamp position={[-1.2, 0.1, 2.85]} lit={lit} />
        <Lamp position={[3, 0.1, 1.4]} lit={lit} />
        <Bunting />
        <Character
          position={[-0.6, 0.1, 2.7]}
          color={playerColor}
          kind={0}
          angle={0.35}
        />
        <Character
          position={[-1.1, 0.1, 1.75]}
          color={botColors.nina}
          kind={1}
          angle={-0.6}
          phase={1}
        />
        <Character
          position={[1.55, 0.1, -1]}
          color={botColors.mira}
          kind={2}
          angle={0.4}
          phase={2}
        />
        <Character
          position={[-0.85, 0.1, -0.65]}
          color={botColors.boris}
          kind={3}
          angle={0.2}
          phase={4}
        />
        <Cloud position={[-4, 5.5, -4]} scale={0.75} grey={storm} />
        <Cloud
          position={[4.1, 5.8, -5]}
          scale={world.weather === "sun" ? 0.75 : 1.2}
          grey={world.weather !== "sun"}
        />
        {world.weather !== "sun" && (
          <Cloud position={[0.4, 5.5, -4.4]} scale={1.25} grey />
        )}
        <Rain storm={storm} />
      </group>
      <CameraRig selected={selected} />
      <LabelPositions labels={labels} />
    </>
  );
}

export default function TownScene(props: Props) {
  const interactive = props.interactive ?? true;
  const labels = useRef<Record<Place, HTMLDivElement | null>>({
    home: null,
    shop: null,
    power: null,
    square: null,
    bridge: null,
  });
  return (
    <div
      className={`town-scene town-scene--${props.world.weather}${interactive ? "" : " town-scene--passive"}`}
      aria-label="Объёмная карта района: дом, магазин, электростанция, площадь и мост"
    >
      <div className="scene-labels">
        {(Object.keys(locations) as Place[]).map((id) => (
          <div
            key={id}
            className="scene-label"
            ref={(node) => {
              labels.current[id] = node;
            }}
          >
            {interactive ? (
              <button
                type="button"
                className={`map-label${props.selected === id ? " is-selected" : ""}`}
                onClick={() => props.onSelect(id)}
                aria-pressed={props.selected === id}
              >
                <span className="map-label-dot" />
                {locations[id].name}
              </button>
            ) : (
              <span className="map-label">
                <span className="map-label-dot" />
                {locations[id].name}
              </span>
            )}
          </div>
        ))}
      </div>
      <Canvas
        orthographic
        shadows
        camera={{ position: [12, 11, 15], zoom: 45, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <Suspense fallback={null}>
          <World {...props} labels={labels} />
        </Suspense>
      </Canvas>
    </div>
  );
}
