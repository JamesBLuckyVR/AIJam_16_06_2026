import type { CardDefinition, GameConfig, PackDefinition, StoreDefinition } from '../types/index.js';
import { mulberry32 } from '../utils/prng.js';
import { composeSeed, utcDayNumber } from '../utils/seed.js';

export class MarketSystem {
  constructor(private readonly config: GameConfig) {}

  getDailyPrice(baseCost: number, storeSeed: number, markupRange: number, itemId: string): number {
    const day = utcDayNumber();
    const seed = composeSeed(this.config.marketTrendSeed, storeSeed, itemId, day);
    const rng = mulberry32(seed);

    const marketFactor = 0.7 + rng() * 0.6;
    const storeFactor = 1 - markupRange + rng() * (2 * markupRange);

    return Math.round(baseCost * marketFactor * storeFactor * 100) / 100;
  }

  getCardPrice(card: CardDefinition, store: StoreDefinition): number {
    return this.getDailyPrice(card.baseCost, store.seed, store.markupRange, card.id);
  }

  getPackPrice(pack: PackDefinition, store: StoreDefinition): number {
    return this.getDailyPrice(pack.cost, store.seed, store.markupRange, pack.id);
  }

  getBuyPrice(card: CardDefinition, store: StoreDefinition): number {
    return Math.round(this.getCardPrice(card, store) * store.buyMultiplier * 100) / 100;
  }
}
