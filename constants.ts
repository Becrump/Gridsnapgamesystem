
export const GRID_COLS = 200;
export const GRID_ROWS = 200;
export const TILE_SIZE_PX = 60; 
export const BOARD_PADDING = 0;

// World Dimensions
export const WORLD_WIDTH = 200;
export const WORLD_HEIGHT = 200;

// Square Metrics (Replaces Hex)
export const TILE_SIZE = 1.0; 
export const COL_WIDTH = TILE_SIZE; 
export const ROW_HEIGHT = TILE_SIZE;

// VOXEL METRICS
export const VOXEL_SCALE = 1.0; // 1:1 Mapping: 1 Voxel = 1 Tile
export const MINI_VOXEL_SCALE = 0.2; // 5x5x5 resolution for detailed objects
export const CHUNK_SIZE = 32;   
export const MAP_DEPTH = 10; // How deep the default ground goes

// Colors
export const TILE_COLOR_DEFAULT = '#374151'; 
export const TILE_COLOR_VALID = '#10b981';   
export const TILE_COLOR_INVALID = '#111827'; 

// Biome Colors
export const COLOR_WATER_DEEP = '#172554'; 
export const COLOR_WATER_SHALLOW = '#3b82f6';
export const COLOR_SAND = '#d97706'; 
export const COLOR_GRASS = '#15803d';
export const COLOR_DIRT = '#78350f';
export const COLOR_STONE = '#4b5563'; 
export const COLOR_SNOW = '#f8fafc'; 
export const COLOR_ICE = '#93c5fd'; 

// Fantasy Biome Colors
export const COLOR_ASH = '#262626'; 
export const COLOR_LAVA = '#ef4444'; 
export const COLOR_SWAMP = '#3f6212'; 
export const COLOR_ARCANE = '#4c1d95'; 
export const COLOR_WOOD = '#5d4037';
export const COLOR_GOLD = '#fbbf24';

// CENTRALIZED PALETTE FOR VOXEL ENGINE
// The index here corresponds to the material ID in VoxelWorld
export const VOXEL_PALETTE = [
    COLOR_GRASS,      // 0
    COLOR_DIRT,       // 1
    COLOR_STONE,      // 2
    COLOR_WOOD,       // 3
    COLOR_WATER_DEEP, // 4
    COLOR_LAVA,       // 5
    COLOR_SNOW,       // 6
    COLOR_SAND,       // 7
    '#111111'         // 8 (Bedrock)
];

export const ANIMATION_DURATION_MS = 200;

// Terrain Metrics
export const BASE_HEIGHT = 0.5; // Adjusted for 1.0 scale
export const ELEVATION_STEP = 1.0; // 1 Voxel Step
