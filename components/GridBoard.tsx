
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, Sky, Cloud, Float, Text, Edges } from '@react-three/drei';
import * as THREE from 'three';

import { GRID_COLS, GRID_ROWS, BASE_HEIGHT, ELEVATION_STEP, VOXEL_SCALE } from '../constants';
import { Vector2i, GamePieceModel, ChunkCoords, ChunkData, TileData, ExitSide, Atmosphere, MoveSession, FreeObject, VisitedNeighbors } from '../types';
import { GamePiece } from './GamePiece';
import * as Assets from './GameAssets';
import { gridToWorld } from '../App';
import { VoxelWorld } from './VoxelWorld';

interface GridBoardProps {
  pieces: GamePieceModel[];
  chunks: Record<string, ChunkData>;
  activeChunk: ChunkCoords;
  onPieceClick: (id: string) => void;
  onTileClick: (pos: Vector2i, point: THREE.Vector3, isRightClick?: boolean) => void;
  isPaintMode: boolean; 
  isEditMode?: boolean;
  activePieceId: string;
  moveSession: MoveSession | null;
  setMoveSession: React.Dispatch<React.SetStateAction<MoveSession | null>>;
  remainingMoves: number;
  revealAll: boolean;
  atmosphere?: Atmosphere;
  showHeights: boolean;
  onExit?: (pieceId: string, side: ExitSide) => void;
  freeObjects?: FreeObject[];
  onFreeObjectClick?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  selectedFreeObjectId?: string | null;
  onFreeObjectRotate?: (direction: number) => void;
  playerVision?: Set<string>;
  revealedTiles?: Set<string>; // MEMORY
  isGlobalReveal?: boolean;    // TOGGLE
  exitSide?: ExitSide | null;
  reachableTiles?: Map<string, number>;
  heldObjectId?: string | null;
  visitedNeighbors?: VisitedNeighbors;
  worldComplexity: number;
  voxelMaterial: string;
  gameLevelId: number;
  onAssetMove?: (from: Vector2i, to: Vector2i) => void;
}

// PRIMARY MOVE UI
const ValidMovesOverlay: React.FC<{ 
    reachableTiles: Map<string, number>;
    activeChunkData: ChunkData | undefined;
    onTileClick: (pos: Vector2i, pt: THREE.Vector3, isRight: boolean) => void;
}> = React.memo(({ reachableTiles, activeChunkData, onTileClick }) => {
    if (!activeChunkData || reachableTiles.size === 0) return null;

    return (
        <group renderOrder={2000}>
            {Array.from(reachableTiles.entries()).map(([key, cost]) => {
                const [x, y] = key.split(',').map(Number);
                const wp = gridToWorld({ x, y });
                const tile = activeChunkData.tileData[key];
                const h = (tile?.height || 0) * VOXEL_SCALE;
                const isBlocked = tile?.isBlocked;
                const color = isBlocked ? "#ef4444" : "#00ff00"; 

                return (
                    <group key={key} position={[wp.x, h, wp.z]}>
                         {/* Top Face Highlight & Edges Only */}
                         <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => {
                                e.stopPropagation();
                                onTileClick({ x, y }, e.point, false);
                            }}>
                             <planeGeometry args={[0.9, 0.9]} /> 
                             <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
                             <Edges scale={1.0} color={color} linewidth={3} threshold={1} />
                         </mesh>

                        <Text 
                            position={[0, 0.8, 0]} 
                            fontSize={0.5} 
                            color="#ffffff" 
                            outlineWidth={0.05} 
                            outlineColor="#000000"
                            anchorY="bottom"
                            renderOrder={2001}
                            depthTest={false}
                        >
                            {cost}
                        </Text>
                        
                        {/* Larger Hitbox for Ease of Use */}
                        <mesh 
                            position={[0, 0, 0]}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTileClick({ x, y }, e.point, false);
                            }}
                            renderOrder={2001}
                            visible={false}
                        >
                            <boxGeometry args={[1.0, 1.2, 1.0]} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
});
ValidMovesOverlay.displayName = 'ValidMovesOverlay';

export const GridBoard: React.FC<GridBoardProps> = ({
  pieces, chunks, activeChunk, onPieceClick, onTileClick, isPaintMode, activePieceId, moveSession, 
  setMoveSession, remainingMoves, revealAll, atmosphere = 'day', showHeights, freeObjects = [], 
  onFreeObjectClick, selectedFreeObjectId, isEditMode, onFreeObjectRotate, playerVision, revealedTiles, isGlobalReveal = false, exitSide, 
  onExit, reachableTiles, heldObjectId, visitedNeighbors, worldComplexity, voxelMaterial, gameLevelId,
  onAssetMove
}) => {
  
  const activeChunkData = chunks[`${activeChunk.u},${activeChunk.v}`];

  // Drag State
  const [dragState, setDragState] = useState<{ startPos: Vector2i, assetType: string } | null>(null);
  const [dragTarget, setDragTarget] = useState<Vector2i | null>(null);

  const handlePlaneClick = (e: ThreeEvent<MouseEvent>) => {
      const x = Math.round(e.point.x);
      const z = Math.round(e.point.z);
      const xOffset = (GRID_COLS * 1.0) / 2;
      const zOffset = (GRID_ROWS * 1.0) / 2;
      const gridX = x + xOffset;
      const gridY = z + zOffset; 
      if (gridX >= 0 && gridX < GRID_COLS && gridY >= 0 && gridY < GRID_ROWS) {
          onTileClick({ x: gridX, y: gridY }, e.point, e.nativeEvent.button === 2);
      }
  };
  
  const handleAssetClick = (pos: Vector2i, e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!dragState) {
        onTileClick(pos, e.point, e.nativeEvent.button === 2);
      }
  };

  const handleAssetPointerDown = (pos: Vector2i, assetType: string, e: ThreeEvent<PointerEvent>) => {
      if (!isPaintMode) return;
      e.stopPropagation();
      setDragState({ startPos: pos, assetType });
  };

  const handleGlobalPointerUp = () => {
      if (dragState && dragTarget && onAssetMove) {
          onAssetMove(dragState.startPos, dragTarget);
      }
      setDragState(null);
      setDragTarget(null);
  };

  const handleGridHover = (pt: THREE.Vector3) => {
      if (dragState) {
          const xOffset = (GRID_COLS * 1.0) / 2;
          const zOffset = (GRID_ROWS * 1.0) / 2;
          const gx = Math.round(pt.x + xOffset);
          const gy = Math.round(pt.z + zOffset);
          if (gx >= 0 && gx < GRID_COLS && gy >= 0 && gy < GRID_ROWS) {
              setDragTarget({ x: gx, y: gy });
          }
      }
  };

  // Helper for visibility check
  const isTileRevealed = (key: string) => isGlobalReveal || isPaintMode || (revealedTiles && revealedTiles.has(key));
  const isTileVisible = (key: string) => isGlobalReveal || isPaintMode || (playerVision && playerVision.has(key));

  return (
    <Canvas 
        shadows 
        dpr={[1, 1.5]} 
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        onPointerUp={handleGlobalPointerUp}
    >
       <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={45} />
       <OrbitControls 
          maxPolarAngle={Math.PI / 2.1} 
          minDistance={5} 
          maxDistance={150} 
          target={[0, 0, 0]}
          enabled={!heldObjectId && !dragState} // Disable orbit when dragging
       />
       
       {atmosphere === 'day' && <Sky sunPosition={[100, 50, 100]} turbidity={0.5} rayleigh={0.5} />}
       {atmosphere === 'night' && <Stars radius={100} depth={50} count={5000} factor={4} fade speed={1} />}
       
       <ambientLight intensity={atmosphere === 'day' ? 0.7 : 0.2} />
       <directionalLight position={[20, 30, 10]} intensity={atmosphere === 'day' ? 1.5 : 0.5} castShadow shadow-mapSize={[2048, 2048]} />
       
       {/* TERRAIN ENGINE */}
       <VoxelWorld 
           complexity={worldComplexity} 
           isEditMode={isPaintMode} 
           brushMaterial={voxelMaterial}
           gameLevelId={gameLevelId}
           tileData={activeChunkData?.tileData}
           onVoxelHover={handleGridHover}
           onVoxelClick={(pt, isRight) => {
               const xOffset = (GRID_COLS * 1.0) / 2;
               const zOffset = (GRID_ROWS * 1.0) / 2;
               const gx = Math.round(pt.x + xOffset);
               const gy = Math.round(pt.z + zOffset);
               onTileClick({ x: gx, y: gy }, pt, isRight);
           }}
           // NEW PROPS FOR VISION
           revealedTiles={isGlobalReveal ? undefined : revealedTiles} // If undefined, show all (inside VoxelWorld logic we'll handle undefined as "all" or pass full set)
           // Actually, let's pass undefined if global reveal, otherwise pass the sets
           visibleTiles={isGlobalReveal ? undefined : playerVision}
       />

       {/* CLICK PLANE (Invisible, for catching clicks on empty space if needed) */}
       <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.5, 0]} onClick={handlePlaneClick} onPointerMove={(e) => { e.stopPropagation(); handleGridHover(e.point); }} visible={false}>
           <planeGeometry args={[GRID_COLS, GRID_ROWS]} />
       </mesh>

       {/* MOVE OVERLAY (Disabled in Paint Mode) */}
       {activeChunkData && reachableTiles && !isPaintMode && (
           <ValidMovesOverlay 
                reachableTiles={reachableTiles} 
                activeChunkData={activeChunkData} 
                onTileClick={onTileClick} 
           />
       )}

       {/* GHOST ASSET (DRAGGING) */}
       {dragState && dragTarget && activeChunkData && (
           <group>
               {(() => {
                   const { x, y } = dragTarget;
                   const tile = activeChunkData.tileData[`${x},${y}`];
                   const h = BASE_HEIGHT + (tile?.height || 0) * ELEVATION_STEP;
                   const wp = gridToWorld({ x, y });
                   const ghostPos: [number, number, number] = [wp.x, h, wp.z];
                   
                   // Helper to render correct ghost
                   const renderGhost = (Type: React.FC<any>) => (
                       <group opacity={0.5} transparent>
                            <Type position={ghostPos} seed={x*y} />
                       </group>
                   );

                   // Quick map for ghost
                   if (dragState.assetType === 'tree-oak') return renderGhost(Assets.VoxelTreeOak);
                   if (dragState.assetType === 'tree-autumn') return renderGhost(Assets.VoxelTreeAutumn);
                   if (dragState.assetType === 'tree-wisteria') return renderGhost(Assets.VoxelTreeWisteria);
                   if (dragState.assetType === 'pine') return renderGhost(Assets.VoxelPine);
                   if (dragState.assetType === 'pine-snow') return renderGhost(Assets.VoxelPineSnow);
                   if (dragState.assetType === 'dead-tree') return renderGhost(Assets.VoxelDeadTree);
                   if (dragState.assetType === 'stump') return renderGhost(Assets.VoxelStump);
                   if (dragState.assetType === 'rock') return renderGhost(Assets.VoxelRock);
                   if (dragState.assetType === 'bush') return renderGhost(Assets.VoxelBush);
                   if (dragState.assetType === 'house') return renderGhost(Assets.VoxelHouse);
                   if (dragState.assetType === 'tower') return renderGhost(Assets.VoxelTower);
                   if (dragState.assetType === 'wall') return renderGhost(Assets.VoxelWall);
                   if (dragState.assetType === 'campfire') return renderGhost(Assets.VoxelCampfire);
                   if (dragState.assetType === 'wall-stone') return renderGhost(Assets.VoxelWallStone);
                   if (dragState.assetType === 'wall-wood') return renderGhost(Assets.VoxelWallWood);
                   if (dragState.assetType === 'wall-brick') return renderGhost(Assets.VoxelWallBrick);
                   
                   return null;
               })()}
           </group>
       )}

       {/* ASSETS */}
       {activeChunkData && Object.entries(activeChunkData.tileData).map(([key, tile]: [string, TileData]) => {
           if (!tile.overlay) return null;

           const revealed = isTileRevealed(key);
           if (!revealed) return null;
           
           const visible = isTileVisible(key);
           // If revealed but not visible => Memory state (Darkened)

           const [x, y] = key.split(',').map(Number);
           const wp = gridToWorld({x, y});
           const h = BASE_HEIGHT + (tile.height || 0) * ELEVATION_STEP;
           const objectPos: [number, number, number] = [wp.x, h, wp.z];
           
           // If dragging this specific tile, hide it (or make it faint)
           const isBeingDragged = dragState && dragState.startPos.x === x && dragState.startPos.y === y;
           if (isBeingDragged) return null;

           const assetProps = {
               key: key,
               position: objectPos,
               onClick: (e: ThreeEvent<MouseEvent>) => handleAssetClick({x, y}, e),
               onPointerDown: (e: ThreeEvent<PointerEvent>) => handleAssetPointerDown({x,y}, tile.overlay!, e),
               opacity: visible ? 1.0 : 0.5,
               grayscale: !visible
           };

           // --- ASSET ROUTING ---
           const seed = x * y + x;
           
           if (tile.overlay === 'tree-oak') return <Assets.VoxelTreeOak {...assetProps} seed={seed} />;
           if (tile.overlay === 'tree-autumn') return <Assets.VoxelTreeAutumn {...assetProps} seed={seed} />;
           if (tile.overlay === 'tree-wisteria') return <Assets.VoxelTreeWisteria {...assetProps} seed={seed} />;
           if (tile.overlay === 'pine') return <Assets.VoxelPine {...assetProps} seed={seed*5} />;
           if (tile.overlay === 'pine-snow') return <Assets.VoxelPineSnow {...assetProps} seed={seed*5} />;
           if (tile.overlay === 'dead-tree') return <Assets.VoxelDeadTree {...assetProps} seed={seed*7} />;
           if (tile.overlay === 'stump') return <Assets.VoxelStump {...assetProps} seed={seed*7} />;
           
           if (tile.overlay === 'bush') return <Assets.VoxelBush {...assetProps} seed={seed} />;
           if (tile.overlay === 'rock') return <Assets.VoxelRock {...assetProps} seed={x+y} />;
           if (tile.overlay === 'house') return <Assets.VoxelHouse {...assetProps} seed={seed*2} />;
           if (tile.overlay === 'tower') return <Assets.VoxelTower {...assetProps} seed={x+y*3} />;
           if (tile.overlay === 'wall') return <Assets.VoxelWall {...assetProps} seed={x} />;
           if (tile.overlay === 'campfire') return <Assets.VoxelCampfire {...assetProps} seed={0} />;
           
           // NEW WALLS
           if (tile.overlay === 'wall-stone') return <Assets.VoxelWallStone {...assetProps} seed={seed} />;
           if (tile.overlay === 'wall-wood') return <Assets.VoxelWallWood {...assetProps} seed={seed} />;
           if (tile.overlay === 'wall-brick') return <Assets.VoxelWallBrick {...assetProps} seed={seed} />;
           
           // Legacy Fallback
           if (tile.overlay === 'tree') return <Assets.VoxelTreeOak {...assetProps} seed={seed} />;

           return null;
       })}

       {/* UNITS */}
       {pieces.map(p => {
           if (p.status !== 'active') return null;
           const posKey = `${p.position.x},${p.position.y}`;
           // Only show unit if visible in current LOS (Memory is not enough for dynamic units)
           const isVisible = isTileVisible(posKey);
           
           // Exception: If paint mode or global reveal, show all units
           if (!isVisible && !isPaintMode && !isGlobalReveal) return null;

           const wp = gridToWorld(p.position);
           const tile = activeChunkData?.tileData[posKey];
           const tileHeight = BASE_HEIGHT + (tile?.height || 0) * ELEVATION_STEP;
           const pieceWorldPos: [number, number, number] = [wp.x, tileHeight, wp.z];

           return (
               <GamePiece 
                   key={p.id}
                   piece={p}
                   worldPosition={pieceWorldPos}
                   isGrabbed={false}
                   isActiveTurn={activePieceId === p.id}
                   isDay={atmosphere === 'day'}
                   isVisible={true} // Filtered above
                   onClick={(e) => { e.stopPropagation(); onPieceClick(p.id); }}
                   isEditMode={isPaintMode} // PASSED PROP
               />
           );
       })}
    </Canvas>
  );
};
