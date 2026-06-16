import type { CardDefinition } from '../types/index.js';
import { FoilType } from '../types/index.js';

let _instanceCounter = 0;

export class CardInstance {
  readonly instanceId: string;

  constructor(
    public readonly definition: CardDefinition,
    public readonly foilType: FoilType = FoilType.None,
    instanceId?: string,
  ) {
    this.instanceId = instanceId ?? `card_${++_instanceCounter}_${definition.id}`;
  }

  get isHolographic(): boolean {
    return this.foilType !== FoilType.None;
  }

  get displayName(): string {
    if (this.foilType === FoilType.FullHolo) return `★ ${this.definition.name} (Full Holo)`;
    if (this.foilType === FoilType.Holo) return `${this.definition.name} (Holo)`;
    if (this.foilType === FoilType.ReverseHolo) return `${this.definition.name} (Reverse Holo)`;
    return this.definition.name;
  }
}
