
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Helper to get deterministic random number based on position
function pseudoRandom(x: number, z: number) {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

interface BiomProps {
    position: [number, number, number];
    connections: boolean[]; 
    isBlocked?: boolean;
}

const NEIGHBOR_ANGLES = [Math.PI * 2 / 3, Math.PI / 3, 0, -Math.PI / 3, -Math.PI * 2 / 3, Math.PI];

const Tree: React.FC<{ position: [number, number, number], scale: [number, number, number], colorVar: number, typeVar: number }> = React.memo(({ position, scale, colorVar, typeVar }) => {
    const color = useMemo(() => new THREE.Color('#15803d').lerp(new THREE.Color('#14532d'), colorVar), [colorVar]);
    const bottomConeRadius = 0.3 + (typeVar * 0.15);
    const topConeRadius = 0.2 + (typeVar * 0.1);
    
    return (
        <group position={position} scale={scale}>
            <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.08, 0.12, 0.4, 5]} />
                <meshStandardMaterial color="#3f2e26" />
            </mesh>
            <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
                <coneGeometry args={[bottomConeRadius, 0.8, 5]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
                <coneGeometry args={[topConeRadius, 0.7, 5]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
             <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
                <coneGeometry args={[topConeRadius * 0.6, 0.5, 5]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
        </group>
    );
});
Tree.displayName = 'Tree';

export const ForestBiom: React.FC<BiomProps> = React.memo(({ position, connections }) => {
  const trees = useMemo(() => {
      const t: { pos: [number, number, number], scale: [number, number, number], colorVar: number, typeVar: number }[] = [];
      const rng = (offset: number) => pseudoRandom(position[0] + offset, position[2] + offset);
      
      const neighborCount = connections.filter(Boolean).length;
      const densityMultiplier = 1.0 + (neighborCount * 0.5);
      const baseNumTrees = Math.floor(rng(10) * 3) + 2; 
      const finalNumTrees = Math.min(10, Math.floor(baseNumTrees * densityMultiplier));
      
      for (let k = 0; k < finalNumTrees; k++) {
          const angle = rng(k * 20 + 1) * Math.PI * 2;
          const distBase = rng(k * 20 + 2);
          const dist = Math.sqrt(distBase) * 0.85; 
          
          const x = Math.cos(angle) * dist;
          const z = Math.sin(angle) * dist;
          
          const typeRng = rng(k * 20 + 3);
          let sBase = 1.0;
          
          if (typeRng < 0.25) {
             sBase = 0.3 + rng(k * 20 + 4) * 0.3;
          } else if (typeRng > 0.85) {
             sBase = 2.0 + rng(k * 20 + 5) * 0.7;
          } else {
             sBase = 0.9 + rng(k * 20 + 6) * 0.4;
          }

          const sY = sBase * (0.8 + rng(k * 20 + 7) * 0.4); 
          const sXZ = sBase * (0.9 + rng(k * 20 + 8) * 0.2);
          
          t.push({
              pos: [x, 0, z],
              scale: [sXZ, sY, sXZ],
              colorVar: rng(k * 20 + 9),
              typeVar: rng(k * 20 + 10)
          });
      }
      return t;
  }, [position, connections]);

  return (
      <group position={position}>
          {trees.map((tree, i) => (
              <Tree key={i} position={tree.pos} scale={tree.scale} colorVar={tree.colorVar} typeVar={tree.typeVar} />
          ))}
      </group>
  );
});
ForestBiom.displayName = 'ForestBiom';

export const MountainBiom: React.FC<BiomProps> = React.memo(({ position, connections, isBlocked = false }) => {
  const peaks = useMemo(() => {
      const p: { pos: [number, number, number], scale: [number, number, number], rot: [number,number,number], type: 'main'|'sub' }[] = [];
      const rng = (offset: number) => pseudoRandom(position[0] + offset, position[2] + offset);

      // Height Multiplier: Blocked mountains are taller and jagged. Traversable are lower hills.
      const hMult = isBlocked ? 1.0 : 0.5;
      const wMult = isBlocked ? 1.0 : 1.5; // Hills are wider

      // Main Peak
      const h = (0.8 + rng(1) * 0.6) * hMult;
      p.push({
          pos: [0, h * 0.3, 0],
          scale: [ (0.8 + rng(2)*0.2) * wMult, h, (0.8 + rng(3)*0.2) * wMult ],
          rot: [rng(4)*0.1, rng(5)*Math.PI, rng(6)*0.1],
          type: 'main'
      });

      // Sub Peaks
      const numSub = isBlocked ? (2 + Math.floor(rng(7) * 3)) : (1 + Math.floor(rng(7) * 2));
      for(let i=0; i<numSub; i++) {
          const angle = rng(i*10 + 8) * Math.PI * 2;
          const dist = (0.3 + rng(i*10 + 9) * 0.4) * wMult;
          const subH = (0.4 + rng(i*10 + 10) * 0.4) * hMult;
          p.push({
              pos: [Math.sin(angle)*dist, subH * 0.2, Math.cos(angle)*dist],
              scale: [(0.4 + rng(i*10 + 11)*0.3)*wMult, subH, (0.4 + rng(i*10 + 12)*0.3)*wMult],
              rot: [rng(i*10 + 13)*0.3, rng(i*10 + 14)*Math.PI, rng(i*10 + 15)*0.3],
              type: 'sub'
          });
      }
      return p;
  }, [position, isBlocked]);

  return (
    <group position={position}>
       {peaks.map((peak, i) => (
           <mesh 
             key={i}
             position={peak.pos} 
             rotation={peak.rot} 
             scale={peak.scale}
             castShadow 
             receiveShadow
           >
             <dodecahedronGeometry args={[1, 0]} />
             <meshStandardMaterial color={peak.type === 'main' ? (isBlocked ? "#64748b" : "#78716c") : "#57534e"} roughness={0.8} flatShading />
           </mesh>
       ))}
    </group>
  );
});
MountainBiom.displayName = 'MountainBiom';

const LeafCluster: React.FC<{position: [number,number,number], scale: number}> = ({position, scale}) => (
    <mesh position={position} castShadow>
        <dodecahedronGeometry args={[scale, 0]} />
        <meshStandardMaterial color="#1f421f" roughness={0.8} flatShading />
    </mesh>
);

export const RealisticTree: React.FC = () => {
    return (
        <group position={[0, 0.8, 0]} scale={[1.2, 1.2, 1.2]}>
            {/* Trunk Base */}
            <mesh position={[0, -0.4, 0]} castShadow>
                <cylinderGeometry args={[0.2, 0.3, 0.8, 7]} />
                <meshStandardMaterial color="#4a3b32" roughness={0.9} />
            </mesh>
            
            {/* Left Main Branch */}
            <group position={[0, 0, 0]} rotation={[0, 0, 0.6]}>
                <mesh position={[0, 0.5, 0]} castShadow>
                    <cylinderGeometry args={[0.12, 0.2, 1.0, 6]} />
                    <meshStandardMaterial color="#4a3b32" roughness={0.9} />
                </mesh>
                <group position={[0, 1.0, 0]} rotation={[0.5, 1.0, 0.5]}>
                     <mesh position={[0, 0.4, 0]} castShadow><cylinderGeometry args={[0.08, 0.12, 0.8, 5]} /><meshStandardMaterial color="#4a3b32" /></mesh>
                     <LeafCluster position={[0, 0.6, 0]} scale={0.5} />
                     <LeafCluster position={[0.3, 0.4, -0.2]} scale={0.4} />
                </group>
                <group position={[0, 0.8, 0]} rotation={[-0.5, 0, -0.5]}>
                     <mesh position={[0, 0.4, 0]} castShadow><cylinderGeometry args={[0.08, 0.12, 0.8, 5]} /><meshStandardMaterial color="#4a3b32" /></mesh>
                     <LeafCluster position={[0, 0.7, 0]} scale={0.6} />
                </group>
            </group>

            {/* Right Main Branch */}
            <group position={[0, -0.1, 0]} rotation={[0, 0, -0.5]}>
                <mesh position={[0, 0.5, 0]} castShadow>
                    <cylinderGeometry args={[0.14, 0.22, 1.1, 6]} />
                    <meshStandardMaterial color="#4a3b32" roughness={0.9} />
                </mesh>
                <group position={[0, 1.0, 0]} rotation={[0, 1.0, -0.4]}>
                     <mesh position={[0, 0.4, 0]} castShadow><cylinderGeometry args={[0.08, 0.12, 0.8, 5]} /><meshStandardMaterial color="#4a3b32" /></mesh>
                     <LeafCluster position={[0, 0.7, 0]} scale={0.6} />
                     <LeafCluster position={[-0.3, 0.5, 0.2]} scale={0.45} />
                </group>
                 <group position={[0, 0.7, 0]} rotation={[0.4, 0, 0.6]}>
                     <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.06, 0.1, 0.6, 5]} /><meshStandardMaterial color="#4a3b32" /></mesh>
                     <LeafCluster position={[0, 0.5, 0]} scale={0.5} />
                </group>
            </group>
            
            {/* Center Crown Fill */}
            <LeafCluster position={[0, 1.2, 0]} scale={0.7} />
            <LeafCluster position={[0, 1.5, 0.3]} scale={0.5} />
            <LeafCluster position={[0, 1.4, -0.3]} scale={0.5} />
        </group>
    );
};
