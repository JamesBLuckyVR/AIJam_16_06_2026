import * as THREE from 'three';
import gsap from 'gsap';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';
import { PackMesh } from '../rendering/PackMesh.js';
import type { PackDefinition } from '../types/index.js';

const PAGE_SIZE = 6;
// Packs lie flat: thickness is 0.05, so centre sits 0.025 above the table surface.
const TABLE_Y = -2.5 + 0.025;

// 10 fixed spawn slots arranged across the table in three loose rows.
// rot is the resting Z rotation (slight tilt for a natural scattered look).
const SPAWN_POINTS = [
  { x: -4.2, z: -1.8, rot: -0.12 },
  { x: -1.6, z: -2.0, rot:  0.09 },
  { x:  1.0, z: -1.7, rot: -0.16 },
  { x:  3.8, z: -1.9, rot:  0.20 },
  { x: -3.2, z:  0.3, rot:  0.11 },
  { x:  0.1, z:  0.0, rot: -0.18 },
  { x:  3.0, z:  0.5, rot:  0.07 },
  { x: -4.0, z:  2.1, rot: -0.13 },
  { x:  0.6, z:  2.4, rot:  0.17 },
  { x:  3.6, z:  1.9, rot: -0.08 },
] as const;

export class PackShelfScene extends BaseScene {
  private packMeshes: PackMesh[] = [];
  private raycaster = new THREE.Raycaster();
  private currentPage = 0;
  private ownedPacks: Array<{ id: string; def: PackDefinition }> = [];
  private _animating = false;
  private _prevBtn: HTMLElement | null = null;
  private _nextBtn: HTMLElement | null = null;

  async init(ctx: SceneContext): Promise<void> {
    this.ctx = ctx;

    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    const key = new THREE.DirectionalLight(0xfff4e8, 3.0);
    key.position.set(2, 6, 5);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2);
    fill.position.set(-4, 2, 3);
    this.scene.add(ambient, key, fill);

    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.5;
    this.scene.add(floor);

    // Angled top-down view so the flat packs read clearly on the table
    ctx.engine.camera.position.set(0, 5, 9);
    ctx.engine.camera.lookAt(0, -2, 0);

    ctx.hud.setSceneTitle('Your Packs');
    ctx.hud.clearButtons();
    ctx.hud.addButton('← Back', () => ctx.goto('room'));

    this._buildOwnedList(ctx);

    if (this.ownedPacks.length === 0) {
      ctx.hud.addButton('Go buy some packs!', () => ctx.goto('store-select'), 'primary');
      return;
    }

    const totalPages = Math.ceil(this.ownedPacks.length / PAGE_SIZE);
    if (totalPages > 1) {
      this._prevBtn = this._createNavBtn('‹', 'left',  () => this._changePage(-1, ctx));
      this._nextBtn = this._createNavBtn('›', 'right', () => this._changePage( 1, ctx));
      document.body.appendChild(this._prevBtn);
      document.body.appendChild(this._nextBtn);
      this._updateNavButtons();
    }

    this._showPage(ctx, false);

    ctx.pointer.on('tap', (pos: { x: number; y: number }) => this._onTap(pos, ctx));
  }

  // ── Owned pack list ───────────────────────────────────────────────────────

  private _buildOwnedList(ctx: SceneContext): void {
    const defMap = new Map(ctx.packs.map((p) => [p.id, p]));
    this.ownedPacks = ctx.inventory.packIds
      .map((id) => ({ id, def: defMap.get(id)! }))
      .filter((p) => !!p.def);
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  private _changePage(dir: number, ctx: SceneContext): void {
    if (this._animating) return;
    const total = Math.ceil(this.ownedPacks.length / PAGE_SIZE);
    this.currentPage = ((this.currentPage + dir) + total) % total;
    this._updateNavButtons();
    this._showPage(ctx, true);
  }

  private _updateNavButtons(): void {
    const total = Math.ceil(this.ownedPacks.length / PAGE_SIZE);
    const page = this.currentPage;
    if (this._prevBtn) this._prevBtn.style.opacity = total > 1 ? '1' : '0.3';
    if (this._nextBtn) this._nextBtn.style.opacity = total > 1 ? '1' : '0.3';
    // Dim the relevant button at the boundary (wrapping is still allowed)
    if (this._prevBtn) this._prevBtn.style.opacity = page === 0 ? '0.45' : '1';
    if (this._nextBtn) this._nextBtn.style.opacity = page === total - 1 ? '0.45' : '1';
  }

  private _showPage(ctx: SceneContext, animate: boolean): void {
    // Clamp in case a pack was opened and we're now past the last page
    const total = Math.ceil(this.ownedPacks.length / PAGE_SIZE) || 1;
    this.currentPage = Math.min(this.currentPage, total - 1);

    const spawns = this._shuffleSpawns();
    const start  = this.currentPage * PAGE_SIZE;
    const items  = this.ownedPacks.slice(start, start + PAGE_SIZE);

    const pageLabel = total > 1
      ? `Your Packs  (${this.currentPage + 1} / ${total})`
      : 'Your Packs';
    ctx.hud.setSceneTitle(pageLabel);

    if (animate) {
      this._animating = true;
      this._animateOut().then(() => {
        this._clearMeshes();
        this._spawnPacks(items, spawns, ctx, true);
      });
    } else {
      this._clearMeshes();
      this._spawnPacks(items, spawns, ctx, false);
    }
  }

  // ── Spawn-point helpers ───────────────────────────────────────────────────

  private _shuffleSpawns(): typeof SPAWN_POINTS[number][] {
    const arr = [...SPAWN_POINTS] as typeof SPAWN_POINTS[number][];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Mesh lifecycle ────────────────────────────────────────────────────────

  private _animateOut(): Promise<void> {
    return new Promise((resolve) => {
      if (this.packMeshes.length === 0) { resolve(); return; }
      const tl = gsap.timeline({ onComplete: resolve });
      this.packMeshes.forEach((pm, i) => {
        const delay = i * 0.04;
        tl.to(pm.group.position, { y: TABLE_Y + 5, duration: 0.22, ease: 'power2.in' }, delay);
        tl.to(pm.group.rotation, {
          z: pm.group.rotation.z + (Math.random() - 0.5) * 0.6,
          duration: 0.22,
          ease: 'power1.in',
        }, delay);
      });
    });
  }

  private _clearMeshes(): void {
    this.packMeshes.forEach((pm) => {
      this.scene.remove(pm.group);
      pm.dispose();
    });
    this.packMeshes = [];
    this._animating = false;
  }

  private _spawnPacks(
    items: Array<{ id: string; def: PackDefinition }>,
    spawns: typeof SPAWN_POINTS[number][],
    ctx: SceneContext,
    animate: boolean,
  ): void {
    items.forEach((item, i) => {
      const spawn = spawns[i];
      const pm = new PackMesh(item.def);

      // Lay flat face-up on the table
      pm.group.rotation.x = -Math.PI / 2;
      pm.group.rotation.z = spawn.rot;
      pm.group.userData['packId']  = item.id;
      pm.group.userData['packDef'] = item.def;

      if (animate) {
        // Start below the table surface, bounce up to resting position
        pm.group.position.set(spawn.x, TABLE_Y - 5, spawn.z);
        this.scene.add(pm.group);
        gsap.to(pm.group.position, {
          y: TABLE_Y,
          duration: 0.45,
          delay: i * 0.06,
          ease: 'back.out(1.8)',
        });
      } else {
        pm.group.position.set(spawn.x, TABLE_Y, spawn.z);
        this.scene.add(pm.group);
      }

      this.packMeshes.push(pm);
    });
  }

  // ── Tap to open ───────────────────────────────────────────────────────────

  private _onTap(pos: { x: number; y: number }, ctx: SceneContext): void {
    if (this._animating) return;

    const ndc = ctx.pointer.clientToNDC(pos);
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);

    const meshes: THREE.Object3D[] = [];
    this.packMeshes.forEach((pm) => {
      pm.group.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c); });
    });

    const hits = this.raycaster.intersectObjects(meshes);
    if (hits.length === 0) return;

    let obj = hits[0].object;
    while (obj.parent && !obj.userData['packId']) obj = obj.parent;
    if (!obj.userData['packId']) return;

    const packId  = obj.userData['packId'] as string;
    const packDef = obj.userData['packDef'] as PackDefinition;

    // Little hop up, then navigate
    this._animating = true;
    gsap.to(obj.position, { y: TABLE_Y + 1.8, duration: 0.25, ease: 'back.out(2)', onComplete: () => {
      ctx.inventory.removePack(packId);
      ctx.save();
      ctx.goto('pack-opening', { packDef });
    }});
  }

  // ── Nav button DOM helpers ────────────────────────────────────────────────

  private _createNavBtn(label: string, side: 'left' | 'right', onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'position: fixed',
      `${side}: 18px`,
      'top: 50%',
      'transform: translateY(-50%)',
      'background: rgba(255,255,255,0.12)',
      'border: 1px solid rgba(255,255,255,0.28)',
      'color: #fff',
      'font-size: 44px',
      'line-height: 1',
      'padding: 10px 16px',
      'border-radius: 10px',
      'cursor: pointer',
      'pointer-events: auto',
      'z-index: 200',
      'backdrop-filter: blur(6px)',
      'transition: background 0.15s, opacity 0.2s',
      'user-select: none',
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.25)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)'; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Overrides ─────────────────────────────────────────────────────────────

  update(_delta: number): void {}

  dispose(): void {
    this._prevBtn?.remove();
    this._nextBtn?.remove();
    this._prevBtn = null;
    this._nextBtn = null;
    this.packMeshes.forEach((pm) => pm.dispose());
    this.packMeshes = [];
    super.dispose();
  }
}
