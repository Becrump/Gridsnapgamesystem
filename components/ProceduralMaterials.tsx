
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// -- GLSL NOISE FUNCTIONS (Kept for other potential uses) --
export const noiseGLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
        value += amplitude * snoise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
`;

export const ProceduralMaterial: React.FC<{ color: string, type: 'grass'|'dirt'|'sand'|'magma'|'magma-fast'|'ice'|'snow'|'standard'|'stone'|'water', opacity?: number }> = ({ color, type, opacity = 1.0 }) => {
    if (type === 'grass') return <GrassMaterial color={color} opacity={opacity} />;
    if (type === 'water') return <WaterMaterial color={color} opacity={opacity} />;
    if (type === 'dirt') return <DirtMaterial color={color} opacity={opacity} />;
    if (type === 'stone') return <StoneMaterial color={color} opacity={opacity} />;
    if (type === 'sand') return <SandMaterial color={color} opacity={opacity} />;
    if (type === 'magma') return <MagmaMaterial color={color} opacity={opacity} />;
    if (type === 'magma-fast') return <MagmaMaterial color={color} opacity={opacity} />;
    
    // Default fallback
    return <meshStandardMaterial color={color} roughness={type==='ice'?0.1:0.8} metalness={type==='ice'?0.3:0} transparent={opacity < 1.0} opacity={opacity} />;
};

const GrassMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 1.0 }) => (
    <meshStandardMaterial color={color} transparent={opacity < 1.0} opacity={opacity} roughness={0.8} />
);

const DirtMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 1.0 }) => (
    <meshStandardMaterial color={color} transparent={opacity < 1.0} opacity={opacity} roughness={1.0} />
);

const StoneMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 1.0 }) => (
    <meshStandardMaterial color={color} transparent={opacity < 1.0} opacity={opacity} roughness={0.9} />
);

const SandMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 1.0 }) => (
    <meshStandardMaterial color={color} transparent={opacity < 1.0} opacity={opacity} roughness={1.0} />
);

// --- SAFE MATERIALS FOR INSTANCING ---

const WaterMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 0.8 }) => {
    // Reverted to simple Standard Material for guaranteed visibility
    return (
        <meshStandardMaterial
            color={color}
            transparent={true}
            opacity={0.8}
            roughness={0.0}
            metalness={0.2}
        />
    );
};

const MagmaMaterial: React.FC<{ color: string, opacity?: number }> = ({ color, opacity = 1.0 }) => {
    return (
        <meshStandardMaterial
            color={color}
            transparent={opacity < 1.0}
            opacity={opacity}
            emissive={color}
            emissiveIntensity={0.8}
            roughness={0.9}
        />
    );
};
