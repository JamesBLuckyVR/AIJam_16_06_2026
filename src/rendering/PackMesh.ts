import * as THREE from 'three';
import gsap from 'gsap';
import type { PackDefinition } from '../types/index.js';
import { TextureGenerator } from './TextureGenerator.js';

const PACK_W = 2.0;
const PACK_H = 3.2;
const PACK_D = 0.25;

const SPLIT_Y = 0.3;

export class PackMesh {
  readonly group: THREE.Group;
  private topMesh: THREE.Mesh;
  private bottomMesh: THREE.Mesh;
  private topH: number;
  private bottomH: number;

  constructor(public readonly pack: PackDefinition) {
    this.group = new THREE.Group();

    const tex = TextureGenerator.getPackFace(pack);

    this.topH = PACK_H * (0.5 + SPLIT_Y / PACK_H);
    this.bottomH = PACK_H - this.topH;

    const topGeo = new THREE.BoxGeometry(PACK_W, this.topH, PACK_D);
    const botGeo = new THREE.BoxGeometry(PACK_W, this.bottomH, PACK_D);

    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1 });
    const matClone = mat.clone();

    this.topMesh = new THREE.Mesh(topGeo, mat);
    this.bottomMesh = new THREE.Mesh(botGeo, matClone);

    this.topMesh.position.y = this.bottomH / 2 + this.topH / 2;
    this.bottomMesh.position.y = -this.topH / 2 + this.bottomH / 2 - PACK_H / 2 + this.bottomH / 2;

    this.topMesh.position.y = (PACK_H / 2) - (this.topH / 2);
    this.bottomMesh.position.y = -(PACK_H / 2) + (this.bottomH / 2);

    this.group.add(this.topMesh, this.bottomMesh);
  }

  get screenBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    const box = new THREE.Box3().setFromObject(this.group);
    return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y };
  }

  async animateCut(cutAngleRad: number): Promise<void> {
    const dx = Math.cos(cutAngleRad) * 0.5;
    const dy = Math.sin(cutAngleRad) * 0.5;

    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.topMesh.position, {
        x: `+=${dx * 1.5}`,
        y: `+=${dy * 1.5 + 1.5}`,
        duration: 0.2,
        ease: 'power2.in',
      });
      tl.to(
        this.topMesh.rotation,
        { z: cutAngleRad * 0.5 + (Math.random() - 0.5) * 0.4, duration: 0.2, ease: 'power2.in' },
        '<',
      );
      tl.to(this.topMesh.position, {
        x: `+=${dx * 6}`,
        y: `+=${dy * 6 + 8}`,
        duration: 0.4,
        ease: 'power1.in',
      });
      tl.to(this.topMesh.rotation, { z: cutAngleRad * 2, duration: 0.4, ease: 'power1.in' }, '<');
    });
  }

  dispose(): void {
    this.topMesh.geometry.dispose();
    this.bottomMesh.geometry.dispose();
    (this.topMesh.material as THREE.Material).dispose();
    (this.bottomMesh.material as THREE.Material).dispose();
  }
}
