import type { CardInstance } from '../entities/Card.js';
import { RARITY_COLORS } from '../types/index.js';

export class HUD {
  private readonly moneyEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private readonly buttonsEl: HTMLElement;
  private readonly swipeHintEl: HTMLElement;
  private readonly cutHintEl: HTMLElement;
  private readonly priceLabelsEl: HTMLElement;
  private readonly cardActionsEl: HTMLElement;

  constructor() {
    this.moneyEl      = document.getElementById('money-display')!;
    this.titleEl      = document.getElementById('scene-title')!;
    this.tooltipEl    = document.getElementById('tooltip')!;
    this.buttonsEl    = document.getElementById('scene-buttons')!;
    this.swipeHintEl  = document.getElementById('swipe-hint')!;
    this.cutHintEl    = document.getElementById('cut-hint')!;
    this.priceLabelsEl= document.getElementById('price-labels')!;
    this.cardActionsEl= document.getElementById('card-actions')!;
  }

  setMoney(amount: number): void {
    this.moneyEl.textContent = `$${amount.toFixed(2)}`;
  }

  setSceneTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  clearButtons(): void {
    this.buttonsEl.innerHTML = '';
  }

  addButton(
    label: string,
    onClick: () => void,
    variant: 'normal' | 'primary' = 'normal',
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = variant === 'primary' ? 'scene-btn primary' : 'scene-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    this.buttonsEl.appendChild(btn);
    return btn;
  }

  showTooltip(card: CardInstance, x: number, y: number, marketValue?: number): void {
    const nameEl = this.tooltipEl.querySelector('.tooltip-name') as HTMLElement;
    const rarityEl = this.tooltipEl.querySelector('.tooltip-rarity') as HTMLElement;
    const valueEl = this.tooltipEl.querySelector('.tooltip-value') as HTMLElement;

    nameEl.textContent = card.displayName;
    nameEl.style.color = RARITY_COLORS[card.definition.rarity] ?? '#fff';
    rarityEl.textContent = card.definition.rarity;
    valueEl.textContent = marketValue != null
      ? `Market: $${marketValue.toFixed(2)}`
      : `Base: $${card.definition.baseCost.toFixed(2)}`;

    this.tooltipEl.style.left = `${x + 12}px`;
    this.tooltipEl.style.top = `${y - 60}px`;
    this.tooltipEl.style.display = 'block';
  }

  hideTooltip(): void {
    this.tooltipEl.style.display = 'none';
  }

  showSwipeHint(visible: boolean): void {
    this.swipeHintEl.style.display = visible ? 'block' : 'none';
  }

  showCutHint(visible: boolean): void {
    this.cutHintEl.style.display = visible ? 'block' : 'none';
  }

  showCardActions(
    visible: boolean,
    onDiscard?: () => void,
    onKeep?: () => void,
  ): void {
    this.cardActionsEl.style.display = visible ? 'flex' : 'none';
    const discardBtn = document.getElementById('btn-discard')!;
    const keepBtn = document.getElementById('btn-keep')!;
    discardBtn.onclick = onDiscard ?? null;
    keepBtn.onclick = onKeep ?? null;
  }

  clearPriceLabels(): void {
    this.priceLabelsEl.innerHTML = '';
  }

  addPriceLabel(text: string, x: number, y: number, onClick?: () => void): HTMLElement {
    const el = document.createElement('div');
    el.className = 'price-label';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (onClick) el.addEventListener('click', onClick);
    this.priceLabelsEl.appendChild(el);
    return el;
  }

  updatePriceLabelPosition(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  clearScene(): void {
    this.clearButtons();
    this.clearPriceLabels();
    this.hideTooltip();
    this.showSwipeHint(false);
    this.showCutHint(false);
    this.showCardActions(false);
  }

  showTransition(fadeIn: boolean): void {
    const overlay = document.getElementById('transition-overlay')!;
    overlay.style.opacity = fadeIn ? '0' : '1';
  }

  async fadeOut(): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('transition-overlay')!;
      overlay.style.pointerEvents = 'all';
      overlay.style.opacity = '1';
      setTimeout(resolve, 280);
    });
  }

  async fadeIn(): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('transition-overlay')!;
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(resolve, 280);
    });
  }

  hideLoadingScreen(): void {
    const loading = document.getElementById('loading-screen')!;
    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.4s ease';
    setTimeout(() => { loading.style.display = 'none'; }, 420);
  }

  setLoadingProgress(fraction: number): void {
    const bar = document.getElementById('loading-bar')!;
    bar.style.width = `${Math.round(fraction * 100)}%`;
  }
}
