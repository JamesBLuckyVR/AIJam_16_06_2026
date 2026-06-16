import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';
import { CardMesh } from '../rendering/CardMesh.js';
import type { CardInstance } from '../entities/Card.js';

const COLS = 4;
const CARD_SPACING_X = 3.0;
const CARD_SPACING_Y = 4.5;
const SCROLL_SENSITIVITY = 0.005;

export class CollectionScene extends BaseScene {
  private cardMeshes: CardMesh[] = [];
  private groupY = 0;
  private targetGroupY = 0;
  private cardGroup!: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private hoveredCard: CardInstance | null = null;
  private elapsedTime = 0;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xfff0ff, 0.8);
    dir.position.set(3, 5, 5);
    this.scene.add(ambient, dir);

    ctx.engine.camera.position.set(0, 0, 10);
    ctx.engine.camera.lookAt(0, 0, 0);

    ctx.hud.setSceneTitle('Collection');
    ctx.hud.clearButtons();
    ctx.hud.addButton('← Back', () => ctx.goto('room'));

    this.cardGroup = new THREE.Group();
    this.scene.add(this.cardGroup);

    this._buildGrid(ctx);
    this._setupInput(ctx);
  }

  private _buildGrid(ctx: SceneContext): void {
    const cards = ctx.inventory.cards;

    if (cards.length === 0) {
      ctx.hud.addButton('No cards yet — go open some packs!', () => ctx.goto('room'), 'primary');
      return;
    }

    cards.forEach((card, i) => {
      const cm = new CardMesh(card);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      cm.mesh.position.set(
        (col - (COLS - 1) / 2) * CARD_SPACING_X,
        -(row * CARD_SPACING_Y),
        0,
      );
      this.cardGroup.add(cm.mesh);
      this.cardMeshes.push(cm);
    });

    cm_flipAll(this.cardMeshes);
  }

  private _setupInput(ctx: SceneContext): void {
    ctx.pointer.on('drag', (e) => {
      const dy = e.delta.y * SCROLL_SENSITIVITY;
      this.targetGroupY += dy * 6;
    });

    ctx.pointer.on('tap', (pos) => {
      const ndc = ctx.pointer.clientToNDC(pos);
      this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);
      const hits = this.raycaster.intersectObjects(this.cardMeshes.map((cm) => cm.mesh));
      if (hits.length === 0) {
        ctx.hud.hideTooltip();
        this.hoveredCard = null;
        return;
      }
      const cm = this.cardMeshes.find((c) => c.mesh === hits[0].object);
      if (!cm) return;

      if (this.hoveredCard?.instanceId === cm.card.instanceId) {
        ctx.hud.hideTooltip();
        this.hoveredCard = null;
      } else {
        this.hoveredCard = cm.card;
        ctx.hud.showTooltip(cm.card, pos.x, pos.y, cm.card.definition.baseCost);
      }
    });
  }

  update(delta: number): void {
    this.elapsedTime += delta;
    this.groupY += (this.targetGroupY - this.groupY) * 0.12;
    if (this.cardGroup) this.cardGroup.position.y = this.groupY;

    const orient = this.ctx.orientation;
    this.cardMeshes.forEach((cm) => {
      cm.updateHolo(orient.tiltX, orient.tiltY, this.elapsedTime, this.ctx.engine.camera.position);
    });
  }

  dispose(): void {
    this.cardMeshes.forEach((cm) => cm.dispose());
    this.cardMeshes = [];
    super.dispose();
  }
}

async function cm_flipAll(meshes: CardMesh[]): Promise<void> {
  await Promise.all(meshes.map((cm) => cm.flipToFaceUp()));
}
