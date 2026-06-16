import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';

export class StoreSelectScene extends BaseScene {
  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    ctx.hud.setSceneTitle('Choose a Store');
    ctx.hud.clearButtons();
    ctx.hud.addButton('← Back', () => ctx.goto('room'));

    ctx.stores.forEach((store) => {
      ctx.hud.addButton(`${store.displayName}`, () => ctx.goto('store', { store }), 'primary');
    });
  }

  update(_delta: number): void {}
}
