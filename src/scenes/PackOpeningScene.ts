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
const STACK_DY = 0.015;
const STACK_DZ = 0.012;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  age: number; maxLife: number;
  size: number;
  r: number; g: number; b: number;
}

export class PackOpeningScene extends BaseScene {
  private packMesh!: PackMesh;
  private cutTopGroup: THREE.Group | null = null;
  private cardGroup: THREE.Group | null = null;
  private cardMeshes: CardMesh[] = [];
  private drawnCards: CardInstance[] = [];
  private currentCardIdx = 0;
  private state: State = 'INSPECT';
  private elapsedTime = 0;

  // VFX
  private _vfxCanvas: HTMLCanvasElement | null = null;
  private _vfxCtx: CanvasRenderingContext2D | null = null;
  private _vfxResizeHandler: (() => void) | null = null;
  private _particles: Particle[] = [];
  private _cutLineStart: Vec2 | null = null;
  private _cutLineCurrent: Vec2 | null = null;
  private _vfxTime = 0;

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

    document.getElementById('scene-dim')!.style.background = 'rgba(0,0,0,0.35)';

    this._enterInspect(ctx);
    this._initVfx();

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
    // Tracks when the drag has first crossed onto the pack surface.
    let cutLineActive = false;
    let prevCutPos: Vec2 | null = null;
    let edgeEntryPoint: Vec2 | null = null;

    ctx.pointer.on('dragstart', (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      const bounds = this._getPackScreenBounds(ctx);
      if (GestureDetector.isInPackInnerZone(e.start, bounds)) {
        packMode = 'rotate';
      } else {
        packMode = 'cut';
        cutStart = { ...e.start };
        cutLineActive = false;
        prevCutPos = { ...e.start };
        edgeEntryPoint = null;
      }
    });

    ctx.pointer.on('drag', (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      if (packMode === 'rotate') {
        this.packMesh.group.rotation.y += e.delta.x * 0.008;
        this.packMesh.group.rotation.x += e.delta.y * 0.008;
        this.packMesh.group.rotation.x = clamp(this.packMesh.group.rotation.x, -0.8, 0.8);
      } else if (packMode === 'cut' && cutStart) {
        const bounds = this._getPackScreenBounds(ctx);
        const inBounds = (p: Vec2) =>
          p.x >= bounds.left && p.x <= bounds.right &&
          p.y >= bounds.top  && p.y <= bounds.bottom;

        if (!cutLineActive && inBounds(e.current)) {
          // Pointer just crossed onto the pack — find the precise edge entry point.
          const entry = prevCutPos
            ? (this._lineRectEntry(prevCutPos, e.current, bounds) ?? e.current)
            : e.current;
          edgeEntryPoint = entry;
          cutLineActive = true;
          this._cutLineStart   = { ...entry };
          this._cutLineCurrent = { ...e.current };
          this._emitSparks(entry.x, entry.y, 3);
        } else if (cutLineActive) {
          // Clip the visible line end to the far edge of the pack.
          // If the pointer is still inside, use it directly; if past the edge, project to exit.
          let lineEnd: Vec2;
          if (inBounds(e.current)) {
            lineEnd = { ...e.current };
          } else if (this._cutLineStart) {
            lineEnd = this._lineRectExit(this._cutLineStart, e.current, bounds) ?? { ...e.current };
          } else {
            lineEnd = { ...e.current };
          }
          this._cutLineCurrent = lineEnd;
          // Sparks only play while the pointer is over the pack surface.
          if (inBounds(e.current)) {
            this._emitSparks(e.current.x, e.current.y, 2);
          }
        }

        prevCutPos = { ...e.current };
      }
    });

    ctx.pointer.on('dragend', async (e: DragEvent) => {
      if (this.state !== 'INSPECT') return;
      if (packMode === 'cut' && cutStart) {
        const bounds = this._getPackScreenBounds(ctx);
        const result = GestureDetector.detectCut(cutStart, e.current, bounds);
        if (result.isCut) {
          const burstStart = edgeEntryPoint ?? cutStart;
          // Burst along the clipped visible line, not beyond the pack edge.
          const burstEnd = this._cutLineCurrent ?? e.current;
          this._emitLineBurst(burstStart, burstEnd);
          this._cutLineStart = null;
          this._cutLineCurrent = null;
          ctx.hud.showCutHint(false);
          await this._doCut(burstStart, e.current, result.angle, ctx);
        } else {
          this._cutLineStart = null;
          this._cutLineCurrent = null;
        }
      }
      packMode = null;
      cutStart = null;
      cutLineActive = false;
      prevCutPos = null;
      edgeEntryPoint = null;
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
        const hits = raycaster.intersectObject(cm.mesh, false);
        const EDGE = 0.10;
        const inEdgeZone = hits.length === 0 || (() => {
          const uv = hits[0].uv;
          return !uv || uv.x < EDGE || uv.x > 1 - EDGE || uv.y < EDGE || uv.y > 1 - EDGE;
        })();

        if (inEdgeZone) {
          // Pointer reached the outer 10% of the card — transition to free-swipe.
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

  // Returns the point where the segment from→to first crosses into the rect.
  private _lineRectEntry(
    from: Vec2, to: Vec2,
    b: { left: number; right: number; top: number; bottom: number },
  ): Vec2 | null {
    const dx = to.x - from.x, dy = to.y - from.y;
    let bestT = Infinity;
    const check = (t: number) => {
      if (t <= 0 || t > 1 || t >= bestT) return;
      const x = from.x + dx * t, y = from.y + dy * t;
      if (x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1) bestT = t;
    };
    if (Math.abs(dx) > 0.001) { check((b.left  - from.x) / dx); check((b.right  - from.x) / dx); }
    if (Math.abs(dy) > 0.001) { check((b.top   - from.y) / dy); check((b.bottom - from.y) / dy); }
    if (!isFinite(bestT)) return null;
    return { x: from.x + dx * bestT, y: from.y + dy * bestT };
  }

  // Returns where the ray from→(direction of to) exits the rect on the far side.
  // `from` is assumed to be on or inside the rect boundary.
  private _lineRectExit(
    from: Vec2, to: Vec2,
    b: { left: number; right: number; top: number; bottom: number },
  ): Vec2 | null {
    const dx = to.x - from.x, dy = to.y - from.y;
    let bestT = Infinity;
    // Skip t values very close to 0 (the entry edge we're already on).
    const check = (t: number) => {
      if (t <= 0.005 || t >= bestT) return;
      const x = from.x + dx * t, y = from.y + dy * t;
      if (x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1) bestT = t;
    };
    if (Math.abs(dx) > 0.001) { check((b.left  - from.x) / dx); check((b.right  - from.x) / dx); }
    if (Math.abs(dy) > 0.001) { check((b.top   - from.y) / dy); check((b.bottom - from.y) / dy); }
    if (!isFinite(bestT)) return null;
    return { x: from.x + dx * bestT, y: from.y + dy * bestT };
  }

  private _initVfx(): void {
    this._vfxCanvas = document.getElementById('vfx-canvas') as HTMLCanvasElement;
    const resize = () => {
      if (!this._vfxCanvas) return;
      this._vfxCanvas.width  = window.innerWidth;
      this._vfxCanvas.height = window.innerHeight;
      this._vfxCtx = this._vfxCanvas.getContext('2d');
    };
    resize();
    this._vfxResizeHandler = resize;
    window.addEventListener('resize', resize);
  }

  private _emitSparks(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 130;
      // Alternate between hot pink and electric purple.
      const pink = Math.random() < 0.55;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        age: 0,
        maxLife: 0.30 + Math.random() * 0.35,
        size: 1.5 + Math.random() * 2.0,
        r: pink ? 255 : Math.floor(160 + Math.random() * 60),
        g: pink ? Math.floor(60  + Math.random() * 80) : Math.floor(20 + Math.random() * 60),
        b: pink ? Math.floor(180 + Math.random() * 55) : 255,
      });
    }
  }

  private _emitLineBurst(start: Vec2, end: Vec2): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const numPoints = Math.max(6, Math.floor(len / 10));
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const px = start.x + dx * t;
      const py = start.y + dy * t;
      for (let j = 0; j < 5; j++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 220;
        const pink = Math.random() < 0.55;
        this._particles.push({
          x: px + (Math.random() - 0.5) * 8,
          y: py + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 70,
          age: 0,
          maxLife: 0.4 + Math.random() * 0.5,
          size: 2.0 + Math.random() * 2.5,
          r: pink ? 255 : Math.floor(160 + Math.random() * 60),
          g: pink ? Math.floor(50  + Math.random() * 80) : Math.floor(20 + Math.random() * 60),
          b: pink ? Math.floor(170 + Math.random() * 60) : 255,
        });
      }
    }
  }

  private _updateVfx(delta: number): void {
    const ctx2d = this._vfxCtx;
    const canvas = this._vfxCanvas;
    if (!ctx2d || !canvas) return;

    this._vfxTime += delta;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);

    // Particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.age += delta;
      if (p.age >= p.maxLife) { this._particles.splice(i, 1); continue; }
      const life = 1 - p.age / p.maxLife;
      p.x  += p.vx * delta;
      p.y  += p.vy * delta;
      p.vy += 550 * delta;    // gravity
      p.vx *= Math.pow(0.88, delta * 60);
      ctx2d.globalAlpha = life * 0.85;
      ctx2d.fillStyle   = `rgb(${p.r},${p.g},${p.b})`;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size * Math.max(0.15, life), 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // Cut guide line — pulsing neon glow
    if (this._cutLineStart && this._cutLineCurrent) {
      // Pulse: slow sine oscillation between thin+dim and thick+bright (period ~1.8 s)
      const pulse = 0.5 + 0.5 * Math.sin(this._vfxTime * (Math.PI * 2 / 1.8));
      const lineW  = 1.0 + pulse * 2.0;       // 1 → 3 px
      const alpha  = 0.45 + pulse * 0.35;     // 0.45 → 0.80
      const blur   = 4  + pulse * 10;         // 4 → 14 px glow radius

      ctx2d.save();
      ctx2d.setLineDash([]);
      ctx2d.lineCap = 'round';

      // Outer soft glow pass
      ctx2d.strokeStyle = `rgba(200, 80, 255, ${(alpha * 0.5).toFixed(2)})`;
      ctx2d.lineWidth   = lineW + 4;
      ctx2d.shadowColor = `rgba(180, 60, 255, ${alpha.toFixed(2)})`;
      ctx2d.shadowBlur  = blur;
      ctx2d.beginPath();
      ctx2d.moveTo(this._cutLineStart.x, this._cutLineStart.y);
      ctx2d.lineTo(this._cutLineCurrent.x, this._cutLineCurrent.y);
      ctx2d.stroke();

      // Inner bright core
      ctx2d.strokeStyle = `rgba(230, 140, 255, ${alpha.toFixed(2)})`;
      ctx2d.lineWidth   = lineW;
      ctx2d.shadowBlur  = blur * 0.5;
      ctx2d.beginPath();
      ctx2d.moveTo(this._cutLineStart.x, this._cutLineStart.y);
      ctx2d.lineTo(this._cutLineCurrent.x, this._cutLineCurrent.y);
      ctx2d.stroke();

      ctx2d.restore();
    }
  }

  update(delta: number): void {
    this.elapsedTime += delta;

    const currentCard = this.cardMeshes[this.currentCardIdx];
    if (currentCard && this.state === 'SWIPING') {
      const orient = this.ctx.orientation;
      currentCard.updateHolo(orient.tiltX, orient.tiltY, this.elapsedTime, this.ctx.engine.camera.position);
    }

    this._updateVfx(delta);
  }

  dispose(): void {
    document.getElementById('scene-dim')!.style.background = 'transparent';
    // Clean up VFX
    if (this._vfxResizeHandler) {
      window.removeEventListener('resize', this._vfxResizeHandler);
      this._vfxResizeHandler = null;
    }
    if (this._vfxCtx && this._vfxCanvas) {
      this._vfxCtx.clearRect(0, 0, this._vfxCanvas.width, this._vfxCanvas.height);
    }
    this._particles = [];
    this._cutLineStart = null;
    this._cutLineCurrent = null;

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
