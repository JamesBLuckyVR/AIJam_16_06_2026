import { CardInstance } from './Card.js';
import type { CardDefinition, PackDefinition, SaveData, SavedCard } from '../types/index.js';
import { FoilType } from '../types/index.js';

export class PlayerInventory {
  money: number;
  cards: CardInstance[];
  packIds: string[];

  constructor(money: number, cards: CardInstance[], packIds: string[]) {
    this.money = money;
    this.cards = cards;
    this.packIds = packIds;
  }

  static createNew(startingMoney: number): PlayerInventory {
    return new PlayerInventory(startingMoney, [], []);
  }

  static deserialize(data: SaveData, allPacks: PackDefinition[]): PlayerInventory {
    const defMap = new Map<string, CardDefinition>();
    allPacks.forEach((pack) => pack.cards.forEach((card) => defMap.set(card.id, card)));

    const cards: CardInstance[] = [];
    for (const saved of data.cards) {
      const def = defMap.get(saved.defId);
      if (def) cards.push(new CardInstance(def, saved.foilType as FoilType, saved.instanceId));
    }

    return new PlayerInventory(data.money, cards, data.packs ?? []);
  }

  serialize(): SaveData {
    return {
      money: this.money,
      cards: this.cards.map(
        (c): SavedCard => ({
          defId: c.definition.id,
          foilType: c.foilType,
          instanceId: c.instanceId,
        }),
      ),
      packs: this.packIds,
    };
  }

  addCard(card: CardInstance): void {
    this.cards.push(card);
  }

  removeCard(instanceId: string): CardInstance | undefined {
    const idx = this.cards.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) return undefined;
    return this.cards.splice(idx, 1)[0];
  }

  addPack(packId: string): void {
    this.packIds.push(packId);
  }

  removePack(packId: string): boolean {
    const idx = this.packIds.indexOf(packId);
    if (idx === -1) return false;
    this.packIds.splice(idx, 1);
    return true;
  }

  canAfford(amount: number): boolean {
    return this.money >= amount;
  }

  spend(amount: number): void {
    if (!this.canAfford(amount)) throw new Error('Insufficient funds');
    this.money -= amount;
    this.money = Math.round(this.money * 100) / 100;
  }

  earn(amount: number): void {
    this.money += amount;
    this.money = Math.round(this.money * 100) / 100;
  }
}
