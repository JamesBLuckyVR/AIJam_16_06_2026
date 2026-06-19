import * as THREE from 'three';
import type { CardDefinition, PackDefinition } from '../types/index.js';
import { CardRarity, RARITY_COLORS } from '../types/index.js';

// Layout zones as fractions of the card template image dimensions.
// These match the visual zones in assets/card/cardfront.png:
//   title bar  — narrow band at the very top
//   art area   — large tinted rectangle in the middle
//   desc area  — smaller rectangle below the art
const TITLE_Y       = 0.078;  // vertical centre of title bar
const TITLE_X_START = 0.095;  // left edge of title text
const TITLE_X_MAX   = 0.78;   // title text truncates here (rarity gem is to the right)
const RARITY_X      = 0.890;  // centre of the circular gem element on the right of title bar
const RARITY_Y      = 0.082;  // vertical centre of the gem
const RARITY_R      = 0.046;  // radius of the rarity dot
const DESC_TOP      = 0.705;  // top of description box
const DESC_BOT      = 0.865;  // bottom of description box
const DESC_X_PAD    = 0.075;  // horizontal padding used for line-wrapping
// Character art area (the transparent hole in the cardfront template)
const ART_TOP       = 0.115;
const ART_BOT       = 0.600;
const ART_X_PAD     = 0.080;

// Art area in UV space (UV.y = 1 - canvas_fraction because Three.js flipY=true).
// Exported for the holo shader so both systems share the same bounds.
export const ART_UV = {
  minX: ART_X_PAD,
  maxX: 1.0 - ART_X_PAD,
  minY: 1.0 - ART_BOT,   // 0.322
  maxY: 1.0 - ART_TOP,   // 0.888
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class TextureGenerator {
  private static _cardFrontBase: HTMLImageElement | null = null;
  private static _cardBackTex: THREE.Texture | null = null;
  private static _packTexCache  = new Map<string, THREE.Texture>();
  private static _cardCache     = new Map<string, THREE.CanvasTexture>();
  private static _charImgCache  = new Map<string, HTMLImageElement>();

  /**
   * Preload all image assets.  Call once in main.ts before any scene renders.
   * base = import.meta.env.BASE_URL  (handles GitHub Pages subdirectory paths)
   */
  static async preload(base: string, packs: PackDefinition[]): Promise<void> {
    const loader = new THREE.TextureLoader();
    const loadTex = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(url, resolve, undefined, () => reject(new Error(`Failed: ${url}`))),
      );

    const allCards = packs.flatMap((p) => p.cards);

    const [frontImg, backTex, ...rest] = await Promise.all([
      loadImage(`${base}assets/card/cardfront.png`),
      loadTex(`${base}assets/card/cardback.png`),
      ...packs
        .filter((p) => p.artTexture)
        .map((p) =>
          loadTex(`${base}${p.artTexture}`)
            .then((tex) => ({ kind: 'pack' as const, id: p.id, tex }))
            .catch(() => null),
        ),
      ...allCards
        .filter((c) => c.characterTexture)
        .map((c) =>
          loadImage(`${base}${c.characterTexture}`)
            .then((img) => ({ kind: 'char' as const, id: c.id, img }))
            .catch(() => null),
        ),
    ]);

    this._cardFrontBase = frontImg;
    this._cardBackTex = backTex;
    for (const entry of rest) {
      if (!entry) continue;
      if (entry.kind === 'pack') this._packTexCache.set(entry.id, entry.tex);
      else                       this._charImgCache.set(entry.id, entry.img);
    }
  }

  static getCardFace(card: CardDefinition): THREE.CanvasTexture {
    // Cache is intentionally skipped in dev so layout constant changes are visible immediately.
    if (!import.meta.env.DEV && this._cardCache.has(card.id)) return this._cardCache.get(card.id)!;

    const base = this._cardFrontBase;
    const W = base ? base.naturalWidth  : 512;
    const H = base ? base.naturalHeight : 716;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    if (base) {
      // 1. Draw the card frame (cardfront.png has a transparent hole for the art area).
      ctx.drawImage(base, 0, 0, W, H);

      // 2. Tint only the opaque frame areas — preserve the transparent art hole.
      //    Strategy: build a tint layer clipped to the cardfront's own opaque mask via
      //    destination-in, then composite that clipped layer onto the main canvas with
      //    multiply.  Transparent pixels in the art hole are never painted.
      const tintCanvas = document.createElement('canvas');
      tintCanvas.width = W; tintCanvas.height = H;
      const tc = tintCanvas.getContext('2d')!;
      tc.fillStyle = '#bfd0e8';
      tc.fillRect(0, 0, W, H);
      tc.globalCompositeOperation = 'destination-in';
      tc.drawImage(base, 0, 0, W, H);          // clips tint to opaque card pixels only
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(tintCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // 3. Draw character art BEHIND the frame with destination-over.
      //    Visible only through the transparent art hole; the opaque frame clips all edges.
      const charImg = TextureGenerator._charImgCache.get(card.id);
      if (charImg) {
        const artX = W * ART_X_PAD;
        const artY = H * ART_TOP;
        const artW = W * (1 - 2 * ART_X_PAD);
        const artH = H * (ART_BOT - ART_TOP);
        // Always fill the full cutout height; center horizontally.
        // Any horizontal overflow is hidden by the opaque card frame (destination-over).
        const imgAspect = charImg.naturalWidth / charImg.naturalHeight;
        const dh = artH;
        const dw = artH * imgAspect;
        const dx = artX + (artW - dw) / 2;
        const dy = artY;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(charImg, dx, dy, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // Fallback: fill art hole with dark background so no transparent pixels leak through.
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Fallback: plain dark gradient if image hasn't loaded
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1a2040');
      grad.addColorStop(1, '#0d0d1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    const rarityColor = RARITY_COLORS[card.rarity as CardRarity] ?? '#888';

    // ── Card name in the title bar ────────────────────────────────────────────
    const titleY    = H * TITLE_Y;
    const titleXMax = W * TITLE_X_MAX;
    const titleFont = Math.round(W * 0.044);
    ctx.font         = `bold ${titleFont}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    ctx.shadowColor   = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur    = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Truncate name if it overflows the title bar
    let name = card.name;
    while (ctx.measureText(name).width > titleXMax - W * TITLE_X_START && name.length > 1) {
      name = name.slice(0, -1);
    }
    ctx.fillStyle = '#111111';
    ctx.fillText(name, W * TITLE_X_START, titleY);
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // ── Rarity dot — placed on the circular gem element at the right of the title bar ──
    ctx.beginPath();
    ctx.arc(W * RARITY_X, H * RARITY_Y, W * RARITY_R, 0, Math.PI * 2);
    ctx.fillStyle = rarityColor;
    ctx.fill();

    // ── Description text in the description box ───────────────────────────────
    if (card.description) {
      const descTop  = H * DESC_TOP;
      const descBot  = H * DESC_BOT;
      const descH    = descBot - descTop;
      const xPad     = W * DESC_X_PAD;
      const maxW     = W - xPad * 2;
      const descFont = Math.round(W * 0.044); // 1.5× original (~22px at 512w)

      ctx.font         = `italic ${descFont}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = '#1a1a2e';

      const lines  = wrapText(ctx, card.description, maxW);
      const lineH  = descFont * 1.35;
      const totalH = lines.length * lineH;
      const startY = descTop + (descH - totalH) / 2 - H * 0.025;

      lines.forEach((line, i) => {
        ctx.fillText(line, W * 0.5, startY + i * lineH);
      });
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._cardCache.set(card.id, tex);
    return tex;
  }

  static getCardBack(): THREE.Texture {
    if (this._cardBackTex) return this._cardBackTex;

    // Fallback canvas back if preload hasn't run
    const canvas = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 716;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 512, 716);
    grad.addColorStop(0, '#1a1a3e');
    grad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 716);
    ctx.strokeStyle = '#3a3a6e';
    ctx.lineWidth   = 12;
    ctx.strokeRect(6, 6, 500, 704);
    return new THREE.CanvasTexture(canvas);
  }

  static getPackFace(pack: PackDefinition): THREE.Texture {
    if (this._packTexCache.has(pack.id)) return this._packTexCache.get(pack.id)!;

    // Fallback canvas pack face
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const h = (s: number) => `hsl(${((pack.id.charCodeAt(0) * 31) >>> 0) % 360},60%,${s}%)`;
    const grad = ctx.createLinearGradient(0, 0, 256, 512);
    grad.addColorStop(0, h(35));
    grad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = 4;
    ctx.strokeRect(4, 4, 248, 504);
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.font        = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    pack.displayName.split(' ').forEach((w, i, a) => {
      ctx.fillText(w, 128, 256 - ((a.length - 1) * 14) + i * 28);
    });
    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText(`$${pack.cost.toFixed(2)}`, 128, 472);
    return new THREE.CanvasTexture(canvas);
  }

  static disposeAll(): void {
    this._cardCache.forEach((t) => t.dispose());
    this._cardCache.clear();
    this._packTexCache.forEach((t) => t.dispose());
    this._packTexCache.clear();
    this._charImgCache.clear();
    this._cardBackTex?.dispose();
    this._cardBackTex = null;
    this._cardFrontBase = null;
  }
}
