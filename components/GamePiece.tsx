
import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { GamePieceModel } from '../types';
import * as THREE from 'three';

interface GamePieceProps {
  piece: GamePieceModel;
  worldPosition: [number, number, number];
  isGrabbed: boolean;
  isActiveTurn: boolean;
  isVisible?: boolean;
  isIlluminated?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  isDay?: boolean;
  isEditMode?: boolean;
}

export const GamePiece: React.FC<GamePieceProps> = ({ 
  piece, 
  worldPosition, 
  isGrabbed, 
  isActiveTurn,
  isVisible = true,
  isIlluminated = false,
  onClick,
  isDay = true,
  isEditMode = false
}) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Track movement targets
  const prevWorldPos = useRef(new THREE.Vector3(...worldPosition));
  const targetWorldPos = useRef(new THREE.Vector3(...worldPosition));
  const animationProgress = useRef(1); // 1 = animation complete/idle
  
  const lastProcessedX = useRef(worldPosition[0]);
  const lastProcessedY = useRef(worldPosition[1]);
  const lastProcessedZ = useRef(worldPosition[2]);

  useLayoutEffect(() => {
    if (groupRef.current) {
        groupRef.current.position.set(worldPosition[0], worldPosition[1], worldPosition[2]);
    }
  }, []);

  useEffect(() => {
      const [wx, wy, wz] = worldPosition;
      const dx = Math.abs(wx - lastProcessedX.current);
      const dy = Math.abs(wy - lastProcessedY.current);
      const dz = Math.abs(wz - lastProcessedZ.current);
      
      if (dx > 0.01 || dy > 0.01 || dz > 0.01) {
          if (groupRef.current) {
              prevWorldPos.current.copy(groupRef.current.position);
          } else {
              prevWorldPos.current.set(lastProcessedX.current, lastProcessedY.current, lastProcessedZ.current);
          }
          targetWorldPos.current.set(wx, wy, wz);
          animationProgress.current = 0;
          lastProcessedX.current = wx;
          lastProcessedY.current = wy;
          lastProcessedZ.current = wz;
      }
  }, [worldPosition[0], worldPosition[1], worldPosition[2]]); 

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const dt = Math.min(delta, 0.1);
    const hoverOffset = isGrabbed ? 1.2 : 0;
    const destX = targetWorldPos.current.x;
    const destY = targetWorldPos.current.y + hoverOffset;
    const destZ = targetWorldPos.current.z;

    if (animationProgress.current < 1.0) {
        animationProgress.current += dt * 3.0;
        if (animationProgress.current >= 1.0) animationProgress.current = 1.0;

        const t = animationProgress.current;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; 
        
        const curX = THREE.MathUtils.lerp(prevWorldPos.current.x, destX, ease);
        const curZ = THREE.MathUtils.lerp(prevWorldPos.current.z, destZ, ease);
        const baseCurY = THREE.MathUtils.lerp(prevWorldPos.current.y, destY, ease);
        
        const distSq = Math.pow(destX - prevWorldPos.current.x, 2) + Math.pow(destZ - prevWorldPos.current.z, 2);
        let hopHeight = 0;
        if (distSq > 0.01) hopHeight = isGrabbed ? 0.5 : 1.5; 

        const arcY = Math.sin(t * Math.PI) * hopHeight;
        groupRef.current.position.set(curX, baseCurY + arcY, curZ);

        if (distSq > 0.01) {
             const dx = destX - prevWorldPos.current.x;
             const dz = destZ - prevWorldPos.current.z;
             const tiltFactor = Math.sin(t * Math.PI) * 0.3;
             groupRef.current.rotation.z = -dx * tiltFactor;
             groupRef.current.rotation.x = dz * tiltFactor;
        }
    } else {
        let finalY = destY;
        if (isActiveTurn && !isGrabbed) finalY += Math.sin(state.clock.elapsedTime * 3) * 0.05 + 0.1;
        
        groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, destX, dt * 10);
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, finalY, dt * 10);
        groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, destZ, dt * 10);
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, dt * 8);
        groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, dt * 8);
        
        if (isActiveTurn) {
             const targetRotY = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
             groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, dt * 5);
        } else {
             groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, dt * 5);
        }
    }
  });

  const getGrayscale = (hex: string) => {
    const color = new THREE.Color(hex);
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return new THREE.Color().setRGB(luminance * 0.3, luminance * 0.3, luminance * 0.4);
  };

  const finalColor = useMemo(() => {
    if (isDay || isIlluminated || isActiveTurn) {
        return new THREE.Color(piece.color);
    }
    return getGrayscale(piece.color);
  }, [isDay, isIlluminated, isActiveTurn, piece.color]);

  const emissiveIntensity = isActiveTurn ? (isDay ? 0.5 : 1.2) : (isDay ? 0 : (isIlluminated ? 0.3 : 0.1));
  const showVisuals = isVisible || isGrabbed;

  // Calculate Enemy Number from ID (e.g. e_1265_0 -> "1")
  const enemyLabel = useMemo(() => {
      if (piece.type !== 'enemy') return null;
      const parts = piece.id.split('_');
      const idx = parseInt(parts[parts.length - 1], 10);
      return isNaN(idx) ? '?' : (idx + 1).toString();
  }, [piece.id, piece.type]);

  // FIX: Explicitly handle raycast disabling/enabling. 
  // Passing 'undefined' shadows the prototype method with an undefined property, causing "is not a function" errors.
  // We must pass the prototype method explicitly when we want to enable it again.
  const raycastStrategy = isEditMode ? () => {} : THREE.Mesh.prototype.raycast;

  return (
    <group ref={groupRef}>
      {/* Visuals */}
      {showVisuals && piece.type === 'enemy' && (
        <Html position={[0, 2.0, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
            <div className="bg-red-600 text-white font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-md text-xs">
                {enemyLabel}
            </div>
        </Html>
      )}

      {showVisuals && piece.isAlerted && (
        <Html position={[0, 2.8, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
           <div className="text-5xl font-black text-red-600 animate-bounce drop-shadow-[0_2px_2px_rgba(255,255,255,0.8)]" 
                style={{ fontFamily: 'Arial, sans-serif', WebkitTextStroke: '2px white' }}>
               !
           </div>
        </Html>
      )}

      {showVisuals && isActiveTurn && !isGrabbed && !piece.isAlerted && animationProgress.current >= 1 && (
        <Html position={[0, 2.5, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
            <div className="flex flex-col items-center animate-bounce pointer-events-none select-none">
               <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[15px] border-t-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            </div>
        </Html>
      )}

      <mesh 
        raycast={raycastStrategy}
        castShadow={showVisuals}
        visible={showVisuals}
        position={[0, 0.5, 0]} 
        onClick={(e) => { 
            if (!showVisuals) return;
            e.stopPropagation(); 
            onClick?.(e); 
        }}
      >
        <cylinderGeometry args={[0.3, 0.4, 1, 32]} />
        <meshStandardMaterial 
            color={finalColor} 
            emissive={finalColor}
            emissiveIntensity={emissiveIntensity}
            metalness={0.5}
            roughness={0.2}
        />
      </mesh>
      
      <mesh 
        raycast={raycastStrategy}
        visible={showVisuals}
        position={[0, 1.1, 0]}
        onClick={(e) => { 
            if (!showVisuals) return;
            e.stopPropagation(); 
            onClick?.(e); 
        }}
      >
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial 
            color={finalColor} 
            emissive={finalColor}
            emissiveIntensity={emissiveIntensity}
            metalness={0.5}
            roughness={0.2}
        />
      </mesh>

      {showVisuals && (isGrabbed || animationProgress.current < 1) && (
          <mesh position={[0, -2.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.4, 32]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.3} />
          </mesh>
      )}
    </group>
  );
};
