export enum CardRarity {
  Common = 'Common',
  Uncommon = 'Uncommon',
  Rare = 'Rare',
  UltraRare = 'UltraRare',
  Secret = 'Secret',
}

export enum FoilType {
  None = 'None',
  ReverseHolo = 'ReverseHolo',
  Holo = 'Holo',
  FullHolo = 'FullHolo',
}

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  baseCost: number;
  drawChance: number;
  characterTexture: string;
  faceTexture: string;
}

export interface PackDefinition {
  id: string;
  displayName: string;
  cost: number;
  artTexture: string;
  cards: CardDefinition[];
}

export interface StoreDefinition {
  id: string;
  displayName: string;
  description: string;
  seed: number;
  markupRange: number;
  buyMultiplier: number;
  sellMultiplier: number;
  inventory: string[];
}

export interface GameConfig {
  version: string;
  cardsPerPack: number;
  holoChance: number;
  reverseHoloChance: number;
  fullHoloChance: number;
  startingMoney: number;
  marketTrendSeed: number;
}

export interface SaveData {
  money: number;
  cards: SavedCard[];
  packs: string[];
}

export interface SavedCard {
  defId: string;
  foilType: FoilType;
  instanceId: string;
}

export const RARITY_COLORS: Record<CardRarity, string> = {
  [CardRarity.Common]:    '#a0a0a0',
  [CardRarity.Uncommon]:  '#4caf50',
  [CardRarity.Rare]:      '#2196f3',
  [CardRarity.UltraRare]: '#9c27b0',
  [CardRarity.Secret]:    '#ff9800',
};

export const RARITY_GLOW: Record<CardRarity, string> = {
  [CardRarity.Common]:    'rgba(160,160,160,0.3)',
  [CardRarity.Uncommon]:  'rgba(76,175,80,0.4)',
  [CardRarity.Rare]:      'rgba(33,150,243,0.5)',
  [CardRarity.UltraRare]: 'rgba(156,39,176,0.6)',
  [CardRarity.Secret]:    'rgba(255,152,0,0.7)',
};
