import * as THREE from 'three';
import gsap from 'gsap';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';
import { PackMesh } from '../rendering/PackMesh.js';
import { CardMesh } from '../rendering/CardMesh.js';
import { GestureDetector } from '../input/GestureDetector.js';
import type { CardInstance } from '../entities/Card.js';
import type { PackDefinition } from '../types/index.js';
import type { DragEvent } from '../input/PointerManager.js';
import type { Vec2 } from '../utils/math.js';
import { clamp } from '../utils/math.js';

type State = 'INSPECT' | 'CUTTING' | 'CUT_ANIM' | 'REVEALING' | 'SWIPING' | 'SUMMARY';

const SWIPE_VELOCITY_THRESHOLD = 0.8;
const SWIPE_DISTANCE_THRESHOLD = 80;

export class PackOpeningScene extends BaseScene {
  private packMesh!: PackMesh;
  private cardMeshes: CardMesh[] = [];
  private drawnCards: CardInstance[] = [];
  private currentCardIdx = 0;
  private state: State = 'INSPECT';
  private keptCards: CardInstance[] = [];
  private elapsedTime = 0;

  private cutStart: Vec2 | null = null;
  private cutLine: { start: Vec2; end: Vec2 } | null = null;
  private isDraggingCard = false;
  private cardDragStart: Vec2 = { x: 0, y: 0 };

  async init(ctx: SceneContext, params?: unknown): Promise<void> {
    this.ctx = ctx;
    const { packDef } = params as { packDef: PackDefinition };

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const spot = new THREE.SpotLight(0xffd0ff, 2.5, 20, 0.5, 0.5, 1.5);
    spot.position.set(0, 6, 4);
    spot.target.position.set(0, 0, 0);
    this.scene.add(ambient, spot, spot.target);

    ctx.engine.camera.position.set(0, 0, 7);
    ctx.engine.camera.lookAt(0, 0, 0);

    this.packMesh = new PackMesh(packDef);
    this.scene.add(this.packMesh.group);

    this.drawnCards = ctx.packOpener.drawCards(packDef);

    ctx.hud.setSceneTitle('Pack Opening');
    ctx.hud.clearButtons();
    ctx.hud.showCutHint(true);

    this._enterInspect(ctx);

    ctx.orientation.requestAndStart();
  }

  private _enterInspect(ctx: SceneContext): void {
    this.state = 'INSPECT';
    ctx.hud.showCutHint(true);

    ctx.pointer.on('drag', (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      this.packMesh.group.rotation.y += e.delta.x * 0.008;
      this.packMesh.group.rotation.x += e.delta.y * 0.008;
      this.packMesh.group.rotation.x = clamp(this.packMesh.group.rotation.x, -0.8, 0.8);
    });

    ctx.pointer.on('dragstart', (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      this.cutStart = e.start;
    });

    ctx.pointer.on('dragend', async (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      if (!this.cutStart) return;

      const rect = this._getPackScreenBounds(ctx);
      const result = GestureDetector.detectCut(this.cutStart, e.current, rect);

      if (result.isCut) {
        ctx.hud.showCutHint(false);
        await this._doCut(result.angle, ctx);
      }
      this.cutStart = null;
    });
  }

  private _getPackScreenBounds(ctx: SceneContext): {
    left: number; right: number; top: number; bottom: number;
  } {
    const box = new THREE.Box3().setFromObject(this.packMesh.group);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    ];

    const screenCorners = corners.map((c) => {
      c.project(ctx.engine.camera);
      return {
        x: ((c.x + 1) / 2) * window.innerWidth,
        y: ((-c.y + 1) / 2) * window.innerHeight,
      };
    });

    const xs = screenCorners.map((c) => c.x);
    const ys = screenCorners.map((c) => c.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  }

  private async _doCut(angle: number, ctx: SceneContext): Promise<void> {
    this.state = 'CUT_ANIM';
    ctx.pointer.on('drag', () => {});
    ctx.pointer.on('dragstart', () => {});
    ctx.pointer.on('dragend', () => {});

    await this.packMesh.animateCut(angle);
    await this._revealCards(ctx);
  }

  private async _revealCards(ctx: SceneContext): Promise<void> {
    this.state = 'REVEALING';
    this.currentCardIdx = 0;
    this.keptCards = [];

    this.cardMeshes = this.drawnCards.map((card) => {
      const cm = new CardMesh(card);
      cm.mesh.position.set(0, -8, 0);
      cm.mesh.rotation.y = Math.PI;
      this.scene.add(cm.mesh);
      return cm;
    });

    await this._showNextCard(ctx);
  }

  private async _showNextCard(ctx: SceneContext): Promise<void> {
    if (this.currentCardIdx >= this.cardMeshes.length) {
      await this._showSummary(ctx);
      return;
    }

    const cm = this.cardMeshes[this.currentCardIdx];
    cm.mesh.position.set(0, -8, 0);
    cm.mesh.rotation.set(0, Math.PI, 0);

    await new Promise<void>((resolve) => {
      gsap.to(cm.mesh.position, { y: 0, duration: 0.5, ease: 'back.out(1.5)', onComplete: resolve });
    });

    await cm.flipToFaceUp();

    this.state = 'SWIPING';
    ctx.hud.showSwipeHint(true);
    ctx.hud.showCardActions(true,
      () => this._throwCard('discard', ctx),
      () => this._throwCard('keep', ctx),
    );

    this._setupSwipeListeners(ctx);
  }

  private _setupSwipeListeners(ctx: SceneContext): void {
    const cm = this.cardMeshes[this.currentCardIdx];

    ctx.pointer.on('drag', (e: DragEvent) => {
      if (this.state !== 'SWIPING' || this.isDraggingCard) return;
      const dx = e.current.x - e.start.x;
      cm.mesh.position.x = dx * 0.01;
      cm.mesh.rotation.z = -dx * 0.0003;

      const pct = dx / (window.innerWidth * 0.5);
    });

    ctx.pointer.on('dragend', (e: DragEvent) => {
      if (this.state !== 'SWIPING') return;

      const vel = GestureDetector.swipeVelocity(e.positions, e.timestamps);
      const dist = e.current.x - e.start.x;

      if (vel > SWIPE_VELOCITY_THRESHOLD || dist > SWIPE_DISTANCE_THRESHOLD) {
        this._throwCard('keep', ctx);
      } else if (vel < -SWIPE_VELOCITY_THRESHOLD || dist < -SWIPE_DISTANCE_THRESHOLD) {
        this._throwCard('discard', ctx);
      } else {
        gsap.to(cm.mesh.position, { x: 0, duration: 0.2, ease: 'power2.out' });
        gsap.to(cm.mesh.rotation, { z: 0, duration: 0.2, ease: 'power2.out' });
      }
    });
  }

  private async _throwCard(action: 'keep' | 'discard', ctx: SceneContext): Promise<void> {
    if (this.state !== 'SWIPING') return;
    this.state = 'CUT_ANIM';

    ctx.hud.showSwipeHint(false);
    ctx.hud.showCardActions(false);
    ctx.pointer.on('drag', () => {});
    ctx.pointer.on('dragend', () => {});

    const cm = this.cardMeshes[this.currentCardIdx];
    const targetX = action === 'keep' ? 15 : -15;

    if (action === 'keep') {
      this.keptCards.push(cm.card);
      ctx.inventory.addCard(cm.card);
    }

    await new Promise<void>((resolve) => {
      gsap.to(cm.mesh.position, {
        x: targetX,
        y: (Math.random() - 0.5) * 4,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: resolve,
      });
      gsap.to(cm.mesh.rotation, { z: targetX > 0 ? -1 : 1, duration: 0.35, ease: 'power2.in' });
    });

    cm.mesh.visible = false;
    this.currentCardIdx++;
    this.state = 'REVEALING';
    await this._showNextCard(ctx);
  }

  private async _showSummary(ctx: SceneContext): Promise<void> {
    this.state = 'SUMMARY';
    ctx.save();

    ctx.hud.clearButtons();
    ctx.hud.setSceneTitle('Cards Revealed!');

    const keptCount = this.keptCards.length;
    const discardedCount = this.drawnCards.length - keptCount;

    ctx.hud.addButton(
      `Kept ${keptCount} · Discarded ${discardedCount}  →  Back to Room`,
      () => ctx.goto('room'),
      'primary',
    );

    if (ctx.inventory.packIds.length > 0) {
      ctx.hud.addButton('Open Another Pack', () => ctx.goto('pack-shelf'));
    }
  }

  update(delta: number): void {
    this.elapsedTime += delta;

    const currentCard = this.cardMeshes[this.currentCardIdx];
    if (currentCard && this.state === 'SWIPING') {
      const orient = this.ctx.orientation;
      currentCard.updateHolo(orient.tiltX, orient.tiltY, this.elapsedTime, this.ctx.engine.camera.position);
    }
  }

  dispose(): void {
    this.cardMeshes.forEach((cm) => cm.dispose());
    this.cardMeshes = [];
    this.packMesh?.dispose();
    super.dispose();
  }
}
