import * as THREE from 'three';
import gsap from 'gsap';
import type { PackDefinition } from '../types/index.js';
import { TextureGenerator } from './TextureGenerator.js';

const PACK_W = 2.0;
const PACK_H = 3.2;
const PACK_DEPTH = 0.05;

function foilMat(color: number, roughness = 0.24): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.82 });
}

export class PackMesh {
  readonly group: THREE.Group;
  private _meshes: THREE.Mesh[] = [];
  private cutTopGroup: THREE.Group | null = null;
  private _clonedMaterials: THREE.Material[] = [];
  // Cut plane in each group's LOCAL space — used to recompute world-space clip planes
  // each frame as the groups translate/rotate, keeping the cut flush with the geometry.
  private _cutTopLocalPlane: THREE.Plane | null = null;
  private _cutBodyLocalPlane: THREE.Plane | null = null;
  // World-space plane instances stored on each material — mutated in onUpdate callbacks.
  private _cutAbovePlanes: THREE.Plane[] = [];
  private _cutBelowPlanes: THREE.Plane[] = [];

  constructor(public readonly pack: PackDefinition) {
    this.group = new THREE.Group();

    const artTex = TextureGenerator.getPackFace(pack);

    // Single flat body — front has pack art, back is shiny foil, thin edges are foil
    const bodyGeo = new THREE.BoxGeometry(PACK_W, PACK_H, PACK_DEPTH);
    const body = new THREE.Mesh(bodyGeo, [
      foilMat(0xb0b8c8),               // +X right edge
      foilMat(0xb0b8c8),               // −X left edge
      foilMat(0xa8b0c0),               // +Y top edge
      foilMat(0xa8b0c0),               // −Y bottom edge
      new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.10, metalness: 0.06 }), // front
      foilMat(0xbcc4d0, 0.16),         // back — slightly shinier
    ]);
    this._meshes.push(body);
    this.group.add(body);
  }

  get screenBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    const box = new THREE.Box3().setFromObject(this.group);
    return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y };
  }

  /**
   * Splits the pack visually along worldCutPlane using GPU clipping.
   * Three.js clipping planes are world-space, so:
   *  - original meshes receive the "below" plane (they never move — plane stays correct)
   *  - cloned group receives the "above" plane, which animateCut updates each frame as it moves
   * Returns the cloned top Group — caller must add it to the scene.
   */
  prepareCut(worldCutPlane: THREE.Plane): THREE.Group {
    this.group.updateMatrixWorld(true);
    const belowPlane = worldCutPlane.clone().negate();

    this.cutTopGroup = new THREE.Group();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    this.group.matrixWorld.decompose(pos, quat, scale);
    this.cutTopGroup.position.copy(pos);
    this.cutTopGroup.quaternion.copy(quat);
    this.cutTopGroup.scale.copy(scale);
    this.cutTopGroup.updateMatrixWorld(true);

    // Store the cut plane in cutTopGroup's local space so animateCut can recompute
    // the correct world-space plane as the group translates and rotates.
    const groupWorldInv = this.cutTopGroup.matrixWorld.clone().invert();
    this._cutTopLocalPlane = worldCutPlane.clone().applyMatrix4(groupWorldInv);
    this._cutAbovePlanes = [];
    this._cutBelowPlanes = [];

    // Store the below-cut plane in this.group's local space so animateBodyExit can track it.
    this.group.updateMatrixWorld(true);
    const bodyGroupWorldInv = this.group.matrixWorld.clone().invert();
    this._cutBodyLocalPlane = belowPlane.clone().applyMatrix4(bodyGroupWorldInv);

    for (const mesh of this._meshes) {
      // Apply world-space "below" clip to original mesh — will be updated in animateBodyExit.
      const origMats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.Material[])
        : [mesh.material as THREE.Material];
      origMats.forEach((m) => {
        const bp = belowPlane.clone();
        (m as THREE.MeshStandardMaterial).clippingPlanes = [bp];
        this._cutBelowPlanes.push(bp);
      });

      // Clone with world-space "above" clip.  These will be updated each frame in animateCut.
      const cloned = mesh.clone();
      const clonedMats = origMats.map((m) => {
        const mc = (m as THREE.MeshStandardMaterial).clone();
        const abovePlane = worldCutPlane.clone(); // world-space, same initial value as original
        mc.clippingPlanes = [abovePlane];
        this._cutAbovePlanes.push(abovePlane);
        this._clonedMaterials.push(mc);
        return mc;
      });
      cloned.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
      this.cutTopGroup.add(cloned);
    }

    return this.cutTopGroup;
  }

  async animateCut(cutAngleRad: number): Promise<void> {
    if (!this.cutTopGroup || !this._cutTopLocalPlane) return;
    const g = this.cutTopGroup;
    const localPlane = this._cutTopLocalPlane;
    const abovePlanes = this._cutAbovePlanes;

    const dx = Math.cos(cutAngleRad) * 0.5;
    const dy = Math.sin(cutAngleRad) * 0.5;
    const spin = cutAngleRad * 0.5 + (Math.random() - 0.5) * 0.4;

    // Each frame: recompute the world-space above-cut plane from the local plane +
    // the group's current world matrix so the visual cut stays flush with the mesh.
    const onUpdate = () => {
      g.updateMatrixWorld(true);
      const worldPlane = localPlane.clone().applyMatrix4(g.matrixWorld);
      abovePlanes.forEach((p) => {
        p.normal.copy(worldPlane.normal);
        p.constant = worldPlane.constant;
      });
    };

    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve, onUpdate });
      tl.to(g.position, { x: `+=${dx * 1.5}`, y: `+=${dy * 1.5 + 1.5}`, duration: 0.2, ease: 'power2.in' });
      tl.to(g.rotation, { z: spin, duration: 0.2, ease: 'power2.in' }, '<');
      tl.to(g.position, { x: `+=${dx * 6}`, y: `+=${dy * 6 + 8}`, duration: 0.4, ease: 'power1.in' });
      tl.to(g.rotation, { z: cutAngleRad * 2, duration: 0.4, ease: 'power1.in' }, '<');
    });
  }

  async animateBodyExit(): Promise<void> {
    const g = this.group;
    const localPlane = this._cutBodyLocalPlane;
    const belowPlanes = this._cutBelowPlanes;

    const onUpdate = localPlane
      ? () => {
          g.updateMatrixWorld(true);
          const worldPlane = localPlane.clone().applyMatrix4(g.matrixWorld);
          belowPlanes.forEach((p) => {
            p.normal.copy(worldPlane.normal);
            p.constant = worldPlane.constant;
          });
        }
      : undefined;

    return new Promise((resolve) => {
      gsap.to(g.position, {
        y: -8,
        duration: 0.35,
        ease: 'power2.in',
        onUpdate,
        onComplete: resolve,
      });
    });
  }

  dispose(): void {
    for (const mesh of this._meshes) {
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.Material[])
        : [mesh.material as THREE.Material];
      mats.forEach((m) => m.dispose());
    }
    this._clonedMaterials.forEach((m) => m.dispose());
    this._clonedMaterials = [];
    this._cutAbovePlanes = [];
    this._cutBelowPlanes = [];
    this._cutTopLocalPlane = null;
    this._cutBodyLocalPlane = null;
    this.cutTopGroup = null;
  }
}
