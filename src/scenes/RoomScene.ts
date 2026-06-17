import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';

export class RoomScene extends BaseScene {
  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    ctx.hud.setSceneTitle('Your Room');
    ctx.hud.setMoney(ctx.inventory.money);
    ctx.hud.clearButtons();

    ctx.hud.addButton('🃏  My Packs', () => ctx.goto('pack-shelf'), 'primary');
    ctx.hud.addButton('📦  Collection', () => ctx.goto('collection'));
    ctx.hud.addButton('🏪  Visit Store', () => ctx.goto('store-select'));
    ctx.hud.addButton('💼  Work', () => { ctx.inventory.earn(1); ctx.save(); });

    ctx.hud.showVersion(ctx.config.version);

    const bg = document.getElementById('room-bg')!;
    bg.style.background = 'radial-gradient(ellipse at 40% 60%, #2a1a3e 0%, #0d0d1a 100%)';
  }

  update(_delta: number): void {
    this.ctx.hud.setMoney(this.ctx.inventory.money);
  }
}
