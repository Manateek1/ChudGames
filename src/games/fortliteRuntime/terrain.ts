import * as THREE from 'three';
import type { GraphicsQuality } from '../../types/arcade';
import { SeededRandom } from './math';

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

// Simple value noise
class SimpleNoise {
    private perm: Uint8Array;
    private values: Float32Array;

    constructor(seedRng: SeededRandom) {
        this.perm = new Uint8Array(512);
        this.values = new Float32Array(256);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = i;
            this.values[i] = seedRng.next() * 2 - 1;
        }
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(seedRng.next() * (i + 1));
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
        }
    }

    public noise2D(x: number, y: number): number {
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        const u = smoothstep(0, 1, xf);
        const v = smoothstep(0, 1, yf);

        const aa = this.values[this.perm[this.perm[xi] + yi]];
        const ab = this.values[this.perm[this.perm[xi] + yi + 1]];
        const ba = this.values[this.perm[this.perm[xi + 1] + yi]];
        const bb = this.values[this.perm[this.perm[xi + 1] + yi + 1]];

        const x1 = lerp(aa, ba, u);
        const x2 = lerp(ab, bb, u);
        return lerp(x1, x2, v);
    }

    public fbm2D(x: number, y: number, octaves: number): number {
        let val = 0;
        let freq = 1;
        let amp = 1;
        let totalAmp = 0;
        for (let i = 0; i < octaves; i++) {
            val += this.noise2D(x * freq, y * freq) * amp;
            totalAmp += amp;
            freq *= 2;
            amp *= 0.5;
        }
        return val / totalAmp;
    }
}

interface Hill {
    x: number;
    z: number;
    height: number;
    rx: number;
    rz: number;
}

export class IslandTerrain {
    public readonly terrainMesh: THREE.Mesh;
    public readonly waterMesh: THREE.Mesh;
    public readonly treeTrunks: THREE.InstancedMesh;
    public readonly treeCanopies: THREE.InstancedMesh;
    
    private heights: Float32Array;
    private widthSegments: number;
    private heightSegments: number;
    private size: number;
    private mapRadius: number;

    constructor(rng: SeededRandom, mapRadius: number, quality: GraphicsQuality) {
        this.mapRadius = mapRadius;
        this.size = mapRadius * 2.2;
        
        switch (quality) {
            case 'low': this.widthSegments = 96; break;
            case 'medium': this.widthSegments = 192; break;
            case 'high': this.widthSegments = 256; break;
            default: this.widthSegments = 192;
        }
        this.heightSegments = this.widthSegments;

        this.heights = new Float32Array((this.widthSegments + 1) * (this.heightSegments + 1));

        const geometry = new THREE.PlaneGeometry(this.size, this.size, this.widthSegments, this.heightSegments);
        geometry.rotateX(-Math.PI / 2);

        // Define hills
        const hills: Hill[] = [
            // N (Hill Settlement)
            { x: 0, z: -mapRadius * 0.5, height: 18 + rng.next() * 2, rx: 60, rz: 60 },
            // W (Lighthouse Overlook)
            { x: -mapRadius * 0.6, z: 0, height: 22 + rng.next() * 2, rx: 45, rz: 45 },
            // SE (Harbor District)
            { x: mapRadius * 0.5, z: mapRadius * 0.5, height: 4 + rng.next(), rx: 50, rz: 50 },
            // 4 scattered
            { x: (rng.next() - 0.5) * mapRadius, z: (rng.next() - 0.5) * mapRadius, height: 6 + rng.next() * 6, rx: 30 + rng.next() * 20, rz: 30 + rng.next() * 20 },
            { x: (rng.next() - 0.5) * mapRadius, z: (rng.next() - 0.5) * mapRadius, height: 6 + rng.next() * 6, rx: 30 + rng.next() * 20, rz: 30 + rng.next() * 20 },
            { x: (rng.next() - 0.5) * mapRadius, z: (rng.next() - 0.5) * mapRadius, height: 6 + rng.next() * 6, rx: 30 + rng.next() * 20, rz: 30 + rng.next() * 20 },
            { x: (rng.next() - 0.5) * mapRadius, z: (rng.next() - 0.5) * mapRadius, height: 6 + rng.next() * 6, rx: 30 + rng.next() * 20, rz: 30 + rng.next() * 20 },
        ];

        const noise = new SimpleNoise(rng);
        
        const posAttr = geometry.attributes.position;
        const colorAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3);
        
        const tempColor = new THREE.Color();
        const sand = new THREE.Color(0xd0aa66);
        const grass = new THREE.Color(0x5c7650);
        const dirt = new THREE.Color(0x8b6a45);
        const rock = new THREE.Color(0x6f7a80);

        // Precompute heights
        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vz = posAttr.getZ(i);

            const r = Math.sqrt(vx * vx + vz * vz);
            const islandFalloff = smoothstep(0.65, 1.0, r / mapRadius);
            
            let h = -2 + 2 * (1 - islandFalloff); // Base
            
            for (const hill of hills) {
                const dx = vx - hill.x;
                const dz = vz - hill.z;
                const distSq = (dx * dx) / (hill.rx * hill.rx) + (dz * dz) / (hill.rz * hill.rz);
                h += hill.height * Math.exp(-distSq) * (1 - islandFalloff);
            }
            
            // Add noise
            const n = noise.fbm2D(vx * 0.05, vz * 0.05, 3) * 4 - 2; // amplitude ~2
            h += n * (1 - islandFalloff);

            if (r > mapRadius) {
                h = -2;
            }

            posAttr.setY(i, h);
            this.heights[i] = h;
        }

        geometry.computeVertexNormals();
        const normAttr = geometry.attributes.normal;

        for (let i = 0; i < posAttr.count; i++) {
            const h = posAttr.getY(i);
            const ny = normAttr.getY(i);
            
            const slope = 1.0 - ny; // approx slope

            if (slope > 0.6) {
                tempColor.copy(rock);
            } else if (h < 0.3) {
                tempColor.copy(sand);
            } else if (h < 2.0) {
                tempColor.copy(sand).lerp(grass, smoothstep(0.3, 2.0, h));
            } else if (h < 10.0) {
                tempColor.copy(grass);
            } else if (h < 16.0) {
                tempColor.copy(grass).lerp(dirt, smoothstep(10.0, 16.0, h));
            } else {
                tempColor.copy(rock);
            }

            colorAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
        }

        geometry.setAttribute('color', colorAttr);

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1,
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.receiveShadow = true;

        // Water
        const waterGeom = new THREE.PlaneGeometry(mapRadius * 2.4, mapRadius * 2.4, 1, 1);
        waterGeom.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x3a8fbf,
            opacity: 0.65,
            transparent: true,
            roughness: 0.15,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
        this.waterMesh.position.y = 0.08;
        this.waterMesh.receiveShadow = true;

        // Trees
        let treeCount = 120;
        if (quality === 'medium') treeCount = 350;
        if (quality === 'high') treeCount = 500;

        const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 3, 5);
        trunkGeom.translate(0, 1.5, 0); // origin at bottom
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
        this.treeTrunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
        this.treeTrunks.castShadow = true;
        this.treeTrunks.receiveShadow = true;

        const canopyGeom = new THREE.ConeGeometry(1.8, 4, 7);
        canopyGeom.translate(0, 3 + 2, 0); // on top of trunk
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2e, roughness: 0.8 });
        this.treeCanopies = new THREE.InstancedMesh(canopyGeom, canopyMat, treeCount);
        this.treeCanopies.castShadow = true;
        this.treeCanopies.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const treeColor = new THREE.Color();
        const baseCanopy = new THREE.Color(0x3d6b2e);

        let placed = 0;
        let attempts = 0;
        while (placed < treeCount && attempts < treeCount * 10) {
            attempts++;
            const tx = (rng.next() - 0.5) * this.size;
            const tz = (rng.next() - 0.5) * this.size;
            const r = Math.sqrt(tx * tx + tz * tz);
            const falloff = smoothstep(0.65, 1.0, r / mapRadius);
            
            if (falloff > 0.5) continue;
            
            const th = this.sampleHeight(tx, tz);
            if (th < 1.5 || th > 14.0) continue;

            const scale = 0.7 + rng.next() * 0.6;
            dummy.position.set(tx, th, tz);
            dummy.rotation.set(0, rng.next() * Math.PI * 2, 0);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();

            this.treeTrunks.setMatrixAt(placed, dummy.matrix);
            this.treeCanopies.setMatrixAt(placed, dummy.matrix);

            treeColor.copy(baseCanopy);
            treeColor.offsetHSL(rng.next() * 0.05 - 0.025, rng.next() * 0.1 - 0.05, rng.next() * 0.1 - 0.05);
            this.treeCanopies.setColorAt(placed, treeColor);

            placed++;
        }

        // update instance count in case we didn't place all
        this.treeTrunks.count = placed;
        this.treeCanopies.count = placed;
        this.treeTrunks.instanceMatrix.needsUpdate = true;
        this.treeCanopies.instanceMatrix.needsUpdate = true;
        if (this.treeCanopies.instanceColor) this.treeCanopies.instanceColor.needsUpdate = true;
    }

    public sampleHeight(x: number, z: number): number {
        // Map world x,z to grid coordinates
        const halfSize = this.size / 2;
        const gridX = (x + halfSize) / this.size * this.widthSegments;
        const gridZ = (z + halfSize) / this.size * this.heightSegments;

        if (gridX < 0 || gridX >= this.widthSegments || gridZ < 0 || gridZ >= this.heightSegments) {
            return -2;
        }

        const x0 = Math.floor(gridX);
        const x1 = Math.min(x0 + 1, this.widthSegments);
        const z0 = Math.floor(gridZ);
        const z1 = Math.min(z0 + 1, this.heightSegments);

        const fx = gridX - x0;
        const fz = gridZ - z0;

        const h00 = this.heights[z0 * (this.widthSegments + 1) + x0];
        const h10 = this.heights[z0 * (this.widthSegments + 1) + x1];
        const h01 = this.heights[z1 * (this.widthSegments + 1) + x0];
        const h11 = this.heights[z1 * (this.widthSegments + 1) + x1];

        const h0 = lerp(h00, h10, fx);
        const h1 = lerp(h01, h11, fx);

        return lerp(h0, h1, fz);
    }

    public getNormal(x: number, z: number): THREE.Vector3 {
        const h0 = this.sampleHeight(x - 0.5, z);
        const h1 = this.sampleHeight(x + 0.5, z);
        const h2 = this.sampleHeight(x, z - 0.5);
        const h3 = this.sampleHeight(x, z + 0.5);

        const normal = new THREE.Vector3(h0 - h1, 1.0, h2 - h3);
        return normal.normalize();
    }

    public getBiome(x: number, z: number): 'regular' | 'forest' | 'desert' {
        const theta = Math.atan2(z, x); // -PI to PI
        if (theta > -Math.PI / 4 && theta < Math.PI / 4) {
            return 'desert';
        } else if (theta > Math.PI * 3 / 4 || theta < -Math.PI * 3 / 4) {
            return 'forest';
        }
        return 'regular';
    }

    public dispose(): void {
        this.terrainMesh.geometry.dispose();
        (this.terrainMesh.material as THREE.Material).dispose();
        
        this.waterMesh.geometry.dispose();
        (this.waterMesh.material as THREE.Material).dispose();

        this.treeTrunks.geometry.dispose();
        (this.treeTrunks.material as THREE.Material).dispose();

        this.treeCanopies.geometry.dispose();
        (this.treeCanopies.material as THREE.Material).dispose();
    }
}
