
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { VOXEL_SCALE, MINI_VOXEL_SCALE } from '../constants';
import { ThreeEvent } from '@react-three/fiber';

// --- CONFIG ---
const HIGH_DEF_SCALE = 0.05; // 20x20x20 voxels per world unit (Ultra High Density)

// --- PSEUDO RANDOM HELPER ---
function mulberry32(a: number) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

interface AssetProps {
    position: [number, number, number];
    seed: number;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    variant?: number; // Optional variant override
    opacity?: number;
    grayscale?: boolean;
}

interface Voxel {
    x: number;
    y: number;
    z: number;
    color: string;
}

// --- HELPER: VOXEL UTILS ---

function addVoxelSphere(
    voxels: Voxel[], 
    cx: number, cy: number, cz: number, 
    rx: number, ry: number, rz: number, 
    colors: string[], 
    rng: () => number,
    prob: number = 1.0,
    snow: boolean = false
) {
    const minX = Math.floor(cx - rx);
    const maxX = Math.ceil(cx + rx);
    const minY = Math.floor(cy - ry);
    const maxY = Math.ceil(cy + ry);
    const minZ = Math.floor(cz - rz);
    const maxZ = Math.ceil(cz + rz);

    for(let x = minX; x <= maxX; x++) {
        for(let y = minY; y <= maxY; y++) {
            for(let z = minZ; z <= maxZ; z++) {
                // Ellipsoid Check
                const dx = (x - cx) / rx;
                const dy = (y - cy) / ry;
                const dz = (z - cz) / rz;
                const distSq = dx*dx + dy*dy + dz*dz;
                
                if (distSq <= 1.0) {
                     if (rng() > prob) continue;
                     
                     let col = colors[Math.floor(rng() * colors.length)];
                     // Snow Logic: If at top of sphere
                     if (snow && dy > 0.5) { // Top half
                         if (rng() > 0.3) col = '#f8fafc';
                     }
                     voxels.push({x, y, z, color: col});
                }
            }
        }
    }
}

// --- HIGH PERFORMANCE MINI-VOXEL MODEL ---
const VoxelModel: React.FC<{ 
    voxels: Voxel[]; 
    scale?: number; 
    position: [number, number, number];
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
    opacity?: number;
    grayscale?: boolean;
}> = React.memo(({ voxels, scale = MINI_VOXEL_SCALE, position, onClick, opacity = 1.0, grayscale = false }) => { 
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    useLayoutEffect(() => {
        if (!meshRef.current) return;
        
        // Deduplicate voxels before rendering to save instances
        const unique = new Map<string, string>();
        voxels.forEach(v => {
            unique.set(`${v.x},${v.y},${v.z}`, v.color);
        });

        const count = unique.size;
        meshRef.current.count = count;

        const tempObj = new THREE.Object3D();
        const tempColor = new THREE.Color();
        let i = 0;

        unique.forEach((colorHex, key) => {
            const [x, y, z] = key.split(',').map(Number);
            tempObj.position.set(x * scale, y * scale, z * scale);
            tempObj.scale.set(scale, scale, scale);
            tempObj.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObj.matrix);
            
            tempColor.set(colorHex);
            if (grayscale) tempColor.multiplyScalar(0.25);
            meshRef.current!.setColorAt(i, tempColor);
            i++;
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [voxels, scale, grayscale]);

    return (
        <group position={position} onClick={onClick}>
            <instancedMesh 
                ref={meshRef} 
                args={[undefined, undefined, voxels.length]} 
                castShadow 
                receiveShadow
            >
                <boxGeometry args={[1.05, 1.05, 1.05]} />
                <meshStandardMaterial roughness={0.9} transparent={opacity < 1.0} opacity={opacity} />
            </instancedMesh>
        </group>
    );
});
VoxelModel.displayName = 'VoxelModel';

// --- WALL GENERATORS (Full Box Fill for No Spacing) ---

export const VoxelWallStone: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const colors = ['#57534e', '#44403c', '#78716c', '#292524'];
        const mortar = '#1c1917';

        // 20x20x20 block (Full -10 to 10 range)
        for(let y=0; y<20; y++) {
            for(let x=-10; x<10; x++) {
                for(let z=-10; z<10; z++) {
                    // No bounds check - fills entire cell
                    
                    // Stone Pattern
                    const by = Math.floor(y / 5);
                    const bx = Math.floor((x + 10 + (by%2)*3) / 6);
                    const bz = Math.floor((z + 10) / 6);

                    // Mortar Lines
                    const edgeX = (x + 10 + (by%2)*3) % 6;
                    const edgeY = y % 5;
                    const edgeZ = (z + 10) % 6;
                    
                    // Only texture visible faces + top to save GPU, but fill completely
                    const isEdge = edgeX===0 || edgeY===0; 

                    if (isEdge) {
                        v.push({x,y,z,color: mortar});
                    } else {
                        const colIdx = (bx + by + bz + Math.floor(rng()*2)) % colors.length;
                        v.push({x,y,z,color: colors[colIdx]});
                    }
                }
            }
        }
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

export const VoxelWallBrick: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const colors = ['#991b1b', '#7f1d1d', '#b91c1c', '#9f1239'];
        const mortar = '#d6d3d1';

        for(let y=0; y<20; y++) {
            for(let x=-10; x<10; x++) {
                for(let z=-10; z<10; z++) {
                    const row = Math.floor(y / 4);
                    const offset = (row % 2) * 4;
                    const bx = Math.floor((x + 10 + offset) / 8);
                    const bz = Math.floor((z + 10 + offset) / 8); 

                    const isMortarY = y % 4 === 0;
                    const isMortarX = (x + 10 + offset) % 8 === 0;
                    
                    if (isMortarY || isMortarX) {
                        v.push({x,y,z,color: mortar});
                    } else {
                         const colIdx = (bx + row + bz) % colors.length;
                         const noisy = rng() > 0.8 ? colors[(colIdx+1)%colors.length] : colors[colIdx];
                         v.push({x,y,z,color: noisy});
                    }
                }
            }
        }
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

export const VoxelWallWood: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const woodDark = '#3f2e26'; 
        const woodLight = '#78350f';
        const woodMed = '#5d4037';
        
        for(let y=0; y<20; y++) {
            for(let x=-10; x<10; x++) {
                for(let z=-10; z<10; z++) {
                    const isFrameY = y < 2 || y > 17;
                    const isFrameX = x < -8 || x > 8; 
                    const isFrameZ = z < -8 || z > 8;

                    if (isFrameY || (isFrameX && isFrameZ)) {
                        v.push({x,y,z,color: woodDark});
                    } else {
                        const plankId = Math.floor((x + 10) / 4);
                        const isGap = (x + 10) % 4 === 0;
                        if (isGap) {
                             v.push({x,y,z,color: woodDark});
                        } else {
                             const c = (plankId + Math.floor(z/5)) % 2 === 0 ? woodLight : woodMed;
                             v.push({x,y,z,color: c});
                        }
                    }
                }
            }
        }
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

// --- LIGHT SOURCES ---

export const VoxelCampfire: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const colors = ['#57534e', '#44403c', '#292524'];
        
        // Stones
        addVoxelSphere(v, 0, 1, 0, 8, 3, 8, colors, rng);
        
        // Logs
        for(let i=0; i<3; i++) {
            const angle = i * (Math.PI*2/3);
            const lx = Math.cos(angle)*4;
            const lz = Math.sin(angle)*4;
            addVoxelSphere(v, lx, 4, lz, 2, 6, 2, ['#3f2e26'], rng);
        }

        // Flame (Simple)
        addVoxelSphere(v, 0, 6, 0, 3, 5, 3, ['#ef4444', '#f97316', '#fbbf24'], rng);

        return v;
    }, [seed]);
    
    return (
        <group>
             <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />
             {!grayscale && <pointLight position={[position[0], position[1]+1, position[2]]} intensity={2} distance={8} color="#f97316" castShadow />}
        </group>
    );
};

export const VoxelLantern: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const v: Voxel[] = [];
        const metal = '#1f2937';
        const glass = '#fbbf24';
        
        // Base
        for(let x=-2; x<=2; x++) for(let z=-2; z<=2; z++) v.push({x,y:0,z,color:metal});
        // Frame
        for(let y=1; y<8; y++) {
             v.push({x:-2, y, z:-2, color:metal});
             v.push({x:2, y, z:-2, color:metal});
             v.push({x:-2, y, z:2, color:metal});
             v.push({x:2, y, z:2, color:metal});
        }
        // Top
        for(let x=-2; x<=2; x++) for(let z=-2; z<=2; z++) v.push({x,y:8,z,color:metal});
        
        // Glow Center
        for(let x=-1; x<=1; x++) for(let y=1; y<7; y++) for(let z=-1; z<=1; z++) v.push({x,y,z,color:glass});

        return v;
    }, [seed]);

    return (
        <group>
             <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />
             {!grayscale && <pointLight position={[position[0], position[1]+0.5, position[2]]} intensity={2} distance={12} color="#fbbf24" castShadow />}
        </group>
    );
};

// --- GENERATORS ---

const GenericVoxelTree: React.FC<AssetProps & { type: number }> = ({ position, seed, onClick, type, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        
        // Palettes
        let woodColor = '#3e2723';
        let leafColors = ['#1a472a', '#2d5a27', '#14532d'];
        let vineColor = '#3f6212';
        let hasVines = false;
        let vineLength = 0;

        if (type === 1) { // Autumn
            woodColor = '#4a3b32';
            leafColors = ['#eab308', '#ca8a04', '#d97706', '#b45309']; // Yellows/Oranges
        } else if (type === 2) { // Wisteria
            woodColor = '#27272a'; // Dark/Black wood
            leafColors = ['#4f46e5', '#4338ca', '#3730a3', '#312e81']; // Indigo/Blue/Purple
            vineColor = '#4f46e5';
            hasVines = true;
            vineLength = 15;
        }

        const height = 40 + Math.floor(rng() * 20);
        let tx = 0, tz = 0;
        let tr = type === 2 ? 4 : 5; 
        
        const branchPoints: {x:number, y:number, z:number}[] = [];

        // TRUNK
        for(let y=0; y<height; y++) {
            tx += (rng() - 0.5) * 0.8;
            tz += (rng() - 0.5) * 0.8;
            const currentR = Math.max(1.5, tr * (1 - y/(height*1.2)));
            const flair = y < 5 ? (5-y) : 0;
            
            for(let x = -Math.ceil(currentR+flair); x <= Math.ceil(currentR+flair); x++) {
                for(let z = -Math.ceil(currentR+flair); z <= Math.ceil(currentR+flair); z++) {
                    if (x*x + z*z <= (currentR+flair)*(currentR+flair)) {
                        v.push({x: Math.round(tx+x), y, z: Math.round(tz+z), color: woodColor});
                    }
                }
            }

            if (y > 15 && y < height - 5 && rng() > 0.85) {
                branchPoints.push({x: tx, y, z: tz});
            }
        }
        branchPoints.push({x: tx, y: height, z: tz});

        // BRANCHES & LEAVES
        branchPoints.forEach((bp, i) => {
             const angle = rng() * Math.PI * 2;
             const upForce = (i / branchPoints.length); 
             const len = 15 + rng() * 15;
             
             let bx = bp.x, by = bp.y, bz = bp.z;
             const vx = Math.cos(angle);
             const vz = Math.sin(angle);
             const vy = 0.3 + upForce * 0.5;

             // Draw Branch
             for(let s=0; s<len; s++) {
                 bx += vx; by += vy; bz += vz;
                 const thick = Math.max(1, 2 - s/len*2);
                 for(let lx=-thick; lx<=thick; lx++){
                     for(let ly=-thick; ly<=thick; ly++){
                         for(let lz=-thick; lz<=thick; lz++){
                             v.push({x:Math.round(bx+lx), y:Math.round(by+ly), z:Math.round(bz+lz), color: woodColor});
                         }
                     }
                 }
             }
             
             // Leaf Cluster
             const r = 10 + rng() * 6;
             const ry = type === 2 ? r * 0.8 : r * 0.6; 
             addVoxelSphere(v, bx, by, bz, r, ry, r, leafColors, rng, 0.7);

             // Vines
             if (hasVines) {
                 const numVines = 5 + rng() * 5;
                 for(let k=0; k<numVines; k++) {
                     const vx = bx + (rng()-0.5) * r * 1.5;
                     const vz = bz + (rng()-0.5) * r * 1.5;
                     const startY = by;
                     const len = 10 + rng() * vineLength;
                     for(let vy=0; vy<len; vy++) {
                         if (rng() > 0.2) { 
                             v.push({x: Math.round(vx), y: Math.round(startY - vy), z: Math.round(vz), color: vineColor});
                         }
                     }
                 }
             }
        });

        return v;
    }, [seed, type]);

    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

const GenericVoxelConifer: React.FC<AssetProps & { snowy: boolean }> = ({ position, seed, onClick, snowy, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        
        const woodColor = '#27201d';
        const leafColors = ['#0f3d2e', '#16503e', '#14532d'];
        
        const height = 50 + Math.floor(rng() * 20); 
        
        // Trunk
        for(let y=0; y<height; y++) {
            const r = Math.max(1, 3 * (1 - y/height));
            for(let x=-Math.ceil(r); x<=Math.ceil(r); x++) {
                for(let z=-Math.ceil(r); z<=Math.ceil(r); z++) {
                    if (x*x+z*z <= r*r) v.push({x, y, z, color: woodColor});
                }
            }
        }
        
        // Branches
        let y = 8;
        let maxRad = 18;
        while(y < height - 2) {
             const progress = y / height;
             const layerRad = maxRad * (1 - progress);
             const numBranches = 5 + Math.floor(layerRad / 2);
             
             for(let b=0; b<numBranches; b++) {
                 const angle = (b/numBranches) * Math.PI * 2 + (y*0.1);
                 let bx = 0, by = y, bz = 0;
                 const vx = Math.cos(angle);
                 const vz = Math.sin(angle);
                 
                 for(let d=1; d<layerRad; d++) {
                     bx += vx; bz += vz;
                     by -= 0.3; // dip
                     
                     const blobR = 1 + (d/layerRad) * 2;
                     for(let lx=-blobR; lx<=blobR; lx++) {
                         for(let ly=-blobR; ly<=blobR; ly++) {
                             for(let lz=-blobR; lz<=blobR; lz++) {
                                 if (Math.abs(lx)+Math.abs(ly)+Math.abs(lz) <= blobR + rng()) {
                                     let col = leafColors[Math.floor(rng()*leafColors.length)];
                                     if (snowy && ly >= blobR-1 && rng() > 0.4) col = '#f1f5f9';
                                     v.push({x:Math.round(bx+lx), y:Math.round(by+ly), z:Math.round(bz+lz), color:col});
                                 }
                             }
                         }
                     }
                 }
             }
             y += 6 + rng()*2;
        }
        
        // Tip
        for(let i=0; i<5; i++) {
             v.push({x:0, y: height+i, z:0, color: snowy && i>2 ? '#f1f5f9' : leafColors[0]});
        }
        return v;
    }, [seed, snowy]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

const GenericVoxelDead: React.FC<AssetProps & { type: 'tree' | 'stump' }> = ({ position, seed, onClick, type, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const woodColor = '#525252';
        const woodLight = '#737373';
        
        const height = type === 'stump' ? 10 : (40 + Math.floor(rng() * 15));
        
        // Recursive Branching
        const growBranch = (x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number, len: number, rad: number) => {
            if (len < 2 || rad < 0.5) return;
            let cx = x, cy = y, cz = z;
            for(let i=0; i<len; i++) {
                cx += dirX; cy += dirY; cz += dirZ;
                dirX += (rng()-0.5) * 0.1;
                dirZ += (rng()-0.5) * 0.1;
                for(let bx=-Math.ceil(rad); bx<=Math.ceil(rad); bx++) {
                    for(let by=-Math.ceil(rad); by<=Math.ceil(rad); by++) {
                        for(let bz=-Math.ceil(rad); bz<=Math.ceil(rad); bz++) {
                             if (bx*bx + by*by + bz*bz <= rad*rad) {
                                 v.push({x:Math.round(cx+bx), y:Math.round(cy+by), z:Math.round(cz+bz), color: rng()>0.7 ? woodLight : woodColor});
                             }
                        }
                    }
                }
            }
            if (type === 'tree') {
                const numForks = Math.floor(rng() * 2) + 1;
                for(let k=0; k<numForks; k++) {
                    const rotX = dirX + (rng()-0.5);
                    const rotY = dirY + (rng()-0.5);
                    const rotZ = dirZ + (rng()-0.5);
                    const mag = Math.sqrt(rotX*rotX + rotY*rotY + rotZ*rotZ);
                    growBranch(cx, cy, cz, rotX/mag, rotY/mag, rotZ/mag, len * 0.6, rad * 0.7);
                }
            }
        };
        
        growBranch(0, 0, 0, 0, 1, 0, height/2, 4);

        if (type === 'stump') {
             // Jagged Top
             for(let x=-4; x<=4; x++) {
                 for(let z=-4; z<=4; z++) {
                     if (rng() > 0.5) v.push({x, y: height, z, color: woodLight});
                 }
             }
        }

        return v;
    }, [seed, type]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

// --- SPECIFIC EXPORTS ---

export const VoxelTreeOak: React.FC<AssetProps> = (p) => <GenericVoxelTree {...p} type={0} />;
export const VoxelTreeAutumn: React.FC<AssetProps> = (p) => <GenericVoxelTree {...p} type={1} />;
export const VoxelTreeWisteria: React.FC<AssetProps> = (p) => <GenericVoxelTree {...p} type={2} />;

export const VoxelPine: React.FC<AssetProps> = (p) => <GenericVoxelConifer {...p} snowy={false} />;
export const VoxelPineSnow: React.FC<AssetProps> = (p) => <GenericVoxelConifer {...p} snowy={true} />;

export const VoxelDeadTree: React.FC<AssetProps> = (p) => <GenericVoxelDead {...p} type="tree" />;
export const VoxelStump: React.FC<AssetProps> = (p) => <GenericVoxelDead {...p} type="stump" />;

export const VoxelRock: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const colors = ['#57534e', '#44403c', '#78716c'];
        addVoxelSphere(v, 0, 0, 0, 14, 10, 14, colors, rng);
        addVoxelSphere(v, 8, -2, 6, 10, 8, 10, colors, rng);
        addVoxelSphere(v, -5, 4, -4, 8, 12, 8, colors, rng);
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

export const VoxelBush: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const rng = mulberry32(seed);
        const v: Voxel[] = [];
        const colors = ['#16a34a', '#15803d', '#4ade80'];
        addVoxelSphere(v, 0, 0, 0, 12, 10, 12, colors, rng);
        addVoxelSphere(v, 6, 2, 6, 8, 8, 8, colors, rng);
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

export const VoxelHouse: React.FC<AssetProps> = ({ position, seed, onClick, opacity, grayscale }) => {
    const voxels = useMemo(() => {
        const v: Voxel[] = [];
        const wall = '#e5e5e5';
        const roof = '#b91c1c';
        const w = 30;
        const h = 40;
        for(let x=-w; x<=w; x+=2) { 
            for(let z=-w; z<=w; z+=2) {
                for(let y=0; y<h; y+=2) {
                     if (Math.abs(x)>=w-2 || Math.abs(z)>=w-2) {
                         v.push({x,y,z,color:wall});
                     }
                }
                const roofH = 20;
                for(let ry=0; ry<roofH; ry+=2) {
                    if (Math.abs(x) <= w - ry && Math.abs(z) <= w) {
                         v.push({x, y: h+ry, z, color: roof});
                    }
                }
            }
        }
        return v;
    }, [seed]);
    return <VoxelModel voxels={voxels} scale={HIGH_DEF_SCALE} position={position} onClick={onClick} opacity={opacity} grayscale={grayscale} />;
};

export const VoxelTower: React.FC<AssetProps> = VoxelHouse; 
export const VoxelWall: React.FC<AssetProps> = VoxelBush; 
export const VoxelTorch = VoxelCampfire;
export const VoxelMountain = VoxelRock;
