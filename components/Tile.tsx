
import React, { useRef, useMemo } from 'react';
import { Vector2i } from '../types';
import { Edges, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { BASE_HEIGHT, ELEVATION_STEP } from '../constants';
import { ProceduralMaterial } from './ProceduralMaterials';

interface TileProps {
  position: Vector2i;
  worldPosition: [number, number, number];
  variant: 'default' | 'valid' | 'invalid';
  customColor?: string;
  height?: number;
  isPathTile?: boolean;
  isRevealed?: boolean;
  isAdjacentToActive?: boolean;
  isReachable?: boolean; 
  remainingMovesIfStepped?: number;
  isIlluminated?: boolean;
  isNight?: boolean;
  onClick?: (pos: Vector2i, point: THREE.Vector3) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  showHeight?: boolean;
  overlay?: string;
  penaltyLabel?: string | null;
  stepCost?: number | null;
  isBlocked?: boolean;
  isEditMode?: boolean;
  isExit?: boolean; // New prop for exit tiles
  hasStoryTrigger?: boolean; // New prop for triggers
}

const HEX_RADIUS = 0.98;

export const Tile: React.FC<TileProps> = React.memo(({ 
  position, 
  worldPosition, 
  variant, 
  customColor, 
  height = 0,
  isPathTile,
  isRevealed = true,
  isAdjacentToActive,
  isReachable = false,
  remainingMovesIfStepped,
  isIlluminated = false,
  isNight = false,
  onClick,
  onPointerEnter,
  onPointerLeave,
  showHeight = false,
  overlay,
  penaltyLabel,
  stepCost,
  isBlocked,
  isEditMode,
  isExit = false,
  hasStoryTrigger = false
}) => {
  const tileHeight = BASE_HEIGHT + (height * ELEVATION_STEP);
  const isIce = customColor === '#93c5fd';
  const isWater = customColor === '#3b82f6' || customColor === '#1d4ed8';
  const isGrass = customColor === '#15803d';

  const baseHex = customColor || '#374151';
  const isFaint = isNight && !isIlluminated && !isReachable && !isAdjacentToActive && !isExit;
  
  // Opacity calculation for night/faint logic
  const opacity = useMemo(() => {
      if (isExit) return 0.6; // Ghostly exit tile
      if (isIce) return 0.8;
      if (isFaint) return 0.3;
      return 1.0;
  }, [isIce, isFaint, isExit]);

  const proceduralType = useMemo(() => {
      if (isExit) return 'standard'; // Keep exit tiles simple
      if (isWater) return 'water';
      if (isGrass) return 'grass';
      if (isIce) return 'ice';
      // Fallback for others using procedural coloring if needed, or standard
      if (customColor === '#78350f') return 'dirt'; 
      return 'standard';
  }, [isWater, isGrass, isIce, customColor, isExit]);
  
  const finalColor = useMemo(() => {
    const color = new THREE.Color(baseHex);
    
    if (isExit) return '#10b981';

    if (isNight) {
        if (isIlluminated) {
            color.multiplyScalar(0.8);
        } else if (isAdjacentToActive) {
            color.multiplyScalar(1.0);
        } else if (isReachable) {
            color.multiplyScalar(0.6); 
        } else {
            color.multiplyScalar(0.15);
            color.lerp(new THREE.Color('#050505'), 0.5);
        }
    }
    
    // In edit mode, if blocked, show as dark red
    if (isEditMode && isBlocked) {
        return '#7f1d1d'; // Dark Red
    }
    
    return color.getStyle();
  }, [isNight, isIlluminated, baseHex, isReachable, isAdjacentToActive, isEditMode, isBlocked, isExit]);

  const emissiveColor = useMemo(() => {
    if (isExit) return new THREE.Color('#34d399');
    if (variant === 'valid' || isReachable || (isAdjacentToActive && isNight)) {
        const col = new THREE.Color(baseHex);
        return isNight && !isIlluminated ? col.multiplyScalar(0.4) : new THREE.Color('#ffffff').multiplyScalar(0.1);
    }
    if (isEditMode && isBlocked) return new THREE.Color('#ff0000');
    return new THREE.Color('#000000');
  }, [variant, isReachable, isNight, isIlluminated, baseHex, isAdjacentToActive, isEditMode, isBlocked, isExit]);

  const emissiveIntensity = useMemo(() => {
    if (isExit) return 1.5;
    if (isEditMode && isBlocked) return 0.5;
    if (variant === 'valid') return 0.8;
    if (isAdjacentToActive) return 0.6;
    if (isReachable) return 0.2;
    return 0;
  }, [variant, isReachable, isAdjacentToActive, isEditMode, isBlocked, isExit]);
  
  // Pulse effect for exit tiles
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
      if (isExit && meshRef.current) {
          const mat = meshRef.current.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.5;
      }
  });

  if (!isRevealed && !isExit) {
      return (
          <group position={worldPosition}>
              <mesh position={[0, BASE_HEIGHT / 2, 0]} rotation={[0, Math.PI / 6, 0]}>
                  <cylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, BASE_HEIGHT, 6]} />
                  <meshStandardMaterial color="#000000" roughness={1} />
              </mesh>
          </group>
      );
  }

  // Floating height to avoid clipping with the hex face
  const labelY = tileHeight + 0.05;

  return (
    <group position={worldPosition}>
      <mesh 
        ref={meshRef}
        position={[0, tileHeight / 2, 0]}
        rotation={[0, Math.PI / 6, 0]} 
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick?.(position, e.point); }}
        onPointerEnter={(e) => { e.stopPropagation(); onPointerEnter?.(); }}
        onPointerLeave={(e) => { e.stopPropagation(); onPointerLeave?.(); }}
      >
        <cylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, tileHeight, 6]} />
        
        {/* Use Procedural Material for morphing effects */}
        {(proceduralType !== 'standard') ? (
            <ProceduralMaterial color={finalColor} type={proceduralType} opacity={opacity} />
        ) : (
             <meshStandardMaterial 
                color={finalColor} 
                roughness={0.8}
                metalness={0.0}
                emissive={emissiveColor}
                emissiveIntensity={emissiveIntensity}
                transparent={isFaint || isExit}
                opacity={opacity}
            />
        )}
        
        {variant === 'valid' && !isExit ? (
             <Edges threshold={15} color="#4ade80" scale={1.08} linewidth={4} renderOrder={100} />
        ) : (
            isAdjacentToActive && !isBlocked && !isExit && (
                <Edges threshold={15} color="#00ff41" scale={1.03} />
            )
        )}
        
        {isExit && <Edges threshold={15} color="#ffffff" scale={1.05} linewidth={2} />}

        {isPathTile && (
            <Edges threshold={15} color="#ffffff" scale={1.05} />
        )}
        
        {/* Edit mode blocked indicator - Cross marks */}
        {isEditMode && isBlocked && (
            <group rotation={[-Math.PI / 2, 0, 0]} position={[0, tileHeight / 2 + 0.01, 0]}>
                <mesh rotation={[0, 0, Math.PI / 4]}>
                    <planeGeometry args={[0.8, 0.1]} />
                    <meshBasicMaterial color="#ff0000" transparent opacity={0.6} />
                </mesh>
                <mesh rotation={[0, 0, -Math.PI / 4]}>
                    <planeGeometry args={[0.8, 0.1]} />
                    <meshBasicMaterial color="#ff0000" transparent opacity={0.6} />
                </mesh>
            </group>
        )}
      </mesh>
      
      {/* Story Trigger Marker (Edit Mode Only) */}
      {isEditMode && hasStoryTrigger && (
          <group position={[0, tileHeight + 0.5, 0]}>
              <mesh>
                  <octahedronGeometry args={[0.3, 0]} />
                  <meshStandardMaterial color="#8b5cf6" emissive="#7c3aed" emissiveIntensity={2} />
              </mesh>
              <Text
                position={[0, 0.4, 0]}
                fontSize={0.2}
                color="#e9d5ff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#4c1d95"
              >
                STORY
              </Text>
          </group>
      )}

      {isIce && (
          <mesh position={[0, tileHeight + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[HEX_RADIUS * 0.9, 6]} />
              <meshPhysicalMaterial 
                color="#ffffff" 
                transparent 
                opacity={0.3} 
                roughness={0} 
                transmission={0.9} 
                thickness={0.1}
              />
          </mesh>
      )}

      {remainingMovesIfStepped !== undefined && (
          <group position={[0, labelY, 0]}>
              {/* Remaining Points Label - Positioned North */}
              <Text
                position={[0, 0, -0.6]}
                fontSize={0.2}
                color={isBlocked ? "#ef4444" : (isAdjacentToActive ? "#00ff41" : "#ffffff")}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.03}
                outlineColor="#000000"
                fillOpacity={isAdjacentToActive ? 1.0 : 0.6}
              >
                {isBlocked ? "BLOCKED" : `${remainingMovesIfStepped}P`}
              </Text>
              
              {/* Step Cost Visualization - Positioned South */}
              {stepCost !== undefined && stepCost !== null && stepCost > 0 && !isBlocked && !isExit && (
                  <Text
                    position={[0, 0, 0.6]}
                    fontSize={0.16}
                    color="#facc15"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                    outlineWidth={0.02}
                    outlineColor="#000000"
                  >
                    {`COST: ${stepCost}${penaltyLabel === '(*)' ? ' (ALL)' : ''}`}
                  </Text>
              )}
          </group>
      )}
      
      {isExit && (
          <group position={[0, labelY + 0.2, 0]}>
               <Text
                position={[0, 0, 0]}
                fontSize={0.25}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.04}
                outlineColor="#059669"
              >
                EXIT
              </Text>
          </group>
      )}
      
      {showHeight && (
          <group position={[0, labelY + 0.1, 0]}>
              <Text
                position={[0.5, 0, 0]}
                fontSize={0.12}
                color="#60a5fa"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
                outlineWidth={0.01}
                outlineColor="#000000"
              >
                {`H:${(height * ELEVATION_STEP).toFixed(2)}`}
              </Text>
          </group>
      )}
    </group>
  );
});

Tile.displayName = 'Tile';
