import * as THREE from 'three';
import type { CardDefinition, PackDefinition } from '../types/index.js';
import { CardRarity, RARITY_COLORS, RARITY_GLOW } from '../types/index.js';

const CARD_W = 512;
const CARD_H = 716;

const PACK_W = 256;
const PACK_H = 512;

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  const hue = ((h >>> 0) % 360);
  return `hsl(${hue},60%,40%)`;
}

export class TextureGenerator {
  private static _cardCache = new Map<string, THREE.CanvasTexture>();
  private static _packCache = new Map<string, THREE.CanvasTexture>();
  private static _backTexture: THREE.CanvasTexture | null = null;

  static getCardFace(card: CardDefinition): THREE.CanvasTexture {
    const key = `${card.id}`;
    if (this._cardCache.has(key)) return this._cardCache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d')!;

    const bg = hashColor(card.id);
    const rarityColor = RARITY_COLORS[card.rarity as CardRarity] ?? '#888';
    const glow = RARITY_GLOW[card.rarity as CardRarity] ?? 'transparent';

    const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, CARD_W - 12, CARD_H - 12);

    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, CARD_W - 40, CARD_H - 40);
    ctx.shadowBlur = 0;

    const centerY = CARD_H * 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(CARD_W / 2, centerY, 100, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.name, CARD_W / 2, centerY);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText(card.rarity, CARD_W / 2, centerY + 40);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.fillText(`$${card.baseCost.toFixed(2)}`, CARD_W / 2, CARD_H - 60);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '14px monospace';
    ctx.fillText(`#${card.id}`, CARD_W / 2, CARD_H - 30);

    const tex = new THREE.CanvasTexture(canvas);
    this._cardCache.set(key, tex);
    return tex;
  }

  static getCardBack(): THREE.CanvasTexture {
    if (this._backTexture) return this._backTexture;

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    grad.addColorStop(0, '#1a1a3e');
    grad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.strokeStyle = '#3a3a6e';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, CARD_W - 12, CARD_H - 12);

    const size = 40;
    ctx.strokeStyle = 'rgba(100,100,180,0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CARD_W; x += size) {
      for (let y = 0; y < CARD_H; y += size) {
        ctx.strokeRect(x, y, size, size);
      }
    }

    ctx.fillStyle = 'rgba(138,43,226,0.5)';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', CARD_W / 2, CARD_H / 2);

    this._backTexture = new THREE.CanvasTexture(canvas);
    return this._backTexture;
  }

  static getPackFace(pack: PackDefinition): THREE.CanvasTexture {
    if (this._packCache.has(pack.id)) return this._packCache.get(pack.id)!;

    const canvas = document.createElement('canvas');
    canvas.width = PACK_W;
    canvas.height = PACK_H;
    const ctx = canvas.getContext('2d')!;

    const bg = hashColor(pack.id + 'pack');
    const grad = ctx.createLinearGradient(0, 0, PACK_W, PACK_H);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PACK_W, PACK_H);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, PACK_W - 8, PACK_H - 8);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = pack.displayName.split(' ');
    let lineY = PACK_H / 2 - 10;
    words.forEach((word, i) => {
      ctx.fillText(word, PACK_W / 2, lineY + i * 28);
    });

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText(`$${pack.cost.toFixed(2)}`, PACK_W / 2, PACK_H - 40);

    const tex = new THREE.CanvasTexture(canvas);
    this._packCache.set(pack.id, tex);
    return tex;
  }

  static disposeAll(): void {
    this._cardCache.forEach((t) => t.dispose());
    this._cardCache.clear();
    this._packCache.forEach((t) => t.dispose());
    this._packCache.clear();
    this._backTexture?.dispose();
    this._backTexture = null;
  }
}
