import * as THREE from 'three';
import gsap from 'gsap';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';
import { PackMesh } from '../rendering/PackMesh.js';
import type { PackDefinition } from '../types/index.js';

export class PackShelfScene extends BaseScene {
  private packMeshes: PackMesh[] = [];
  private raycaster = new THREE.Raycaster();

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const point = new THREE.PointLight(0xffd0ff, 1.5, 20);
    point.position.set(0, 5, 5);
    this.scene.add(ambient, point);

    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.5;
    this.scene.add(floor);

    ctx.engine.camera.position.set(0, 1, 8);
    ctx.engine.camera.lookAt(0, 0, 0);

    ctx.hud.setSceneTitle('Your Packs');
    ctx.hud.clearButtons();
    ctx.hud.addButton('← Back', () => ctx.goto('room'));

    this._buildPackMeshes(ctx);

    ctx.pointer.on('tap', (pos) => this._onTap(pos, ctx));
  }

  private _buildPackMeshes(ctx: SceneContext): void {
    const packDefMap = new Map<string, PackDefinition>(ctx.packs.map((p) => [p.id, p]));

    const ownedIds = ctx.inventory.packIds;
    if (ownedIds.length === 0) {
      ctx.hud.addButton('Go buy some packs!', () => ctx.goto('store-select'), 'primary');
      return;
    }

    const cols = Math.min(ownedIds.length, 4);
    const spacing = 2.8;

    ownedIds.forEach((packId, i) => {
      const def = packDefMap.get(packId);
      if (!def) return;

      const pm = new PackMesh(def);
      const col = i % cols;
      const row = Math.floor(i / cols);
      pm.group.position.set(
        (col - (cols - 1) / 2) * spacing,
        -1.2 + row * -3.5,
        0,
      );
      pm.group.rotation.z = (Math.random() - 0.5) * 0.3;
      pm.group.userData['packId'] = packId;
      pm.group.userData['packDef'] = def;
      this.scene.add(pm.group);
      this.packMeshes.push(pm);
    });
  }

  private _onTap(pos: { x: number; y: number }, ctx: SceneContext): void {
    const ndc = ctx.pointer.clientToNDC(pos);
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);

    const objects = this.packMeshes.map((pm) => pm.group).flatMap((g) => {
      const hits: THREE.Object3D[] = [];
      g.traverse((c) => { if ((c as THREE.Mesh).isMesh) hits.push(c); });
      return hits;
    });

    const hits = this.raycaster.intersectObjects(objects);
    if (hits.length === 0) return;

    let group = hits[0].object;
    while (group.parent && !group.userData['packId']) group = group.parent;
    if (!group.userData['packId']) return;

    const packId: string = group.userData['packId'];
    const packDef = group.userData['packDef'] as PackDefinition;

    gsap.to(group.position, { y: group.position.y + 1.5, duration: 0.3, ease: 'back.out(2)' });
    setTimeout(() => {
      ctx.inventory.removePack(packId);
      ctx.save();
      ctx.goto('pack-opening', { packDef });
    }, 350);
  }

  update(_delta: number): void {}

  dispose(): void {
    this.packMeshes.forEach((pm) => pm.dispose());
    this.packMeshes = [];
    super.dispose();
  }
}
