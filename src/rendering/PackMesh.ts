import * as THREE from 'three';
import gsap from 'gsap';
import type { PackDefinition } from '../types/index.js';
import { TextureGenerator } from './TextureGenerator.js';

const PACK_W = 2.0;
const PACK_H = 3.2;
const PACK_DEPTH = 0.05;     // thin like a real plastic booster pack
const SEAL_FRACTION = 0.18;  // sealed top strip is 18% of total height

const SEAL_H = PACK_H * SEAL_FRACTION;  // 0.576
const BODY_H = PACK_H - SEAL_H;        // 2.624

// Seal overlaps body edges so it looks "clamped over" the pack body
const SEAL_W = PACK_W + 0.04;
const SEAL_D = PACK_DEPTH + 0.01;

// Vertical centres (pack is centred at y=0, extends ±1.6)
const BODY_CENTER_Y = -(SEAL_H / 2);           // −0.288
const SEAL_CENTER_Y = PACK_H / 2 - SEAL_H / 2; //  1.312
const SEAM_Y = PACK_H / 2 - SEAL_H;            //  1.024

function foilMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.78 });
}

export class PackMesh {
  readonly group: THREE.Group;
  private topMesh: THREE.Mesh;
  private bottomMesh: THREE.Mesh;
  private seamMesh: THREE.Mesh;

  constructor(public readonly pack: PackDefinition) {
    this.group = new THREE.Group();

    const tex = TextureGenerator.getPackFace(pack);

    // ── Main body (bottom 82%) — pack art front, foil edges and back ───────
    const bodyGeo = new THREE.BoxGeometry(PACK_W, BODY_H, PACK_DEPTH);
    this.bottomMesh = new THREE.Mesh(bodyGeo, [
      foilMat(0xa8b0bc),  // +X right edge
      foilMat(0xa8b0bc),  // −X left edge
      foilMat(0x909098),  // +Y cut edge (exposed after opening)
      foilMat(0xa8b0bc),  // −Y bottom edge
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.12, metalness: 0.08 }), // front
      foilMat(0xb0b8c4),  // back
    ]);
    this.bottomMesh.position.y = BODY_CENTER_Y;

    // ── Seal strip (top 18%) — all metallic foil ────────────────────────────
    const sealGeo = new THREE.BoxGeometry(SEAL_W, SEAL_H, SEAL_D);
    this.topMesh = new THREE.Mesh(sealGeo, [
      foilMat(0xb0b8c8),  // right
      foilMat(0xb0b8c8),  // left
      foilMat(0xc0c8d4),  // top
      foilMat(0x9098a8),  // bottom (cut edge)
      foilMat(0xc4ccd8),  // front
      foilMat(0xb0b8c8),  // back
    ]);
    this.topMesh.position.y = SEAL_CENTER_Y;

    // ── Seam detail at the join between seal and body ───────────────────────
    const seamGeo = new THREE.BoxGeometry(SEAL_W + 0.02, 0.045, SEAL_D + 0.01);
    this.seamMesh = new THREE.Mesh(seamGeo, foilMat(0x787888));
    this.seamMesh.position.y = SEAM_Y;

    this.group.add(this.bottomMesh, this.topMesh, this.seamMesh);
  }

  get screenBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    const box = new THREE.Box3().setFromObject(this.group);
    return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y };
  }

  async animateBodyExit(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this.bottomMesh.position, {
        y: -8,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: resolve,
      });
    });
  }

  async animateCut(cutAngleRad: number): Promise<void> {
    const dx = Math.cos(cutAngleRad) * 0.5;
    const dy = Math.sin(cutAngleRad) * 0.5;
    const spin = cutAngleRad * 0.5 + (Math.random() - 0.5) * 0.4;

    // Seal strip and seam fly off together
    const positions = [this.topMesh.position, this.seamMesh.position];
    const rotations = [this.topMesh.rotation, this.seamMesh.rotation];

    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(positions, { x: `+=${dx * 1.5}`, y: `+=${dy * 1.5 + 1.5}`, duration: 0.2, ease: 'power2.in' });
      tl.to(rotations, { z: spin, duration: 0.2, ease: 'power2.in' }, '<');
      tl.to(positions, { x: `+=${dx * 6}`, y: `+=${dy * 6 + 8}`, duration: 0.4, ease: 'power1.in' });
      tl.to(rotations, { z: cutAngleRad * 2, duration: 0.4, ease: 'power1.in' }, '<');
    });
  }

  dispose(): void {
    for (const mesh of [this.topMesh, this.bottomMesh, this.seamMesh]) {
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material as THREE.Material];
      mats.forEach((m) => m.dispose());
    }
  }
}
