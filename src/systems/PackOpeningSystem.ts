import { CardInstance } from '../entities/Card.js';
import type { GameConfig, PackDefinition } from '../types/index.js';
import { FoilType } from '../types/index.js';

export class PackOpeningSystem {
  constructor(private readonly config: GameConfig) {}

  drawCards(pack: PackDefinition): CardInstance[] {
    const count = this.config.cardsPerPack;
    const drawn: CardInstance[] = [];

    const totalWeight = pack.cards.reduce((s, c) => s + c.drawChance, 0);

    for (let i = 0; i < count; i++) {
      const r = Math.random() * totalWeight;
      let acc = 0;
      for (const card of pack.cards) {
        acc += card.drawChance;
        if (r <= acc) {
          drawn.push(new CardInstance(card, this.rollFoil()));
          break;
        }
      }
    }

    return drawn;
  }

  private rollFoil(): FoilType {
    const r = Math.random();
    if (r < this.config.fullHoloChance) return FoilType.FullHolo;
    if (r < this.config.fullHoloChance + this.config.holoChance) return FoilType.Holo;
    if (r < this.config.fullHoloChance + this.config.holoChance + this.config.reverseHoloChance) {
      return FoilType.ReverseHolo;
    }
    return FoilType.None;
  }
}
