
import React from 'react';
import { ThreeElements } from '@react-three/fiber';

// Coordinate system: (0,0) is Bottom-Left
export interface Vector2i {
  x: number;
  y: number;
}

export interface ChunkCoords {
  u: number;
  v: number;
}

export interface PixelPosition {
  x: number;
  y: number;
}

export type Atmosphere = 'day' | 'night' | 'stormy' | 'darkness';

export interface GamePieceModel {
  id: string;
  position: Vector2i; // Grid coordinates
  color: string;
  type: 'pawn' | 'rook' | 'knight' | 'enemy';
  maxMoves: number;
  vision: number; // Base vision range in hexes
  status?: 'active' | 'exited' | 'waiting';
  chunk: ChunkCoords;
  isAlerted?: boolean; // Visual state for "!"
  aiState?: {
    lastKnownTargetPos: Vector2i | null;
    hasAlerted?: boolean; // Logic flag to prevent detecting same target repeatedly in one turn
    huntTurns?: number;
    originalPosition?: Vector2i;
  };
}

export interface MoveSession {
  pieceId: string;
  currentPath: string[]; // Array of "x,y" keys
  selectedNeighborIndex: number; // For scroll-wheel selection
  isWheelActive: boolean; // Only show wheel selector if they have scrolled
}

export interface DragState {
  isDragging: boolean;
  pieceId: string | null;
  startPixel: PixelPosition;
  currentPixel: PixelPosition;
  originalGridPosition: Vector2i;
  validMoves: Map<string, number>;
}

export type ExitSide = 'left' | 'right' | 'top' | 'bottom';

export interface ExitMarker {
  gridPos: Vector2i;
  color: string;
}

export interface ExitZoneState {
  side: ExitSide;
  markers: ExitMarker[];
}

export interface TileData {
  color?: string;
  height?: number;
  overlay?: string;
  overlayRotation?: number;
  overlayScale?: number;
  overlayOffset?: { x: number; z: number };
  isBlocked?: boolean;
  storyTrigger?: {
      id: string;
      hasFired: boolean;
      customPrompt?: string;
  };
}

export interface ChunkData {
  id: string;
  coords: ChunkCoords;
  tileData: Record<string, TileData>;
  revealedTiles: Set<string>;
  biome?: string;
}

export interface FreeObject {
  id: string;
  assetId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Euler
  scale: { x: number; y: number; z: number };
  windowOpen?: boolean;
}

export interface SavedLevelState {
  id: number;
  chunks: Record<string, ChunkData>;
  freeObjects: FreeObject[];
  enemies: GamePieceModel[]; // State of enemies when left
  atmosphere: Atmosphere;
  name: string;
  isVisited: boolean;
  exitSide?: ExitSide | null;
}

export interface VisitedNeighbors {
    top?: string;    // Name/ID of visited map, undefined if unvisited
    bottom?: string;
    left?: string;
    right?: string;
}

// NEW VOXEL TYPES
export type VoxelMap = Map<string, number>; // "x,y,z" -> materialIndex
