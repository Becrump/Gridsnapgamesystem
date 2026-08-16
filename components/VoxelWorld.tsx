
import React, { useRef, useEffect, useMemo, useState, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three-stdlib';
import { VOXEL_SCALE, GRID_COLS, GRID_ROWS, MAP_DEPTH, VOXEL_PALETTE, COLOR_GRASS, COLOR_DIRT, COLOR_WATER_DEEP, COLOR_LAVA } from '../constants';
import { ProceduralMaterial } from './ProceduralMaterials';
import { TileData } from '../types';

interface VoxelWorldProps {
  complexity: number; 
  isEditMode: boolean;
  brushMaterial: string;
  onVoxelClick?: (point: THREE.Vector3, isRightClick: boolean) => void;
  onVoxelHover?: (point: THREE.Vector3) => void;
  gameLevelId: number;
  tileData?: Record<string, TileData>;
  revealedTiles?: Set<string>; // If present, use to filter
  visibleTiles?: Set<string>;  // If present, use to highlight/dim
}

// --- GEOMETRY CONSTANTS FOR WATER FACES ---
const WATER_GEO_TOP = new THREE.PlaneGeometry(1, 1, 8, 8); // Increased segments for wave vertices
WATER_GEO_TOP.rotateX(-Math.PI / 2);
WATER_GEO_TOP.translate(0, 0.5, 0);

const WATER_GEO_BOTTOM = new THREE.PlaneGeometry(1, 1);
WATER_GEO_BOTTOM.rotateX(Math.PI / 2);
WATER_GEO_BOTTOM.translate(0, -0.5, 0);

const WATER_GEO_FRONT = new THREE.PlaneGeometry(1, 1); // Z+
WATER_GEO_FRONT.translate(0, 0, 0.5);

const WATER_GEO_BACK = new THREE.PlaneGeometry(1, 1); // Z-
WATER_GEO_BACK.rotateY(Math.PI);
WATER_GEO_BACK.translate(0, 0, -0.5);

const WATER_GEO_RIGHT = new THREE.PlaneGeometry(1, 1); // X+
WATER_GEO_RIGHT.rotateY(Math.PI / 2);
WATER_GEO_RIGHT.translate(0.5, 0, 0);

const WATER_GEO_LEFT = new THREE.PlaneGeometry(1, 1); // X-
WATER_GEO_LEFT.rotateY(-Math.PI / 2);
WATER_GEO_LEFT.translate(-0.5, 0, 0);

// --- PROCEDURAL GRASS SYSTEM ---
const GRASS_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPosition;

  float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  void main() {
    vUv = uv;
    vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    
    float windWave = sin(uTime * 1.5 + instancePos.x * 0.5 + instancePos.z * 0.3);
    float windGust = sin(uTime * 0.5 + instancePos.x * 0.1 + instancePos.z * 0.2);
    float totalWind = windWave * 0.1 + windGust * 0.15;
    
    float bendFactor = pow(position.y * 2.5, 2.0); 
    
    vec3 newPos = position;
    newPos.x += totalWind * bendFactor;
    newPos.z += totalWind * bendFactor * 0.5;

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(newPos, 1.0);
    vHeight = position.y;
  }
`;

const GRASS_FRAGMENT_SHADER = `
  varying float vHeight;
  varying vec3 vWorldPosition;
  
  void main() {
    vec3 colorBase = vec3(0.05, 0.25, 0.1);
    vec3 colorTip = vec3(0.4, 0.7, 0.2);
    vec3 finalColor = mix(colorBase, colorTip, vHeight * 2.0); 
    float ao = smoothstep(0.0, 0.4, vHeight);
    finalColor *= (0.5 + 0.5 * ao);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const ProceduralGrass: React.FC<{ instances: {pos: [number, number, number]}[] }> = React.memo(({ instances }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(0.1, 0.35, 1, 4);
        geo.translate(0, 0.175, 0); 
        return geo;
    }, []);

    const grassData = useMemo(() => {
        const BLADES_PER_BLOCK = 8;
        const dummy = new THREE.Object3D();
        const matrices: THREE.Matrix4[] = [];

        instances.forEach(block => {
            for(let i=0; i<BLADES_PER_BLOCK; i++) {
                const offsetX = (Math.random() - 0.5) * 0.8 * VOXEL_SCALE;
                const offsetZ = (Math.random() - 0.5) * 0.8 * VOXEL_SCALE;
                const scale = 0.7 + Math.random() * 0.6;
                const rotation = Math.random() * Math.PI;

                dummy.position.set(
                    block.pos[0] * VOXEL_SCALE + offsetX,
                    block.pos[1] * VOXEL_SCALE + (VOXEL_SCALE * 0.5), 
                    block.pos[2] * VOXEL_SCALE + offsetZ
                );
                dummy.rotation.y = rotation;
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                matrices.push(dummy.matrix.clone());
            }
        });
        return matrices;
    }, [instances]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        meshRef.current.count = grassData.length;
        grassData.forEach((mat, i) => {
            meshRef.current!.setMatrixAt(i, mat);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [grassData]);

    useFrame((state) => {
        if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    });

    if (instances.length === 0) return null;
    return (
        <instancedMesh ref={meshRef} args={[geometry, undefined, grassData.length]} receiveShadow>
            <shaderMaterial
                ref={materialRef}
                vertexShader={GRASS_VERTEX_SHADER}
                fragmentShader={GRASS_FRAGMENT_SHADER}
                uniforms={{ uTime: { value: 0 } }}
                side={THREE.DoubleSide}
            />
        </instancedMesh>
    );
});
ProceduralGrass.displayName = 'ProceduralGrass';

const DecorationLayer: React.FC<{ 
    instances: {pos: [number, number, number], scale: number}[], 
    color: string, 
    type: 'pebble' 
}> = React.memo(({ instances, color, type }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const geometry = useMemo(() => new THREE.DodecahedronGeometry(0.15, 0), [type]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        meshRef.current.count = instances.length;
        const dummy = new THREE.Object3D();
        instances.forEach((inst, i) => {
            dummy.position.set(inst.pos[0] * VOXEL_SCALE, inst.pos[1] * VOXEL_SCALE, inst.pos[2] * VOXEL_SCALE);
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.scale.setScalar(inst.scale);
            dummy.position.y += 0.1 * VOXEL_SCALE;
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [instances]);

    if (instances.length === 0) return null;
    return (
        <instancedMesh ref={meshRef} args={[geometry, undefined, instances.length]} castShadow receiveShadow>
            <meshStandardMaterial color={color} />
        </instancedMesh>
    );
});
DecorationLayer.displayName = 'DecorationLayer';

// --- SOLID LAYER COMPONENT WITH GRID LINES ---
const SolidLayer: React.FC<{
    instances: {pos: [number, number, number], mat: number, isDimmed: boolean}[];
    geometry: THREE.BufferGeometry;
    onClick: (e: THREE.Event) => void;
    onPointerMove: (e: THREE.Event) => void;
}> = React.memo(({ instances, geometry, onClick, onPointerMove }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const colorHelper = useMemo(() => new THREE.Color(), []);

    // Custom Shader to draw grid lines on top
    const onBeforeCompile = useMemo(() => (shader: THREE.Shader) => {
        shader.vertexShader = `
          varying vec3 vWorldPosition;
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWorldPosition = worldPos.xyz;
          `
        );
        shader.fragmentShader = `
          varying vec3 vWorldPosition;
          ${shader.fragmentShader}
        `.replace(
          '#include <dithering_fragment>',
          `
          #include <dithering_fragment>
          // Calculate grid on top face
          vec3 fdx = dFdx(vWorldPosition);
          vec3 fdy = dFdy(vWorldPosition);
          vec3 norm = normalize(cross(fdx, fdy));
          
          // If facing roughly up
          if (norm.y > 0.8) {
              vec2 grid = fract(vWorldPosition.xz + 0.5); 
              float thickness = 0.02; // Thin black line
              float line = step(1.0 - thickness, max(grid.x, grid.y)) + step(max(grid.x, grid.y), thickness);
              
              // Darken borders
              gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), clamp(line, 0.0, 1.0) * 0.5);
          }
          `
        );
    }, []);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        meshRef.current.count = instances.length;
        const dummy = new THREE.Object3D();
        
        instances.forEach((inst, i) => {
            dummy.position.set(inst.pos[0] * VOXEL_SCALE, inst.pos[1] * VOXEL_SCALE, inst.pos[2] * VOXEL_SCALE);
            dummy.scale.set(VOXEL_SCALE, VOXEL_SCALE, VOXEL_SCALE);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
            
            colorHelper.set(VOXEL_PALETTE[inst.mat] || '#ff00ff');
            // Dim if memory
            if (inst.isDimmed) colorHelper.multiplyScalar(0.25);
            
            meshRef.current!.setColorAt(i, colorHelper);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [instances, colorHelper]);

    if (instances.length === 0) return null;

    return (
        <instancedMesh 
            ref={meshRef} 
            args={[geometry, undefined, instances.length]} 
            castShadow 
            receiveShadow
            onClick={onClick}
            onPointerMove={onPointerMove}
            onPointerDown={(e) => e.stopPropagation()} 
        >
            <meshStandardMaterial roughness={0.8} onBeforeCompile={onBeforeCompile} /> 
        </instancedMesh>
    );
});
SolidLayer.displayName = 'SolidLayer';

// --- WATER FACE LAYER ---
const WaterFaceLayer: React.FC<{
    instances: {pos: [number, number, number]}[];
    geometry: THREE.BufferGeometry;
    onClick: (e: THREE.Event) => void;
    onPointerMove: (e: THREE.Event) => void;
    isTop?: boolean;
}> = React.memo(({ instances, geometry, onClick, onPointerMove, isTop }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const uniforms = useRef({ uTime: { value: 0 } });

    useFrame((state) => {
        uniforms.current.uTime.value = state.clock.elapsedTime;
    });
    
    // Grid Shader + Ripple for Top Face
    const onBeforeCompile = useMemo(() => (shader: THREE.Shader) => {
        if (!isTop) return;
        
        shader.uniforms.uTime = uniforms.current.uTime;
        
        shader.vertexShader = `
          uniform float uTime;
          varying vec3 vWorldPosition;
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWorldPosition = worldPos.xyz;
          
          // Ripple displacement
          float ripple = sin(worldPos.x * 2.0 + uTime) * 0.03 + sin(worldPos.z * 1.5 + uTime * 0.8) * 0.03;
          transformed.y += ripple;
          `
        );
        shader.fragmentShader = `
          varying vec3 vWorldPosition;
          ${shader.fragmentShader}
        `.replace(
          '#include <dithering_fragment>',
          `
          #include <dithering_fragment>
          vec2 grid = fract(vWorldPosition.xz + 0.5); 
          float thickness = 0.02;
          float line = step(1.0 - thickness, max(grid.x, grid.y)) + step(max(grid.x, grid.y), thickness);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), clamp(line, 0.0, 1.0) * 0.5);
          `
        );
    }, [isTop]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        meshRef.current.count = instances.length;
        const dummy = new THREE.Object3D();
        instances.forEach((inst, i) => {
            dummy.position.set(inst.pos[0] * VOXEL_SCALE, inst.pos[1] * VOXEL_SCALE, inst.pos[2] * VOXEL_SCALE);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [instances]);

    if (instances.length === 0) return null;

    return (
        <instancedMesh 
            ref={meshRef} 
            args={[geometry, undefined, instances.length]} 
            onClick={onClick}
            onPointerMove={onPointerMove}
        >
             <meshStandardMaterial 
                ref={materialRef}
                color={COLOR_WATER_DEEP} 
                transparent 
                opacity={0.8} 
                roughness={0.0} 
                metalness={0.2}
                onBeforeCompile={onBeforeCompile}
             />
        </instancedMesh>
    );
});
WaterFaceLayer.displayName = 'WaterFaceLayer';


export const VoxelWorld: React.FC<VoxelWorldProps> = ({ isEditMode, onVoxelClick, onVoxelHover, gameLevelId, tileData, revealedTiles, visibleTiles }) => {
  const [solidChunks, setSolidChunks] = useState<Record<number, {pos: [number, number, number], mat: number, isDimmed: boolean}[]>>({});
  const [waterFaces, setWaterFaces] = useState({
      top: [] as {pos: [number, number, number]}[],
      bottom: [] as {pos: [number, number, number]}[],
      left: [] as {pos: [number, number, number]}[],
      right: [] as {pos: [number, number, number]}[],
      front: [] as {pos: [number, number, number]}[],
      back: [] as {pos: [number, number, number]}[]
  });
  const [lavaInstances, setLavaInstances] = useState<{pos: [number, number, number]}[]>([]);
  const [pebbleDecor, setPebbleDecor] = useState<{pos: [number, number, number], scale: number}[]>([]);
  const [grassBlocks, setGrassBlocks] = useState<{pos: [number, number, number]}[]>([]);

  const lavaMeshRef = useRef<THREE.InstancedMesh>(null);
  const fluidGeometry = useMemo(() => new THREE.BoxGeometry(1.0, 1.0, 1.0), []);

  const solidGeometries = useMemo(() => {
      const base = new RoundedBoxGeometry(1.0, 1.0, 1.0, 4, 0.15);
      const variants: THREE.BufferGeometry[] = [];
      
      for (let i = 0; i < 16; i++) {
          const geo = base.clone();
          const pos = geo.attributes.position;
          const v = new THREE.Vector3();
          
          for (let j = 0; j < pos.count; j++) {
              v.fromBufferAttribute(pos, j);
              if ((i & 1) && v.x > 0.01) v.x = 0.5;   // Flatten Right
              if ((i & 2) && v.x < -0.01) v.x = -0.5; // Flatten Left
              if ((i & 4) && v.z > 0.01) v.z = 0.5;   // Flatten Bottom
              if ((i & 8) && v.z < -0.01) v.z = -0.5; // Flatten Top
              pos.setXYZ(j, v.x, v.y, v.z);
          }
          geo.computeVertexNormals();
          variants.push(geo);
      }
      return variants;
  }, []);

  const bounds = useMemo(() => ({
    minX: -(GRID_COLS / 2), maxX: (GRID_COLS / 2) - 1,
    minZ: -(GRID_ROWS / 2), maxZ: (GRID_ROWS / 2) - 1,
    minY: -MAP_DEPTH, maxY: 20
  }), []);

  useEffect(() => {
    const map = new Map<string, number>();
    const xOffset = GRID_COLS / 2;
    const zOffset = GRID_ROWS / 2;
    
    // 1. Build Map
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const gridX = Math.round(x + xOffset);
        const gridY = Math.round(z + zOffset);
        
        let height = 0; 
        let mat = 0; 

        if (tileData && tileData[`${gridX},${gridY}`]) {
            height = tileData[`${gridX},${gridY}`].height || 0;
            const tileColor = tileData[`${gridX},${gridY}`].color;
            const idx = VOXEL_PALETTE.indexOf(tileColor || COLOR_GRASS);
            if (idx !== -1) mat = idx;
        }

        for (let y = bounds.minY; y <= height; y++) {
             let m = 1; 
             if (y === height) m = mat; 
             if (y < height - 3) m = 2; 
             if (y === bounds.minY) m = 8; 
             map.set(`${x},${y},${z}`, m);
        }
      }
    }

    const chunks: Record<number, {pos: [number, number, number], mat: number, isDimmed: boolean}[]> = {};
    for(let i=0; i<16; i++) chunks[i] = [];
    
    // WATER FACE BUCKETS
    const wFaces = {
        top: [] as {pos:[number,number,number]}[],
        bottom: [] as {pos:[number,number,number]}[],
        left: [] as {pos:[number,number,number]}[],
        right: [] as {pos:[number,number,number]}[],
        front: [] as {pos:[number,number,number]}[],
        back: [] as {pos:[number,number,number]}[]
    };
    
    const lava: {pos: [number, number, number]}[] = [];
    const pebbleD: {pos: [number, number, number], scale: number}[] = [];
    const grassB: {pos: [number, number, number]}[] = [];

    const isSolid = (mx: number, my: number, mz: number) => {
        const k = `${mx},${my},${mz}`;
        if (!map.has(k)) return false;
        const val = map.get(k);
        return val !== 4 && val !== 5;
    };
    
    const isWater = (mx: number, my: number, mz: number) => {
        const k = `${mx},${my},${mz}`;
        return map.get(k) === 4;
    };

    map.forEach((matIndex, key) => {
        const [x, y, z] = key.split(',').map(Number);
        
        // Visibility Check
        const gridX = Math.round(x + xOffset);
        const gridY = Math.round(z + zOffset); // Map Z is Grid Y
        const key2d = `${gridX},${gridY}`;
        
        const isRevealed = revealedTiles ? revealedTiles.has(key2d) : true;
        if (!isRevealed) return; // Skip building unseen voxel

        const isVisible = visibleTiles ? visibleTiles.has(key2d) : true;
        const isDimmed = !isVisible; // Memory

        const isW = (matIndex === 4);
        const isL = (matIndex === 5);
        
        const neighbors = [
            `${x+1},${y},${z}`, `${x-1},${y},${z}`,
            `${x},${y+1},${z}`, `${x},${y-1},${z}`,
            `${x},${y},${z+1}`, `${x},${y},${z-1}`
        ];
        
        const exposed = neighbors.some(nKey => {
            if (!map.has(nKey)) return true; 
            const nMat = map.get(nKey);
            if ((nMat === 4 || nMat === 5) && !isW && !isL) return true;
            return false;
        });

        if (exposed || isW || isL) {
            if (isW) {
                // Determine visible faces for water
                if (!isWater(x, y+1, z)) wFaces.top.push({pos:[x,y,z]});
                if (!isWater(x, y-1, z)) wFaces.bottom.push({pos:[x,y,z]});
                if (!isWater(x+1, y, z)) wFaces.right.push({pos:[x,y,z]});
                if (!isWater(x-1, y, z)) wFaces.left.push({pos:[x,y,z]});
                if (!isWater(x, y, z+1)) wFaces.front.push({pos:[x,y,z]});
                if (!isWater(x, y, z-1)) wFaces.back.push({pos:[x,y,z]});
            } else if (isL) {
                lava.push({ pos: [x, y, z] });
            } else {
                let mask = 0;
                if (isSolid(x+1, y, z)) mask |= 1;
                if (isSolid(x-1, y, z)) mask |= 2;
                if (isSolid(x, y, z+1)) mask |= 4;
                if (isSolid(x, y, z-1)) mask |= 8;

                chunks[mask].push({ pos: [x, y, z], mat: matIndex, isDimmed });

                if (!map.has(`${x},${y+1},${z}`)) {
                   if (matIndex === 1 && Math.random() > 0.5) {
                        pebbleD.push({ 
                            pos: [x + (Math.random()-0.5)*0.6, y + 0.5, z + (Math.random()-0.5)*0.6], 
                            scale: 0.5 + Math.random()*0.5 
                        });
                    }
                    if (matIndex === 0 && !isDimmed) {
                        grassB.push({ pos: [x, y, z] });
                    }
                }
            }
        }
    });

    setSolidChunks(chunks);
    setWaterFaces(wFaces);
    setLavaInstances(lava);
    setPebbleDecor(pebbleD);
    setGrassBlocks(grassB);

  }, [gameLevelId, tileData, revealedTiles, visibleTiles]); 

  useLayoutEffect(() => {
      if (!lavaMeshRef.current) return;
      lavaMeshRef.current.count = lavaInstances.length;
      const dummy = new THREE.Object3D();
      lavaInstances.forEach((inst, i) => {
          dummy.position.set(inst.pos[0] * VOXEL_SCALE, inst.pos[1] * VOXEL_SCALE, inst.pos[2] * VOXEL_SCALE);
          dummy.scale.set(1.0, 0.95, 1.0); 
          dummy.updateMatrix();
          lavaMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      lavaMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [lavaInstances]);


  const getGridFromIntersect = (e: THREE.Event) => {
     if (!e.face) return null;
     const point = e.point;
     const nudge = e.face.normal.clone().multiplyScalar(-0.5 * VOXEL_SCALE);
     const targetPos = point.clone().add(nudge);
     const vx = Math.round(targetPos.x / VOXEL_SCALE);
     const vy = Math.round(targetPos.y / VOXEL_SCALE);
     const vz = Math.round(targetPos.z / VOXEL_SCALE);
     return new THREE.Vector3(vx, vy, vz);
  };

  const handleClick = (e: THREE.Event) => {
     e.stopPropagation(); 
     const vec = getGridFromIntersect(e);
     if (vec && onVoxelClick) {
         const isRightClick = e.nativeEvent.button === 2;
         onVoxelClick(vec, isRightClick);
     }
  };

  const handlePointerMove = (e: THREE.Event) => {
     if (onVoxelHover) {
         e.stopPropagation();
         const vec = getGridFromIntersect(e);
         if (vec) onVoxelHover(vec);
     }
  };

  return (
    <group>
        {/* SOLID TERRAIN */}
        {Object.entries(solidChunks).map(([maskStr, instances]) => {
            const mask = parseInt(maskStr);
            return (
                <SolidLayer 
                    key={mask}
                    instances={instances}
                    geometry={solidGeometries[mask]}
                    onClick={handleClick}
                    onPointerMove={handlePointerMove}
                />
            );
        })}

        {/* WATER LAYERS (Culled Faces) */}
        <WaterFaceLayer instances={waterFaces.top} geometry={WATER_GEO_TOP} onClick={handleClick} onPointerMove={handlePointerMove} isTop />
        <WaterFaceLayer instances={waterFaces.bottom} geometry={WATER_GEO_BOTTOM} onClick={handleClick} onPointerMove={handlePointerMove} />
        <WaterFaceLayer instances={waterFaces.front} geometry={WATER_GEO_FRONT} onClick={handleClick} onPointerMove={handlePointerMove} />
        <WaterFaceLayer instances={waterFaces.back} geometry={WATER_GEO_BACK} onClick={handleClick} onPointerMove={handlePointerMove} />
        <WaterFaceLayer instances={waterFaces.right} geometry={WATER_GEO_RIGHT} onClick={handleClick} onPointerMove={handlePointerMove} />
        <WaterFaceLayer instances={waterFaces.left} geometry={WATER_GEO_LEFT} onClick={handleClick} onPointerMove={handlePointerMove} />

        {/* LAVA LAYER - Fixed args to ensure buffer allocation */}
        <instancedMesh ref={lavaMeshRef} args={[fluidGeometry, undefined, lavaInstances.length]} onClick={handleClick} onPointerMove={handlePointerMove}>
             <ProceduralMaterial color={COLOR_LAVA} type="magma" opacity={1.0} />
        </instancedMesh>

        {/* PROCEDURAL GRASS */}
        <ProceduralGrass instances={grassBlocks} />

        {/* DECORATIONS */}
        <DecorationLayer instances={pebbleDecor} color="#a8a29e" type="pebble" />
    </group>
  );
};
