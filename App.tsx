
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { GoogleGenAI } from "@google/genai";
import { GridBoard } from './components/GridBoard';
import { GamePieceModel, Vector2i, ChunkCoords, ChunkData, TileData, Atmosphere, MoveSession, FreeObject, ExitSide, SavedLevelState, VisitedNeighbors } from './types';
import { Compass, SkipForward, ArrowUp, ArrowDown, Sparkles, Loader2, Box, Gem, Tent, Shield, Flame, Lamp, Zap, TreePine, Mountain, Ruler, Move, Maximize, Sun, Moon, CloudRain, EyeOff, LogOut, Home, Castle, Landmark, PenTool, Play, Ban, MousePointer2, RotateCw, Scaling, Undo, Trash2, MessageSquare, Volume2, VolumeX, LogIn, Wifi, Cpu, Radio, Waves, MapPin, Globe, Lock, Unlock, Eye, Skull, Package, Database, CircleDot, RectangleVertical, Hash, User, Plus, Feather, Minus, Signpost, Archive, Columns, Bean, Sprout, GitFork, Flower, Droplets, Grid3X3, Layers, Hammer, PaintBucket, Trees, ChevronUp, ChevronDown, scaling, Bone, Snowflake, Leaf, Wind, BrickWall, Ghost } from 'lucide-react';
import { GRID_COLS, GRID_ROWS, COL_WIDTH, ROW_HEIGHT, BASE_HEIGHT, ELEVATION_STEP, WORLD_WIDTH, WORLD_HEIGHT, COLOR_DIRT, COLOR_GRASS, COLOR_ICE, COLOR_SAND, COLOR_SNOW, COLOR_STONE, COLOR_WATER_DEEP, COLOR_WATER_SHALLOW, COLOR_ASH, COLOR_LAVA, COLOR_SWAMP, COLOR_ARCANE, COLOR_WOOD, MAP_DEPTH } from './constants';
import * as THREE from 'three';
import { useVibeVoice } from './hooks/useVibeVoice';

// --- Constants & Assets ---

const STARTING_LEVEL_ID = 1265; 

// Vision Ranges
const VISION_RANGES = {
    day: 20,
    night: 10,   // 20 - 10
    stormy: 8,   // 20 - 12
    snow: 8,     // 20 - 12
    darkness: 4  // Void: 20 - 16
};

// Light Source Radii (Blocks)
const LIGHT_SOURCES = {
    'campfire': 6,
    'torch': 4,
    'lantern': 8
};

const INITIAL_HEROES: GamePieceModel[] = [
  { id: 'p1', position: { x: 100, y: 100 }, color: '#ef4444', type: 'rook', maxMoves: 4, vision: 6, status: 'active', chunk: {u:0, v:0} },
  { id: 'p2', position: { x: 101, y: 100 }, color: '#facc15', type: 'knight', maxMoves: 6, vision: 6, status: 'active', chunk: {u:0, v:0} },
];

const VOXEL_MATERIALS = [
    { id: 'grass', label: 'Grass', color: COLOR_GRASS },
    { id: 'dirt', label: 'Dirt', color: COLOR_DIRT },
    { id: 'stone', label: 'Stone', color: COLOR_STONE },
    { id: 'wood', label: 'Wood', color: COLOR_WOOD },
    { id: 'water', label: 'Water', color: COLOR_WATER_DEEP },
    { id: 'lava', label: 'Lava', color: COLOR_LAVA },
    { id: 'snow', label: 'Snow', color: COLOR_SNOW },
    { id: 'sand', label: 'Sand', color: COLOR_SAND },
];

const ASSET_PALETTE = [
    { id: 'tree-oak', label: 'Oak', icon: <Trees size={16} color="#16a34a" /> },
    { id: 'tree-autumn', label: 'Autumn', icon: <Leaf size={16} color="#eab308" /> },
    { id: 'tree-wisteria', label: 'Wisteria', icon: <Flower size={16} color="#6366f1" /> },
    { id: 'pine', label: 'Pine', icon: <TreePine size={16} color="#065f46" /> },
    { id: 'pine-snow', label: 'Snow Pine', icon: <Snowflake size={16} color="#bae6fd" /> },
    { id: 'rock', label: 'Rock', icon: <Gem size={16} color="#78716c" /> },
    { id: 'campfire', label: 'Fire', icon: <Flame size={16} color="#f97316" /> },
    { id: 'lantern', label: 'Lantern', icon: <Lamp size={16} color="#fbbf24" /> },
    { id: 'clear', label: 'Eraser', icon: <Trash2 size={16} color="#ef4444" /> },
];

const STRUCTURE_PALETTE = [
    { id: 'wall-stone', label: 'Stone Wall', icon: <Castle size={16} color="#78716c" /> },
    { id: 'wall-wood', label: 'Wood Wall', icon: <Columns size={16} color="#78350f" /> },
    { id: 'wall-brick', label: 'Brick Wall', icon: <BrickWall size={16} color="#b91c1c" /> },
];

// --- CARTESIAN GRID HELPERS (Square) ---

export function gridToWorld(p: Vector2i): { x: number, y: number, z: number } {
  const xOffset = (GRID_COLS * COL_WIDTH) / 2;
  const zOffset = (GRID_ROWS * ROW_HEIGHT) / 2;
  const localX = (p.x * COL_WIDTH) - xOffset;
  const localZ = (p.y * ROW_HEIGHT) - zOffset;
  return { x: localX, y: 0, z: localZ };
}

export function getDistance(a: Vector2i, b: Vector2i): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export const DIRECTIONS = [ { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 } ];

export function getNeighbors(p: Vector2i): Vector2i[] {
  const neighbors: Vector2i[] = [];
  for (const dir of DIRECTIONS) {
    const nx = p.x + dir.x;
    const ny = p.y + dir.y;
    if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
      neighbors.push({ x: nx, y: ny });
    }
  }
  return neighbors;
}

export function calculateMoveCost(currentHeight: number, targetTile: TileData | undefined, currentMoves: number, isOccupied: boolean, hasBridge: boolean, isAIPathfinding: boolean = false): number {
    if (!targetTile) return Infinity; 
    if (isOccupied && !isAIPathfinding) return Infinity; 
    if (hasBridge) return 1;
    if (targetTile.isBlocked) return Infinity;

    const diff = (targetTile.height || 0) - currentHeight;
    if (diff > 1.0) return Infinity; 
    
    if (targetTile.overlay && targetTile.overlay !== 'bush' && targetTile.overlay !== 'lantern' && targetTile.overlay !== 'campfire') return 2;
    
    if (targetTile.color === COLOR_WATER_DEEP || targetTile.color === COLOR_LAVA) {
        return isAIPathfinding ? 5 : (currentMoves > 0 ? currentMoves : Infinity);
    }

    let cost = 1;
    if (diff > 0) cost += diff;
    if (targetTile.color === COLOR_WATER_SHALLOW) cost = 3; 
    if (targetTile.color === COLOR_SWAMP) cost = 2;
    if (targetTile.overlay === 'mountain') cost += 2;
    return cost;
}

// --- PROCEDURAL GENERATION HELPERS ---
const noise = (x: number, y: number) => {
    return Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 - Math.floor(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
};

const smoothNoise = (x: number, y: number, scale: number) => {
    // Simple composite sin waves for terrain smoothness
    return (Math.sin(x * scale) + Math.sin(y * scale) + Math.sin((x + y) * scale * 0.5) + Math.cos(x * scale * 0.3)) / 4;
};

const generateLevelData = (lvl: number) => {
    const td: Record<string, TileData> = {};
    const center = { x: GRID_COLS / 2, y: GRID_ROWS / 2 };
    
    // Config
    const MOUNTAIN_SCALE = 0.05;
    const HILL_SCALE = 0.1;
    const FOREST_SCALE = 0.15;
    
    // 1. Base Terrain Generation
    for (let x = 0; x < GRID_COLS; x++) {
        for (let y = 0; y < GRID_ROWS; y++) {
            // Normalized Coordinates relative to center
            const nx = (x - center.x);
            const ny = (y - center.y);
            const dist = Math.sqrt(nx*nx + ny*ny);
            
            // Height Calculation
            let h = 0;
            const baseNoise = smoothNoise(x, y, HILL_SCALE);
            const mtnNoise = smoothNoise(x + 100, y + 100, MOUNTAIN_SCALE);
            
            h = Math.floor(baseNoise * 2); // Rolling hills -1 to 1
            
            // Add Mountains
            if (mtnNoise > 0.4) {
                h += Math.floor((mtnNoise - 0.4) * 15);
            }
            
            // Flatten center spawn area
            if (dist < 10) h = 0;

            // Clamp height
            if (h < 0) h = 0;

            let color = COLOR_GRASS;
            let overlay = undefined;
            let isBlocked = false;

            // Biome Coloring
            if (h >= 3) color = COLOR_STONE;
            if (h >= 6) color = COLOR_SNOW;

            td[`${x},${y}`] = { color, height: h, isBlocked };
        }
    }

    // 2. River Generation (Sine Wave Path)
    const riverStart = center.x - 80;
    const riverEnd = center.x + 80;
    for (let x = riverStart; x <= riverEnd; x++) {
        const riverZ = center.y + Math.sin(x * 0.05) * 20 + Math.cos(x * 0.1) * 10;
        const width = 2 + Math.abs(Math.sin(x * 0.2));
        
        for (let y = Math.floor(riverZ - width); y <= Math.ceil(riverZ + width); y++) {
             if (y >= 0 && y < GRID_ROWS && x >= 0 && x < GRID_COLS) {
                 const t = td[`${x},${y}`];
                 t.height = -1;
                 t.color = COLOR_WATER_DEEP;
                 
                 // Sand Banks
                 for (const dir of DIRECTIONS) {
                     const nx = x + dir.x;
                     const ny = y + dir.y;
                     const nt = td[`${nx},${ny}`];
                     if (nt && nt.height !== -1 && nt.height < 2) {
                         nt.color = COLOR_SAND;
                     }
                 }
             }
        }
    }

    // 3. Vegetation & Objects
    for (let x = 0; x < GRID_COLS; x++) {
        for (let y = 0; y < GRID_ROWS; y++) {
             const t = td[`${x},${y}`];
             const dist = Math.sqrt((x - center.x)**2 + (y - center.y)**2);
             
             // Skip water and spawn area
             if (t.height < 0 || dist < 8) continue;

             const fNoise = smoothNoise(x, y, FOREST_SCALE);
             const rVal = noise(x, y);

             // Forests
             if (fNoise > 0.2 && t.color === COLOR_GRASS) {
                 if (rVal > 0.3) {
                     t.overlay = rVal > 0.8 ? 'tree-autumn' : 'tree-oak';
                     t.isBlocked = false; // Trees block LOS but soft movement (2 cost)
                 }
             } else if (fNoise > 0.3 && t.color === COLOR_STONE && t.height < 6) {
                 if (rVal > 0.5) {
                     t.overlay = 'pine';
                 }
             } else if (t.color === COLOR_SNOW && rVal > 0.7) {
                 t.overlay = 'pine-snow';
             }

             // Random Rocks
             if (t.color === COLOR_STONE && !t.overlay && rVal < 0.1) {
                 t.overlay = 'rock';
                 t.isBlocked = true;
             }
        }
    }

    // 4. Ruins Generation (Procedural Rectangles)
    const numRuins = 4;
    for (let i = 0; i < numRuins; i++) {
        const rx = Math.floor(center.x + (noise(i, 0) - 0.5) * 80);
        const ry = Math.floor(center.y + (noise(0, i) - 0.5) * 80);
        const rw = 4 + Math.floor(Math.abs(noise(i, 1)) * 4);
        const rh = 4 + Math.floor(Math.abs(noise(1, i)) * 4);

        // Don't build on water or spawn
        const dist = Math.sqrt((rx - center.x)**2 + (ry - center.y)**2);
        if (dist < 15) continue;
        const checkTile = td[`${rx},${ry}`];
        if (checkTile && checkTile.height < 0) continue;

        // Build Walls
        for (let dx = 0; dx < rw; dx++) {
            for (let dy = 0; dy < rh; dy++) {
                if (dx === 0 || dx === rw - 1 || dy === 0 || dy === rh - 1) {
                    // Leave gaps for doors
                    if (noise(rx + dx, ry + dy) > 0.7) continue;

                    const wx = rx + dx;
                    const wy = ry + dy;
                    if (wx >= 0 && wx < GRID_COLS && wy >= 0 && wy < GRID_ROWS) {
                        const wt = td[`${wx},${wy}`];
                        if (wt.height >= 0) {
                            wt.overlay = 'wall-stone';
                            wt.isBlocked = true;
                            // Flatten ground under wall
                            if (wt.height > 1) wt.height = 1;
                        }
                    }
                }
            }
        }
        
        // Add Campfire in center of ruin
        const cx = rx + Math.floor(rw/2);
        const cy = ry + Math.floor(rh/2);
        if (td[`${cx},${cy}`] && td[`${cx},${cy}`].height >= 0) {
            td[`${cx},${cy}`].overlay = 'campfire';
            td[`${cx},${cy}`].color = COLOR_DIRT;
        }
    }

    return { tileData: td, freeObjects: [], enemies: [], atmosphere: 'day' as Atmosphere };
};

// --- VISION SYSTEM (Bresenham Raycasting) ---
function computeFieldOfView(
    chunks: Record<string, ChunkData>, 
    pieces: GamePieceModel[], 
    atmosphere: Atmosphere
): Set<string> {
    const visibleTiles = new Set<string>();
    const chunk = chunks['0,0'];
    if (!chunk) return visibleTiles;

    const visionRange = VISION_RANGES[atmosphere] || 20;
    
    // 1. Gather Viewers (Players + Light Sources)
    const viewers: { x: number, y: number, r: number, ignoreEnv: boolean }[] = [];

    // Players
    pieces.forEach(p => {
        if (p.type !== 'enemy' && p.status === 'active') {
            viewers.push({ x: p.position.x, y: p.position.y, r: visionRange, ignoreEnv: false });
        }
    });

    // Light Sources (Static Objects in map)
    Object.entries(chunk.tileData).forEach(([key, tile]) => {
        if (tile.overlay && (LIGHT_SOURCES as any)[tile.overlay]) {
            const [lx, ly] = key.split(',').map(Number);
            viewers.push({ x: lx, y: ly, r: (LIGHT_SOURCES as any)[tile.overlay], ignoreEnv: true });
        }
    });

    // 2. Raycast for each viewer
    viewers.forEach(viewer => {
        // Cast rays to the perimeter of the bounding box defined by radius
        for (let x = -viewer.r; x <= viewer.r; x++) {
            for (let y = -viewer.r; y <= viewer.r; y++) {
                // Optimization: Only cast to the edge of the box to cover all angles
                if (Math.abs(x) === viewer.r || Math.abs(y) === viewer.r) {
                    castRay(viewer.x, viewer.y, viewer.x + x, viewer.y + y, viewer.r, chunk.tileData, visibleTiles);
                }
            }
        }
    });

    return visibleTiles;
}

function castRay(x0: number, y0: number, x1: number, y1: number, maxDist: number, tileData: Record<string, TileData>, visibleSet: Set<string>) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;
    
    // Start tile logic
    let startTile = tileData[`${x0},${y0}`];
    let startHeight = startTile ? (startTile.height || 0) : 0;
    
    let accumulatedOpacity = 0.0;

    while (true) {
        // Check Bounds
        if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS) break;
        
        // Distance Check
        const dist = Math.sqrt((cx - x0)**2 + (cy - y0)**2);
        if (dist > maxDist) break;

        const key = `${cx},${cy}`;
        visibleSet.add(key);

        const tile = tileData[key];
        
        // --- OBSTACLE CHECK ---
        if (tile) {
            // 1. Height > Start + 2
            if ((tile.height || 0) > startHeight + 2) {
                accumulatedOpacity += 1.0;
            }

            // 2. Obstacles
            if (tile.overlay) {
                if (tile.overlay.includes('wall') || tile.overlay === 'rock' || tile.overlay === 'house' || tile.overlay === 'tower') {
                    accumulatedOpacity += 1.0;
                } else if (tile.overlay.includes('tree') || tile.overlay.includes('pine') || tile.overlay === 'bush') {
                    accumulatedOpacity += 0.5; // 2 Trees to block
                }
            }
        } else {
             // Empty space usually doesn't block, but let's say off-map does
             accumulatedOpacity += 0.0;
        }

        if (accumulatedOpacity >= 1.0) break; // Line of Sight Blocked

        if (cx === x1 && cy === y1) break;
        
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
    }
}


// --- Main Component ---
export default function App() {
  const [currentLevelId, setCurrentLevelId] = useState(STARTING_LEVEL_ID);
  
  // Board State
  const [pieces, setPieces] = useState<GamePieceModel[]>([...INITIAL_HEROES]);
  const [chunks, setChunks] = useState<Record<string, ChunkData>>({});
  const [activeChunk] = useState<ChunkCoords>({ u: 0, v: 0 });
  const [freeObjects, setFreeObjects] = useState<FreeObject[]>([]);
  
  const [activePieceId, setActivePieceId] = useState('p1');
  const [remainingMoves, setRemainingMoves] = useState(0);
  const [moveSession, setMoveSession] = useState<MoveSession | null>(null);
  
  // Editor State
  const [isPaintMode, setIsPaintMode] = useState(false); 
  const [editorTool, setEditorTool] = useState<'height' | 'terrain' | 'asset' | 'build'>('height');
  const [brushSize, setBrushSize] = useState<1 | 3 | 5>(1); 
  const [voxelMaterial, setVoxelMaterial] = useState('grass');
  const [selectedAsset, setSelectedAsset] = useState('tree-oak');
  const [selectedStructure, setSelectedStructure] = useState('wall-stone');
  const [worldComplexity, setWorldComplexity] = useState(0.0); 
  const [atmosphere, setAtmosphere] = useState<Atmosphere>('day');
  const [revealAll, setRevealAll] = useState(false);
  const [showHeights, setShowHeights] = useState(false);
  const [playerVision, setPlayerVision] = useState<Set<string>>(new Set());
  const [revealedTiles, setRevealedTiles] = useState<Set<string>>(new Set()); // MEMORY OF MAP

  // Load Initial Level
  useEffect(() => {
      const { tileData, atmosphere: genAtmo, freeObjects: genObjs } = generateLevelData(currentLevelId);
      const newChunk = { id: `c_${currentLevelId}`, coords: { u: 0, v: 0 }, tileData, revealedTiles: new Set<string>() };
      // NOTE: We do NOT reveal all tiles by default anymore to support Fog of War
      setChunks({ '0,0': newChunk });
      setAtmosphere(genAtmo);
      setFreeObjects(genObjs);
      setPieces([...INITIAL_HEROES]);
      setRemainingMoves(INITIAL_HEROES[0].maxMoves);
      setRevealedTiles(new Set()); // Reset memory
  }, [currentLevelId]);

  // Recalculate Vision & Update Memory
  useEffect(() => {
      if (!isPaintMode) { // Only calculate vision in play mode
          const vision = computeFieldOfView(chunks, pieces, atmosphere);
          setPlayerVision(vision);
          
          setRevealedTiles(prev => {
              let changed = false;
              vision.forEach(k => {
                  if (!prev.has(k)) changed = true;
              });
              if (!changed) return prev;
              
              const next = new Set(prev);
              vision.forEach(k => next.add(k));
              return next;
          });
      }
  }, [chunks, pieces, atmosphere, isPaintMode]);

  // Movement Pathfinding (BFS)
  const getValidMoves = useCallback((start: Vector2i, maxDist: number) => {
      const costs = new Map<string, number>();
      const queue: { pos: Vector2i, cost: number }[] = [{ pos: start, cost: 0 }];
      costs.set(`${start.x},${start.y}`, 0);

      const chunk = chunks['0,0'];
      if (!chunk) return new Map();

      while (queue.length > 0) {
          queue.sort((a, b) => a.cost - b.cost);
          const current = queue.shift()!;
          if (current.cost >= maxDist) continue;

          const neighbors = getNeighbors(current.pos);
          const currentH = chunk.tileData[`${current.pos.x},${current.pos.y}`]?.height || 0;

          for (const n of neighbors) {
              const key = `${n.x},${n.y}`;
              const tile = chunk.tileData[key];
              const moveCost = calculateMoveCost(currentH, tile, maxDist - current.cost, false, false);
              
              if (moveCost !== Infinity) {
                  const newCost = current.cost + moveCost;
                  if (newCost <= maxDist) {
                      if (!costs.has(key) || newCost < costs.get(key)!) {
                          costs.set(key, newCost);
                          queue.push({ pos: n, cost: newCost });
                      }
                  }
              }
          }
      }
      return costs;
  }, [chunks]);

  const reachableTiles = useMemo(() => {
      if (!moveSession) return new Map<string, number>();
      const p = pieces.find(x => x.id === moveSession.pieceId);
      if (!p) return new Map();
      return getValidMoves(p.position, remainingMoves);
  }, [moveSession, pieces, remainingMoves, getValidMoves]);


  const handlePieceClick = useCallback((id: string) => {
    if (isPaintMode) return;
    if (id === activePieceId) {
        setMoveSession(prev => prev ? null : { 
            pieceId: id, 
            currentPath: [`${pieces.find(p=>p.id===id)?.position.x},${pieces.find(p=>p.id===id)?.position.y}`], 
            selectedNeighborIndex: 0, 
            isWheelActive: false 
        });
    }
  }, [activePieceId, isPaintMode, pieces]);

  const handleAssetMove = useCallback((from: Vector2i, to: Vector2i) => {
      setChunks(prev => {
          const chunk = prev['0,0'];
          if (!chunk) return prev;
          
          const newTileData = { ...chunk.tileData };
          const fromKey = `${from.x},${from.y}`;
          const toKey = `${to.x},${to.y}`;
          const sourceTile = newTileData[fromKey];
          
          if (sourceTile && sourceTile.overlay) {
              if (!newTileData[toKey]) newTileData[toKey] = { color: COLOR_GRASS, height: 0, isBlocked: false };
              newTileData[toKey] = { ...newTileData[toKey], overlay: sourceTile.overlay, isBlocked: sourceTile.isBlocked };
              newTileData[fromKey] = { ...sourceTile, overlay: undefined, isBlocked: false };
          }

          return { ...prev, '0,0': { ...chunk, tileData: newTileData } };
      });
  }, []);

  const handleTileClick = useCallback((pos: Vector2i, worldPoint: THREE.Vector3, isRightClick: boolean = false) => {
    const key = `${pos.x},${pos.y}`;
    
    // Editor Logic
    if (isPaintMode) {
        setChunks(prev => {
            const chunk = prev['0,0'];
            if (!chunk) return prev;
            
            const newTileData = { ...chunk.tileData };
            
            const modifyTile = (gx: number, gy: number, operation: (t: TileData) => TileData) => {
                 const k = `${gx},${gy}`;
                 if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return;
                 const existing = newTileData[k] || { color: COLOR_GRASS, height: 0, isBlocked: false };
                 newTileData[k] = operation(existing);
            };

            const range = Math.floor(brushSize / 2);
            
            for(let dx = -range; dx <= range; dx++) {
                for(let dy = -range; dy <= range; dy++) {
                    modifyTile(pos.x + dx, pos.y + dy, (t) => {
                        let newT = { ...t };
                        
                        if (editorTool === 'height') {
                             const delta = isRightClick ? -1 : 1;
                             newT.height = Math.max(-MAP_DEPTH, Math.min(20, (t.height || 0) + delta));
                        } else if (editorTool === 'asset') {
                             if (dx === 0 && dy === 0) { 
                                 if (selectedAsset === 'clear') {
                                     newT.overlay = undefined;
                                     newT.isBlocked = false;
                                 } else {
                                     newT.overlay = selectedAsset;
                                     newT.isBlocked = (selectedAsset.includes('wall') || selectedAsset === 'tower' || selectedAsset === 'house');
                                 }
                             }
                        } else if (editorTool === 'build') {
                             if (dx === 0 && dy === 0) {
                                  if (selectedStructure === 'clear') {
                                      newT.overlay = undefined;
                                      newT.isBlocked = false;
                                  } else {
                                      // STACKING LOGIC:
                                      // If the tile already has this wall type, treat it as "stacking" by raising the ground
                                      // and keeping the wall on top.
                                      if (t.overlay === selectedStructure) {
                                          newT.height = (t.height || 0) + 1;
                                      }
                                      newT.overlay = selectedStructure;
                                      newT.isBlocked = true;
                                  }
                             }
                        } else if (editorTool === 'terrain') {
                             const matDef = VOXEL_MATERIALS.find(m => m.id === voxelMaterial);
                             if (matDef) newT.color = matDef.color;
                        }
                        return newT;
                    });
                }
            }
            return { ...prev, '0,0': { ...chunk, tileData: newTileData } };
        });
        return;
    }

    // Gameplay Move Logic
    if (moveSession && moveSession.pieceId === activePieceId) {
        if (reachableTiles.has(key)) {
            setPieces(prev => prev.map(x => x.id === activePieceId ? { ...x, position: pos } : x));
            setRemainingMoves(prev => prev - (reachableTiles.get(key) || 1));
            setMoveSession(prev => prev ? { ...prev, currentPath: [`${pos.x},${pos.y}`] } : null);
        } else if (pieces.some(p => p.id === activePieceId && p.position.x === pos.x && p.position.y === pos.y)) {
             setMoveSession(null);
        }
    }
  }, [moveSession, activePieceId, pieces, reachableTiles, isPaintMode, editorTool, selectedAsset, voxelMaterial, brushSize, selectedStructure]);

  return (
    <div className="w-full h-screen relative bg-neutral-900" onContextMenu={(e) => e.preventDefault()}>
      <GridBoard 
         pieces={pieces} 
         chunks={chunks} 
         activeChunk={activeChunk} 
         onPieceClick={handlePieceClick} 
         onTileClick={handleTileClick} 
         isPaintMode={isPaintMode} 
         activePieceId={activePieceId} 
         moveSession={moveSession} 
         setMoveSession={setMoveSession} 
         remainingMoves={remainingMoves} 
         revealAll={revealAll} // For "Revealing" state, separate from "Global Reveal"
         atmosphere={atmosphere} 
         showHeights={showHeights} 
         freeObjects={freeObjects} 
         playerVision={playerVision} 
         revealedTiles={revealedTiles} // PASS MEMORY
         isGlobalReveal={revealAll}   // PASS TOGGLE
         reachableTiles={reachableTiles} 
         worldComplexity={worldComplexity}
         voxelMaterial={editorTool === 'terrain' ? voxelMaterial : 'none'}
         gameLevelId={currentLevelId}
         onAssetMove={handleAssetMove}
      />
      
      {/* HUD: VOXEL ARCHITECT */}
      <div className="absolute top-4 left-4 bg-neutral-900/95 p-4 rounded-xl border border-neutral-700 shadow-2xl flex flex-col gap-4 text-white w-80 backdrop-blur-sm select-none max-h-[90vh] overflow-y-auto scrollbar-hide">
           <div className="flex items-center gap-2 border-b border-neutral-700 pb-2 sticky top-0 bg-neutral-900/95 z-10">
               <Box size={20} className="text-emerald-400" />
               <h2 className="font-bold">VOXEL ARCHITECT</h2>
           </div>

           <button 
               onClick={() => setIsPaintMode(!isPaintMode)}
               className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${isPaintMode ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
           >
               {isPaintMode ? <PenTool size={16} /> : <MousePointer2 size={16} />}
               {isPaintMode ? 'MODE: EDITING' : 'MODE: PLAYING'}
           </button>

           {/* DEV MENU: ENVIRONMENT */}
           <div className="p-2 bg-neutral-800 rounded-lg flex flex-col gap-2">
               <span className="text-[10px] font-bold text-neutral-400 uppercase">Environment Dev</span>
               <div className="grid grid-cols-6 gap-1">
                   <button onClick={() => setAtmosphere('day')} className={`p-1 rounded ${atmosphere==='day'?'bg-yellow-600':'bg-neutral-700'}`} title="Day"><Sun size={14}/></button>
                   <button onClick={() => setAtmosphere('night')} className={`p-1 rounded ${atmosphere==='night'?'bg-indigo-600':'bg-neutral-700'}`} title="Night"><Moon size={14}/></button>
                   <button onClick={() => setAtmosphere('stormy')} className={`p-1 rounded ${atmosphere==='stormy'?'bg-slate-600':'bg-neutral-700'}`} title="Storm"><CloudRain size={14}/></button>
                   <button onClick={() => setAtmosphere('snow')} className={`p-1 rounded ${atmosphere==='snow'?'bg-sky-600':'bg-neutral-700'}`} title="Snow"><Snowflake size={14}/></button>
                   <button onClick={() => setAtmosphere('darkness')} className={`p-1 rounded ${atmosphere==='darkness'?'bg-purple-900':'bg-neutral-700'}`} title="Void"><Ghost size={14}/></button>
                   <button onClick={() => setRevealAll(!revealAll)} className={`p-1 rounded ${revealAll?'bg-green-600':'bg-neutral-700'}`} title="Reveal All"><Eye size={14}/></button>
               </div>
           </div>

           {isPaintMode && (
               <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
                   
                   <div className="flex p-1 bg-neutral-800 rounded-lg">
                       <button onClick={() => setEditorTool('height')} className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${editorTool === 'height' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}><ChevronUp size={12} /> HEIGHT</button>
                       <button onClick={() => setEditorTool('terrain')} className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${editorTool === 'terrain' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}><PaintBucket size={12} /> PAINT</button>
                       <button onClick={() => setEditorTool('asset')} className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${editorTool === 'asset' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}><Trees size={12} /> NATURE</button>
                       <button onClick={() => setEditorTool('build')} className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${editorTool === 'build' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}><Hammer size={12} /> BUILD</button>
                   </div>
                   
                   {/* Tool Options */}
                   {(editorTool === 'height' || editorTool === 'terrain') && (
                       <div className="flex items-center justify-between text-xs text-neutral-400">
                           <span>Brush Size</span>
                           <div className="flex bg-neutral-800 rounded">
                               <button onClick={() => setBrushSize(1)} className={`px-3 py-1 rounded ${brushSize === 1 ? 'bg-emerald-600 text-white' : 'hover:text-white'}`}>1x</button>
                               <button onClick={() => setBrushSize(3)} className={`px-3 py-1 rounded ${brushSize === 3 ? 'bg-emerald-600 text-white' : 'hover:text-white'}`}>3x</button>
                               <button onClick={() => setBrushSize(5)} className={`px-3 py-1 rounded ${brushSize === 5 ? 'bg-emerald-600 text-white' : 'hover:text-white'}`}>5x</button>
                           </div>
                       </div>
                   )}

                   {/* TERRAIN PALETTE */}
                   {editorTool === 'terrain' && (
                       <div className="space-y-2">
                           <label className="text-[10px] font-bold text-neutral-400 uppercase">Material Paint</label>
                           <div className="grid grid-cols-4 gap-2">
                               {VOXEL_MATERIALS.map(m => (
                                   <button 
                                      key={m.id}
                                      onClick={() => setVoxelMaterial(m.id)}
                                      className={`aspect-square rounded-md border-2 flex items-center justify-center relative group transition-transform active:scale-95 ${voxelMaterial === m.id ? 'border-white scale-105 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                      style={{ backgroundColor: m.color }}
                                      title={m.label}
                                   >
                                       {voxelMaterial === m.id && <div className="absolute inset-0 border-2 border-black/20 rounded-sm"></div>}
                                   </button>
                               ))}
                           </div>
                       </div>
                   )}

                   {/* ASSET PALETTE */}
                   {editorTool === 'asset' && (
                       <div className="space-y-2">
                           <label className="text-[10px] font-bold text-neutral-400 uppercase">Nature Objects</label>
                           <div className="grid grid-cols-4 gap-2">
                               {ASSET_PALETTE.map(a => (
                                   <button 
                                      key={a.id}
                                      onClick={() => setSelectedAsset(a.id)}
                                      className={`aspect-square rounded-md border flex flex-col items-center justify-center gap-1 transition-all ${selectedAsset === a.id ? 'bg-neutral-700 border-white text-emerald-400 scale-105 shadow-lg' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750 hover:text-emerald-300'}`}
                                      title={a.label}
                                   >
                                       {a.icon}
                                   </button>
                               ))}
                           </div>
                       </div>
                   )}
                   
                   {/* BUILD PALETTE */}
                   {editorTool === 'build' && (
                       <div className="space-y-2">
                           <label className="text-[10px] font-bold text-neutral-400 uppercase">Structures</label>
                           <div className="grid grid-cols-3 gap-2">
                               {STRUCTURE_PALETTE.map(a => (
                                   <button 
                                      key={a.id}
                                      onClick={() => setSelectedStructure(a.id)}
                                      className={`aspect-square rounded-md border flex flex-col items-center justify-center gap-1 transition-all ${selectedStructure === a.id ? 'bg-neutral-700 border-white text-emerald-400 scale-105 shadow-lg' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750 hover:text-emerald-300'}`}
                                      title={a.label}
                                   >
                                       {a.icon}
                                       <span className="text-[9px] font-semibold">{a.label.split(' ')[0]}</span>
                                   </button>
                               ))}
                               <button 
                                  onClick={() => setSelectedStructure('clear')}
                                  className={`aspect-square rounded-md border flex flex-col items-center justify-center gap-1 transition-all ${selectedStructure === 'clear' ? 'bg-neutral-700 border-white text-emerald-400 scale-105 shadow-lg' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750 hover:text-emerald-300'}`}
                                  title="Clear"
                               >
                                   <Trash2 size={16} color="#ef4444" />
                                   <span className="text-[9px] font-semibold">Clear</span>
                               </button>
                           </div>
                           <p className="text-[9px] text-neutral-500">* Click on existing wall to stack higher</p>
                       </div>
                   )}
               </div>
           )}
      </div>

      {/* GAME STATS */}
      {!isPaintMode && (
          <div className="absolute bottom-8 right-8 flex flex-col gap-2 items-end">
              <div className="bg-neutral-900/90 px-6 py-3 rounded-xl border border-neutral-700 flex items-center gap-4 text-white shadow-2xl">
                 <div className="text-right">
                     <div className="text-xs text-neutral-400 font-bold">MOVES LEFT</div>
                     <div className="text-2xl font-mono text-emerald-400">{remainingMoves}</div>
                 </div>
                 <button onClick={() => { 
                     const nextId = activePieceId === 'p1' ? 'p2' : 'p1';
                     setActivePieceId(nextId); 
                     const nextPiece = pieces.find(p => p.id === nextId);
                     setRemainingMoves(nextPiece?.maxMoves || 4);
                     setMoveSession(null); 
                 }} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold">End Turn</button>
              </div>
          </div>
      )}
    </div>
  );
}
