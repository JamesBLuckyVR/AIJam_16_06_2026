import { PlayerInventory } from '../entities/PlayerInventory.js';
import type { PackDefinition, SaveData } from '../types/index.js';

const SAVE_KEY = 'cardpacksim_save_v1';

export class SaveSystem {
  static save(inventory: PlayerInventory): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(inventory.serialize()));
    } catch {
      console.warn('SaveSystem: could not write to localStorage');
    }
  }

  static load(allPacks: PackDefinition[], startingMoney: number): PlayerInventory {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as SaveData;
        return PlayerInventory.deserialize(data, allPacks);
      }
    } catch {
      console.warn('SaveSystem: save data corrupted, starting fresh');
    }
    return PlayerInventory.createNew(startingMoney);
  }

  static clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
