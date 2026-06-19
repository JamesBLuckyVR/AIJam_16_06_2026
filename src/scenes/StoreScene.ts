import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import type { SceneContext } from './BaseScene.js';
import { PackMesh } from '../rendering/PackMesh.js';
import { CardMesh } from '../rendering/CardMesh.js';
import type { StoreDefinition, PackDefinition } from '../types/index.js';
import type { CardInstance } from '../entities/Card.js';

interface StoreItem {
  mesh: THREE.Object3D;
  priceLabel: HTMLElement;
  worldPos: THREE.Vector3;
  price: number;
  type: 'pack' | 'card';
  packDef?: PackDefinition;
  cardInstance?: CardInstance;
}

export class StoreScene extends BaseScene {
  private store!: StoreDefinition;
  private items: StoreItem[] = [];
  private raycaster = new THREE.Raycaster();
  private packMeshes: PackMesh[] = [];
  private cardMeshes: CardMesh[] = [];
  private _sellPanelEl: HTMLElement | null = null;
  private _sellPanelOpen = false;

  async init(ctx: SceneContext, params?: unknown): Promise<void> {
    this.ctx = ctx;
    this.store = (params as { store: StoreDefinition }).store;

    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    const point = new THREE.PointLight(0xfff0e0, 5.0, 25);
    point.position.set(0, 6, 3);
    this.scene.add(ambient, point);

    ctx.engine.camera.position.set(0, 4.8, 5.3);
    ctx.engine.camera.lookAt(0, -0.7, 0);

    this._buildCounter();
    this._buildInventory(ctx);

    document.getElementById('room-bg')!.style.background =
      `url('${import.meta.env.BASE_URL}assets/scene/shop.png') center/cover no-repeat`;

    ctx.hud.setSceneTitle(this.store.displayName);
    ctx.hud.clearButtons();
    ctx.hud.addButton('← Back', () => {
      ctx.hud.clearPriceLabels();
      ctx.goto('store-select');
    });
    ctx.hud.addButton('Sell Cards', () => this._openSellPanel(ctx));

    ctx.pointer.on('tap', (pos) => this._onTap(pos, ctx));
  }

  private _buildCounter(): void {
    const counterGeo = new THREE.BoxGeometry(12, 0.15, 3);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3e, roughness: 0.3, metalness: 0.4 });
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(0, -0.8, 0);
    this.scene.add(counter);

    const glassGeo = new THREE.BoxGeometry(12, 0.02, 3);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.18,
      roughness: 0,
      metalness: 0.1,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, -0.72, 0);
    this.scene.add(glass);
  }

  private _buildInventory(ctx: SceneContext): void {
    const availablePacks = ctx.packs.filter((p) => this.store.inventory.includes(p.id));

    availablePacks.forEach((packDef, i) => {
      const pm = new PackMesh(packDef);
      const x = (i - (availablePacks.length - 1) / 2) * 3;
      // Lay flat face-up on the counter surface (top at y = -0.8 + 0.075 = -0.725)
      pm.group.rotation.x = -Math.PI / 2;
      pm.group.rotation.z = (i % 2 === 0 ? 0.08 : -0.06);
      pm.group.position.set(x, -0.70, 0.2);
      pm.group.scale.setScalar(0.7);
      this.scene.add(pm.group);
      this.packMeshes.push(pm);

      const price = ctx.market.getPackPrice(packDef, this.store);
      const worldPos = new THREE.Vector3(x, 0.2, 1.2);
      const label = ctx.hud.addPriceLabel(`${packDef.displayName}\n$${price.toFixed(2)}`, 0, 0, () => {
        this._buyPack(packDef, price, ctx);
      });

      this.items.push({ mesh: pm.group, priceLabel: label, worldPos, price, type: 'pack', packDef });
    });
  }

  private _onTap(pos: { x: number; y: number }, ctx: SceneContext): void {
    if (this._sellPanelOpen) return;
    const ndc = ctx.pointer.clientToNDC(pos);
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), ctx.engine.camera);

    const meshList: THREE.Object3D[] = [];
    this.packMeshes.forEach((pm) => pm.group.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshList.push(c); }));
    this.cardMeshes.forEach((cm) => meshList.push(cm.mesh));

    const hits = this.raycaster.intersectObjects(meshList);
    if (hits.length === 0) return;

    const hit = hits[0].object;
    const item = this.items.find((it) => {
      let o: THREE.Object3D | null = hit;
      while (o) {
        if (o === it.mesh) return true;
        o = o.parent;
      }
      return false;
    });
    if (!item) return;

    if (item.type === 'pack' && item.packDef) {
      this._buyPack(item.packDef, item.price, ctx);
    }
  }

  private _buyPack(packDef: PackDefinition, price: number, ctx: SceneContext): void {
    if (!ctx.inventory.canAfford(price)) {
      ctx.hud.clearButtons();
      ctx.hud.addButton(`Not enough money! (Need $${price.toFixed(2)})`, () => {});
      ctx.hud.addButton('← Back', () => {
        ctx.hud.clearPriceLabels();
        ctx.goto('store-select');
      });
      return;
    }
    ctx.inventory.spend(price);
    ctx.inventory.addPack(packDef.id);
    ctx.save();
    ctx.hud.setMoney(ctx.inventory.money);
    ctx.hud.clearButtons();
    ctx.hud.addButton(`Bought ${packDef.displayName}!`, () => {});
    ctx.hud.addButton('← Keep Shopping', () => {
      ctx.hud.clearPriceLabels();
      ctx.goto('store-select');
    });
    ctx.hud.addButton('Open My Packs', () => {
      ctx.hud.clearPriceLabels();
      ctx.goto('pack-shelf');
    }, 'primary');
  }

  private _openSellPanel(ctx: SceneContext): void {
    this._closeSellPanel();
    this._sellPanelOpen = true;

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position:fixed;inset:0;z-index:50;
      background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
    `;

    // Panel box
    const panel = document.createElement('div');
    panel.style.cssText = `
      background:#1a1a2e;
      border:1px solid rgba(255,255,255,0.15);
      border-radius:12px;
      width:min(420px,90vw);
      max-height:70vh;
      display:flex;flex-direction:column;
      box-shadow:0 8px 32px rgba(0,0,0,0.7);
      overflow:hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 18px;
      border-bottom:1px solid rgba(255,255,255,0.1);
      flex-shrink:0;
    `;
    const title = document.createElement('span');
    title.textContent = 'Sell Cards';
    title.style.cssText = 'color:#fff;font-size:16px;font-weight:700;font-family:"Segoe UI",sans-serif;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background:none;border:none;color:rgba(255,255,255,0.6);
      font-size:18px;cursor:pointer;padding:0 4px;line-height:1;
    `;
    closeBtn.addEventListener('click', () => this._closeSellPanel());
    header.append(title, closeBtn);

    // Scrollable list
    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;flex:1;padding:8px 0;';

    const cards = ctx.inventory.cards;
    if (cards.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No cards to sell.';
      empty.style.cssText = 'color:rgba(255,255,255,0.5);text-align:center;padding:24px;font-family:"Segoe UI",sans-serif;';
      list.appendChild(empty);
    } else {
      // Group by defId+foilType, sort by price descending
      const groups = new Map<string, { card: CardInstance; price: number; count: number }>();
      for (const card of cards) {
        const key = `${card.definition.id}_${card.foilType}`;
        if (groups.has(key)) {
          groups.get(key)!.count++;
        } else {
          const price = ctx.market.getBuyPrice(card.definition, this.store);
          groups.set(key, { card, price, count: 1 });
        }
      }
      const sorted = [...groups.values()].sort((a, b) => b.price - a.price);

      sorted.forEach(({ card, price, count }) => {
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;align-items:center;gap:10px;
          padding:10px 18px;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-family:"Segoe UI",sans-serif;
        `;

        const nameEl = document.createElement('span');
        nameEl.textContent = card.displayName;
        nameEl.style.cssText = 'color:#e8e8f0;font-size:14px;flex:1;';

        if (count > 1) {
          const badge = document.createElement('span');
          badge.textContent = `x${count}`;
          badge.style.cssText = `
            background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);
            font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;
          `;
          row.appendChild(nameEl);
          row.appendChild(badge);
        } else {
          row.appendChild(nameEl);
        }

        const priceEl = document.createElement('span');
        priceEl.textContent = `$${price.toFixed(2)}`;
        priceEl.style.cssText = 'color:#7dffb0;font-size:14px;font-weight:600;min-width:52px;text-align:right;';

        const sellBtn = document.createElement('button');
        sellBtn.textContent = 'Sell';
        sellBtn.style.cssText = `
          background:#2a5c3f;color:#7dffb0;border:1px solid #3a8c5f;
          border-radius:6px;padding:5px 14px;font-size:13px;font-weight:600;
          cursor:pointer;font-family:"Segoe UI",sans-serif;
          transition:background 0.15s;
        `;
        sellBtn.addEventListener('mouseenter', () => { sellBtn.style.background = '#3a7c4f'; });
        sellBtn.addEventListener('mouseleave', () => { sellBtn.style.background = '#2a5c3f'; });
        sellBtn.addEventListener('click', () => {
          ctx.inventory.removeCard(card.instanceId);
          ctx.inventory.earn(price);
          ctx.save();
          ctx.hud.setMoney(ctx.inventory.money);
          this._openSellPanel(ctx);
        });

        row.append(priceEl, sellBtn);
        list.appendChild(row);
      });
    }

    panel.append(header, list);
    backdrop.appendChild(panel);
    // Close on backdrop click (but not panel click)
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this._closeSellPanel(); });
    document.body.appendChild(backdrop);
    this._sellPanelEl = backdrop;
  }

  private _closeSellPanel(): void {
    if (this._sellPanelEl) {
      this._sellPanelEl.remove();
      this._sellPanelEl = null;
    }
    this._sellPanelOpen = false;
  }

  update(_delta: number): void {
    this.items.forEach((item) => {
      const projected = item.worldPos.clone().project(this.ctx.engine.camera);
      const x = ((projected.x + 1) / 2) * window.innerWidth;
      const y = ((-projected.y + 1) / 2) * window.innerHeight;
      this.ctx.hud.updatePriceLabelPosition(item.priceLabel, x, y);
    });
  }

  dispose(): void {
    this._closeSellPanel();
    this.packMeshes.forEach((pm) => pm.dispose());
    this.cardMeshes.forEach((cm) => cm.dispose());
    this.packMeshes = [];
    this.cardMeshes = [];
    this.items = [];
    super.dispose();
  }
}
