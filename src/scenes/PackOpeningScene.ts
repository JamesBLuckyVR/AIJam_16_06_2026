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

// Y and Z separation between adjacent cards in the resting stack.
// STACK_DY makes each card peek slightly below the one above it.
// STACK_DZ keeps them correctly occluded by the depth buffer.
const STACK_DY = 0.015;
const STACK_DZ = 0.012;

export class PackOpeningScene extends BaseScene {
  private packMesh!: PackMesh;
  private cutTopGroup: THREE.Group | null = null;
  private cardGroup: THREE.Group | null = null;
  private cardMeshes: CardMesh[] = [];
  private drawnCards: CardInstance[] = [];
  private currentCardIdx = 0;
  private state: State = 'INSPECT';
  private elapsedTime = 0;

  async init(ctx: SceneContext, params?: unknown): Promise<void> {
    this.ctx = ctx;
    const { packDef } = params as { packDef: PackDefinition };

    const ambient = new THREE.AmbientLight(0xffffff, 2.2);
    const key = new THREE.DirectionalLight(0xfff4e8, 3.5);
    key.position.set(1, 5, 4);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 1.5);
    fill.position.set(-3, 1, 3);
    this.scene.add(ambient, key, fill);

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

  private _pixelToWorld(ctx: SceneContext): number {
    const camZ = ctx.engine.camera.position.z;
    const vFov = THREE.MathUtils.degToRad(ctx.engine.camera.fov);
    return (2 * camZ * Math.tan(vFov / 2)) / window.innerHeight;
  }

  private _enterInspect(ctx: SceneContext): void {
    this.state = 'INSPECT';
    ctx.hud.showCutHint(true);

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
          await this._doCut(cutStart, e.current, result.angle, ctx);
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

  private async _doCut(cutStart: Vec2, cutEnd: Vec2, angle: number, ctx: SceneContext): Promise<void> {
    this.state = 'CUT_ANIM';
    ctx.pointer.on('drag', () => {});
    ctx.pointer.on('dragstart', () => {});
    ctx.pointer.on('dragend', () => {});

    const cutPlane = this._screenLineToCutPlane(cutStart, cutEnd, ctx);
    this.cutTopGroup = this.packMesh.prepareCut(cutPlane);
    this.scene.add(this.cutTopGroup);

    await this.packMesh.animateCut(angle);
    await this.packMesh.animateBodyExit();
    await this._revealCards(ctx);
  }

  private _screenLineToCutPlane(start: Vec2, end: Vec2, ctx: SceneContext): THREE.Plane {
    const startWorld = this._screenToWorldAtZ(start, ctx.engine.camera, 0);
    const endWorld = this._screenToWorldAtZ(end, ctx.engine.camera, 0);
    const cutDir = new THREE.Vector3().subVectors(endWorld, startWorld).normalize();
    let normal = new THREE.Vector3(-cutDir.y, cutDir.x, 0).normalize();
    if (normal.y < 0) normal.negate();
    const mid = new THREE.Vector3().addVectors(startWorld, endWorld).multiplyScalar(0.5);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mid);
  }

  private _screenToWorldAtZ(screen: Vec2, camera: THREE.PerspectiveCamera, targetZ: number): THREE.Vector3 {
    const ndc = new THREE.Vector2(
      (screen.x / window.innerWidth) * 2 - 1,
      -((screen.y / window.innerHeight) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    const t = (targetZ - ray.origin.z) / ray.direction.z;
    return ray.origin.clone().addScaledVector(ray.direction, t);
  }

  private async _revealCards(ctx: SceneContext): Promise<void> {
    this.state = 'REVEALING';
    this.currentCardIdx = 0;

    // Build all cards face-up and position them as a physical stack.
    // card[0] is the top; each subsequent card sits slightly below and behind.
    this.cardMeshes = this.drawnCards.map((card, i) => {
      const cm = new CardMesh(card);
      cm.mesh.position.set(0, -i * STACK_DY, -i * STACK_DZ);
      return cm;
    });

    // Add in reverse order so card[0] is drawn last (on top) within the group.
    this.cardGroup = new THREE.Group();
    [...this.cardMeshes].reverse().forEach((cm) => this.cardGroup!.add(cm.mesh));

    this.cardGroup.position.set(0, -10, 0);
    this.scene.add(this.cardGroup);

    // Whole stack slides up from below as one unit — all cards already face-up.
    await new Promise<void>((resolve) => {
      gsap.to(this.cardGroup!.position, {
        y: 0,
        duration: 0.55,
        ease: 'back.out(1.4)',
        onComplete: resolve,
      });
    });

    this.state = 'SWIPING';
    ctx.hud.showSwipeHint(true);
    this._setupSwipeListeners(ctx);
  }

  private _setupSwipeListeners(ctx: SceneContext): void {
    const cm = this.cardMeshes[this.currentCardIdx];
    const pixToWorld = this._pixelToWorld(ctx);

    const MAX_TILT    = 0.35;
    const TILT_FACTOR = 0.004;
    const THROW_VEL   = 0.5;
    const THROW_DIST  = 0.5;

    const raycaster = new THREE.Raycaster();

    let cardMode: 'idle' | 'rotate' | 'swipe' = 'idle';
    let gestureStart: Vec2 = { x: 0, y: 0 };
    let swipeModeStart: Vec2 = { x: 0, y: 0 };

    ctx.pointer.on('dragstart', (e: DragEvent) => {
      if (this.state !== 'SWIPING') return;
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
        const ndc = ctx.pointer.clientToNDC(e.current);
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);
        const onCard = raycaster.intersectObject(cm.mesh, false).length > 0;

        if (!onCard) {
          // Pointer left the card — transition to free-swipe.
          cardMode = 'swipe';
          swipeModeStart = { ...e.current };
          if (this.cardGroup) {
            gsap.killTweensOf(this.cardGroup.rotation);
            gsap.to(this.cardGroup.rotation, { x: 0, y: 0, z: 0, duration: 0.15, ease: 'power2.out' });
          }
          // Fall through so position update runs on this event.
        } else {
          // Tilt the entire stack together to avoid clipping between cards.
          if (this.cardGroup) {
            this.cardGroup.rotation.y = clamp( offsetX * TILT_FACTOR, -MAX_TILT, MAX_TILT);
            this.cardGroup.rotation.x = clamp(-offsetY * TILT_FACTOR, -MAX_TILT, MAX_TILT);
          }
          return;
        }
      }

      // Swipe: only the top card follows the pointer; the rest of the stack stays.
      const swOffX = e.current.x - swipeModeStart.x;
      const swOffY = e.current.y - swipeModeStart.y;
      cm.mesh.position.x = swOffX * pixToWorld;
      cm.mesh.position.y = -swOffY * pixToWorld;
    });

    ctx.pointer.on('dragend', (e: DragEvent) => {
      if (this.state !== 'SWIPING') return;
      if (cardMode === 'idle') return;

      if (cardMode === 'rotate') {
        if (this.cardGroup) {
          gsap.to(this.cardGroup.rotation, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'power2.out' });
        }
        cardMode = 'idle';
        return;
      }

      const vel = GestureDetector.swipeVelocity2D(e.positions, e.timestamps);
      const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      const distFromCenter = Math.sqrt(cm.mesh.position.x ** 2 + cm.mesh.position.y ** 2);
      cardMode = 'idle';

      if (velMag > THROW_VEL || distFromCenter > THROW_DIST) {
        this._throwCard(vel, ctx);
      } else {
        gsap.killTweensOf(cm.mesh.position);
        gsap.to(cm.mesh.position, { x: 0, y: 0, duration: 0.3, ease: 'back.out(1.2)' });
        if (this.cardGroup) {
          gsap.to(this.cardGroup.rotation, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'power2.out' });
        }
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

    // Extract card from the group so it can fly freely in world space.
    if (this.cardGroup && cm.mesh.parent === this.cardGroup) {
      const worldPos   = new THREE.Vector3();
      const worldQuat  = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      cm.mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      this.cardGroup.remove(cm.mesh);
      this.scene.add(cm.mesh);
      cm.mesh.position.copy(worldPos);
      cm.mesh.quaternion.copy(worldQuat);
      cm.mesh.scale.copy(worldScale);
    }

    const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    let nx: number, ny: number;
    if (velMag > 0.01) {
      nx = vel.x / velMag;
      ny = vel.y / velMag;
    } else {
      const posLen = Math.sqrt(cm.mesh.position.x ** 2 + cm.mesh.position.y ** 2) || 1;
      nx =  cm.mesh.position.x / posLen;
      ny = -cm.mesh.position.y / posLen;
    }

    gsap.killTweensOf(cm.mesh.position);
    gsap.killTweensOf(cm.mesh.rotation);

    await new Promise<void>((resolve) => {
      gsap.to(cm.mesh.position, {
        x: cm.mesh.position.x + nx * 18,
        y: cm.mesh.position.y - ny * 18,
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

    // Slide remaining cards so the new top card settles at (0, 0, 0).
    if (this.cardGroup) {
      this.cardMeshes.slice(this.currentCardIdx).forEach((nextCm, relIdx) => {
        gsap.to(nextCm.mesh.position, {
          y: -relIdx * STACK_DY,
          z: -relIdx * STACK_DZ,
          duration: 0.22,
          ease: 'back.out(1.3)',
        });
      });
    }

    if (this.currentCardIdx >= this.cardMeshes.length) {
      await this._showSummary(ctx);
      return;
    }

    // Let the restack settle before re-enabling swipe.
    await new Promise((resolve) => setTimeout(resolve, 180));

    this.state = 'SWIPING';
    ctx.hud.showSwipeHint(true);
    this._setupSwipeListeners(ctx);
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
    // Remove each card from whatever parent it has (scene or cardGroup).
    this.cardMeshes.forEach((cm) => {
      if (cm.mesh.parent) cm.mesh.parent.remove(cm.mesh);
      cm.dispose();
    });
    this.cardMeshes = [];
    if (this.cardGroup) {
      this.scene.remove(this.cardGroup);
      this.cardGroup = null;
    }
    if (this.cutTopGroup) {
      this.scene.remove(this.cutTopGroup);
      this.cutTopGroup = null;
    }
    this.packMesh?.dispose();
    super.dispose();
  }
}
