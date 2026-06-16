import type { GameConfig, PackDefinition, StoreDefinition } from '../types/index.js';

interface Manifest {
  packs: string[];
  stores: string[];
}

const BASE = import.meta.env.BASE_URL;

async function fetchJSON<T>(path: string): Promise<T> {
  const url = `${BASE}data/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DataLoader: failed to fetch ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

function validatePackDrawChances(pack: PackDefinition): void {
  const sum = pack.cards.reduce((acc, c) => acc + c.drawChance, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(
      `Pack "${pack.id}" drawChance values sum to ${sum.toFixed(4)} — must equal 1.00. ` +
        `Adjust the drawChance values in ${pack.id}.pack.json so they total 1.00.`,
    );
  }
}

export class DataLoader {
  static async loadGameConfig(): Promise<GameConfig> {
    return fetchJSON<GameConfig>('game.config.json');
  }

  static async loadAllPacks(): Promise<PackDefinition[]> {
    const manifest = await fetchJSON<Manifest>('manifest.json');
    const packs = await Promise.all(
      manifest.packs.map((filename) => fetchJSON<PackDefinition>(`packs/${filename}`)),
    );
    packs.forEach(validatePackDrawChances);
    return packs;
  }

  static async loadAllStores(): Promise<StoreDefinition[]> {
    const manifest = await fetchJSON<Manifest>('manifest.json');
    return Promise.all(
      manifest.stores.map((filename) => fetchJSON<StoreDefinition>(`stores/${filename}`)),
    );
  }
}
