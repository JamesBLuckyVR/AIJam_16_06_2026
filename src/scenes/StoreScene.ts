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

  async init(ctx: SceneContext, params?: unknown): Promise<void> {
    this.ctx = ctx;
    this.store = (params as { store: StoreDefinition }).store;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const point = new THREE.PointLight(0xfff0e0, 2, 20);
    point.position.set(0, 6, 3);
    this.scene.add(ambient, point);

    ctx.engine.camera.position.set(0, 1.5, 7);
    ctx.engine.camera.lookAt(0, 0, 0);

    this._buildCounter();
    this._buildInventory(ctx);

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
      pm.group.position.set(x, 0, 0);
      pm.group.rotation.y = 0.2;
      pm.group.scale.setScalar(0.7);
      this.scene.add(pm.group);
      this.packMeshes.push(pm);

      const price = ctx.market.getPackPrice(packDef, this.store);
      const worldPos = new THREE.Vector3(x, 1.4, 0);
      const label = ctx.hud.addPriceLabel(`${packDef.displayName}\n$${price.toFixed(2)}`, 0, 0, () => {
        this._buyPack(packDef, price, ctx);
      });

      this.items.push({ mesh: pm.group, priceLabel: label, worldPos, price, type: 'pack', packDef });
    });
  }

  private _onTap(pos: { x: number; y: number }, ctx: SceneContext): void {
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
    const cards = ctx.inventory.cards;
    if (cards.length === 0) {
      ctx.hud.clearButtons();
      ctx.hud.addButton('No cards to sell', () => {});
      ctx.hud.addButton('← Back', () => {
        ctx.hud.clearPriceLabels();
        ctx.goto('store-select');
      });
      return;
    }

    ctx.hud.clearButtons();
    ctx.hud.addButton('← Cancel', () => {
      ctx.hud.clearButtons();
      ctx.hud.addButton('← Back', () => {
        ctx.hud.clearPriceLabels();
        ctx.goto('store-select');
      });
      ctx.hud.addButton('Sell Cards', () => this._openSellPanel(ctx));
    });

    cards.slice(0, 6).forEach((card) => {
      const buyPrice = ctx.market.getBuyPrice(card.definition, this.store);
      ctx.hud.addButton(
        `${card.displayName} → $${buyPrice.toFixed(2)}`,
        () => this._sellCard(card, buyPrice, ctx),
      );
    });
  }

  private _sellCard(card: CardInstance, price: number, ctx: SceneContext): void {
    ctx.inventory.removeCard(card.instanceId);
    ctx.inventory.earn(price);
    ctx.save();
    ctx.hud.setMoney(ctx.inventory.money);
    this._openSellPanel(ctx);
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
    this.packMeshes.forEach((pm) => pm.dispose());
    this.cardMeshes.forEach((cm) => cm.dispose());
    this.packMeshes = [];
    this.cardMeshes = [];
    this.items = [];
    super.dispose();
  }
}
