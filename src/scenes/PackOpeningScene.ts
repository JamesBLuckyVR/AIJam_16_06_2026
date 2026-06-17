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

// All cards drawn from a pack are automatically kept — no discard mechanic.

export class PackOpeningScene extends BaseScene {
  private packMesh!: PackMesh;
  private cardMeshes: CardMesh[] = [];
  private drawnCards: CardInstance[] = [];
  private currentCardIdx = 0;
  private state: State = 'INSPECT';
  private elapsedTime = 0;

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

  // Converts screen pixels → world units at the card/pack plane (z=0).
  private _pixelToWorld(ctx: SceneContext): number {
    const camZ = ctx.engine.camera.position.z;
    const vFov = THREE.MathUtils.degToRad(ctx.engine.camera.fov);
    return (2 * camZ * Math.tan(vFov / 2)) / window.innerHeight;
  }

  private _enterInspect(ctx: SceneContext): void {
    this.state = 'INSPECT';
    ctx.hud.showCutHint(true);

    // Mode is determined at dragstart and locked until dragend.
    let packMode: 'rotate' | 'cut' | null = null;
    let cutStart: Vec2 | null = null;

    ctx.pointer.on('dragstart', (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      const bounds = this._getPackScreenBounds(ctx);
      if (GestureDetector.isInPackInnerZone(e.start, bounds)) {
        packMode = 'rotate';
      } else {
        packMode = 'cut';
        cutStart = { ...e.start };
      }
    });

    ctx.pointer.on('drag', (e: DragEvent) => {
      if (this.state !== 'INSPECT' || packMode !== 'rotate') return;
      this.packMesh.group.rotation.y += e.delta.x * 0.008;
      this.packMesh.group.rotation.x += e.delta.y * 0.008;
      this.packMesh.group.rotation.x = clamp(this.packMesh.group.rotation.x, -0.8, 0.8);
    });

    ctx.pointer.on('dragend', async (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      if (packMode === 'cut' && cutStart) {
        const bounds = this._getPackScreenBounds(ctx);
        const result = GestureDetector.detectCut(cutStart, e.current, bounds);
        if (result.isCut) {
          ctx.hud.showCutHint(false);
          await this._doCut(result.angle, ctx);
        }
      }
      packMode = null;
      cutStart = null;
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
    await this.packMesh.animateBodyExit();
    await this._revealCards(ctx);
  }

  private async _revealCards(ctx: SceneContext): Promise<void> {
    this.state = 'REVEALING';
    this.currentCardIdx = 0;

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

    this._setupSwipeListeners(ctx);
  }

  private _setupSwipeListeners(ctx: SceneContext): void {
    const cm = this.cardMeshes[this.currentCardIdx];
    const pixToWorld = this._pixelToWorld(ctx);

    const MAX_TILT    = 0.35;  // radians — max card tilt during rotate mode
    const TILT_FACTOR = 0.004; // radians per pixel offset from press start
    const THROW_VEL   = 0.5;   // px/ms to auto-throw on release
    const THROW_DIST  = 0.5;   // world units from origin to auto-throw on release

    const raycaster = new THREE.Raycaster();

    let cardMode: 'idle' | 'rotate' | 'swipe' = 'idle';
    let gestureStart: Vec2 = { x: 0, y: 0 };
    let swipeModeStart: Vec2 = { x: 0, y: 0 };

    ctx.pointer.on('dragstart', (e: DragEvent) => {
      if (this.state !== 'SWIPING') return;
      // Only enter interact mode when the press lands on the card.
      const ndc = ctx.pointer.clientToNDC(e.start);
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);
      if (raycaster.intersectObject(cm.mesh, false).length > 0) {
        cardMode = 'rotate';
        gestureStart = { ...e.start };
      } else {
        cardMode = 'idle';
      }
    });

    ctx.pointer.on('drag', (e: DragEvent) => {
      if (this.state !== 'SWIPING' || cardMode === 'idle') return;

      const offsetX = e.current.x - gestureStart.x;
      const offsetY = e.current.y - gestureStart.y;

      if (cardMode === 'rotate') {
        // Swipe starts only when the pointer leaves the card bounds.
        const ndc = ctx.pointer.clientToNDC(e.current);
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);
        const onCard = raycaster.intersectObject(cm.mesh, false).length > 0;

        if (!onCard) {
          // Pointer left the card — transition to free-swipe.
          cardMode = 'swipe';
          swipeModeStart = { ...e.current };
          gsap.killTweensOf(cm.mesh.rotation);
          gsap.to(cm.mesh.rotation, { x: 0, y: 0, z: 0, duration: 0.15, ease: 'power2.out' });
          // Fall through so position update runs on this same event.
        } else {
          // Still on card — tilt proportional to offset from press start.
          cm.mesh.rotation.y = clamp( offsetX * TILT_FACTOR, -MAX_TILT, MAX_TILT);
          cm.mesh.rotation.x = clamp(-offsetY * TILT_FACTOR, -MAX_TILT, MAX_TILT);
          return;
        }
      }

      // Free-swipe: card follows finger in all directions.
      const swOffX = e.current.x - swipeModeStart.x;
      const swOffY = e.current.y - swipeModeStart.y;
      cm.mesh.position.x = swOffX * pixToWorld;
      cm.mesh.position.y = -swOffY * pixToWorld;
    });

    ctx.pointer.on('dragend', (e: DragEvent) => {
      if (this.state !== 'SWIPING') return;

      if (cardMode === 'idle') return;

      if (cardMode === 'rotate') {
        // Short press — snap rotation back to flat.
        gsap.to(cm.mesh.rotation, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'power2.out' });
        cardMode = 'idle';
        return;
      }

      // Swipe mode — decide throw vs snap-back.
      const vel = GestureDetector.swipeVelocity2D(e.positions, e.timestamps);
      const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      const distFromCenter = Math.sqrt(cm.mesh.position.x ** 2 + cm.mesh.position.y ** 2);
      cardMode = 'idle';

      if (velMag > THROW_VEL || distFromCenter > THROW_DIST) {
        this._throwCard(vel, ctx);
      } else {
        gsap.killTweensOf(cm.mesh.position);
        gsap.to(cm.mesh.position, { x: 0, y: 0, duration: 0.3, ease: 'back.out(1.2)' });
        gsap.to(cm.mesh.rotation, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'power2.out' });
      }
    });
  }

  private async _throwCard(vel: Vec2, ctx: SceneContext): Promise<void> {
    if (this.state !== 'SWIPING') return;
    this.state = 'CUT_ANIM';

    ctx.hud.showSwipeHint(false);
    ctx.pointer.on('dragstart', () => {});
    ctx.pointer.on('drag', () => {});
    ctx.pointer.on('dragend', () => {});

    const cm = this.cardMeshes[this.currentCardIdx];
    ctx.inventory.addCard(cm.card);

    // Determine throw direction from velocity or current card position.
    const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    let nx: number, ny: number;
    if (velMag > 0.01) {
      nx = vel.x / velMag;
      ny = vel.y / velMag;
    } else {
      const posLen = Math.sqrt(cm.mesh.position.x ** 2 + cm.mesh.position.y ** 2) || 1;
      nx =  cm.mesh.position.x / posLen;
      ny = -cm.mesh.position.y / posLen; // world y up ↔ screen y down
    }

    const throwDist = 18;

    gsap.killTweensOf(cm.mesh.position);
    gsap.killTweensOf(cm.mesh.rotation);

    await new Promise<void>((resolve) => {
      gsap.to(cm.mesh.position, {
        x: cm.mesh.position.x + nx * throwDist,
        y: cm.mesh.position.y - ny * throwDist,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: resolve,
      });
      gsap.to(cm.mesh.rotation, {
        z: (Math.random() - 0.5) * 1.2,
        duration: 0.35,
        ease: 'power2.in',
      });
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

    ctx.hud.addButton(
      `Got ${this.drawnCards.length} cards!  →  Back to Room`,
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
