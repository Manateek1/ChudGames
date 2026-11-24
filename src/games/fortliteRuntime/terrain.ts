import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GraphicsQuality } from '../../types/arcade';
import { SeededRandom } from './math';
import { createIslandWater } from './ocean';
import { createTileTexture, tileNoise } from './surfaceTextures';

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function createBroadleafCanopy(radius: number) {
    const geometry = new THREE.SphereGeometry(radius, 11, 8);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i) / radius;
        const y = positions.getY(i) / radius;
        const z = positions.getZ(i) / radius;
        const cluster = Math.sin(8.1 * x + 3.4 * y) * Math.cos(7.6 * z - 1.8 * y);
        const lobe = 0.91 + 0.15 * cluster;
        positions.setXYZ(i, x * radius * lobe, y * radius * lobe * 0.89, z * radius * lobe);
        const shade = 0.64 + 0.27 * (y * 0.5 + 0.5) + 0.08 * cluster;
        colors.set([shade, shade, shade * 0.94], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
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
    public readonly waterMesh: ReturnType<typeof createIslandWater>;
    public readonly treeTrunks: THREE.InstancedMesh;
    public readonly treeCanopies: THREE.InstancedMesh;
    
    private heights: Float32Array;
    private widthSegments: number;
    private heightSegments: number;
    private size: number;
    private mapRadius: number;
    private readonly groundTexture: THREE.DataTexture;

    constructor(rng: SeededRandom, mapRadius: number, quality: GraphicsQuality) {
        this.mapRadius = mapRadius;
        this.size = mapRadius * 2.2;
        
        switch (quality) {
            case 'low': this.widthSegments = 108; break;
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
        const sand = new THREE.Color(0xc7ad80);
        const grass = new THREE.Color(0x657d43);
        const scrub = new THREE.Color(0x435938);
        const dirt = new THREE.Color(0x8e7951);
        const rock = new THREE.Color(0x79817d);

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
            
            const patch = noise.fbm2D(posAttr.getX(i) * 0.032, posAttr.getZ(i) * 0.032, 3);
            const exposedStone = Math.max(smoothstep(0.045, 0.24, 1 - ny), smoothstep(14, 23, h) * 0.44);

            tempColor.copy(grass)
                .lerp(scrub, smoothstep(0.40, 0.68, patch))
                .lerp(dirt, (1 - smoothstep(0.20, 0.43, patch)) * 0.76)
                .lerp(rock, exposedStone)
                .lerp(sand, 1 - smoothstep(0.15, 2.5, h))
                .multiplyScalar(0.87 + patch * 0.30);

            colorAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
        }

        geometry.setAttribute('color', colorAttr);
        this.groundTexture = createTileTexture(128, (u, v) =>
            0.55 + tileNoise(u, v, 9) * 0.16 + tileNoise(u, v, 31) * 0.21 +
            tileNoise(u, v, 61) * 0.08,
        'Rock and grass grain');
        this.groundTexture.repeat.setScalar(this.size / 10);

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            map: this.groundTexture,
            roughness: 1,
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.receiveShadow = true;

        this.waterMesh = createIslandWater(this.size, this.heights, this.widthSegments + 1);

        // Trees
        let treeCount = 120;
        if (quality === 'medium') treeCount = 350;
        if (quality === 'high') treeCount = 500;

        const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 3, 5);
        trunkGeom.translate(0, 1.5, 0); // origin at bottom
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5741 });
        this.treeTrunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
        this.treeTrunks.castShadow = true;
        this.treeTrunks.receiveShadow = true;

        // The three branch whorls share a single instance batch across the island.
        const tiers = [
            new THREE.ConeGeometry(1.98, 3.0, 6).translate(0, 3.88, 0),
            new THREE.ConeGeometry(1.48, 2.9, 6).rotateY(0.41).translate(0.12, 5.18, 0),
            new THREE.ConeGeometry(0.94, 2.55, 6).rotateY(0.8).translate(-0.08, 6.46, 0.04)
        ];
        const canopyGeom = mergeGeometries(tiers);
        for (const tier of tiers) tier.dispose();
        const canopyColors = new Float32Array(canopyGeom.attributes.position.count * 3);
        const canopyY = canopyGeom.attributes.position;
        for (let i = 0; i < canopyY.count; i += 1) {
            const color = 0.52 + smoothstep(2.3, 7.75, canopyY.getY(i)) * 0.48;
            canopyColors.fill(color, i * 3, i * 3 + 3);
        }
        canopyGeom.setAttribute('color', new THREE.BufferAttribute(canopyColors, 3));
        const canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.treeCanopies = new THREE.InstancedMesh(canopyGeom, canopyMat, treeCount);
        this.treeCanopies.castShadow = true;
        this.treeCanopies.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const treeColor = new THREE.Color();
        const baseCanopy = new THREE.Color(0x4a6940);

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
            dummy.scale.set(scale * (0.86 + 0.22 * th / 14), scale, scale);
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
        this.terrainMesh.removeFromParent();
        this.waterMesh.removeFromParent();
        this.treeTrunks.removeFromParent();
        this.treeCanopies.removeFromParent();
        this.terrainMesh.geometry.dispose();
        (this.terrainMesh.material as THREE.Material).dispose();
        this.groundTexture.dispose();
        
        this.waterMesh.geometry.dispose();
        this.waterMesh.material.uniforms.shoreMap.value.dispose();
        this.waterMesh.material.uniforms.rippleMap.value.dispose();
        this.waterMesh.material.dispose();

        this.treeTrunks.geometry.dispose();
        (this.treeTrunks.material as THREE.Material).dispose();
        this.treeTrunks.dispose();

        this.treeCanopies.geometry.dispose();
        (this.treeCanopies.material as THREE.Material).dispose();
        this.treeCanopies.dispose();
    }
}
