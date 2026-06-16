import * as THREE from 'three';
import gsap from 'gsap';
import { CardInstance } from '../entities/Card.js';
import { FoilType } from '../types/index.js';
import { HoloShader } from './HoloShader.js';
import { createGlossMaterial } from './GlossShader.js';
import { TextureGenerator } from './TextureGenerator.js';

const CARD_WIDTH = 2.5;
const CARD_HEIGHT = 3.5;
const CARD_DEPTH = 0.01;

export class CardMesh {
  readonly mesh: THREE.Mesh;
  private frontMaterial: THREE.Material;
  private backMaterial: THREE.MeshStandardMaterial;
  private holoShader: HoloShader | null = null;
  private _isFaceUp = false;

  constructor(public readonly card: CardInstance) {
    const geo = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH);

    const frontTex = TextureGenerator.getCardFace(card.definition);
    const backTex = TextureGenerator.getCardBack();

    this.backMaterial = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.2, metalness: 0 });

    if (card.foilType !== FoilType.None) {
      const strength = card.foilType === FoilType.FullHolo ? 0.9 : card.foilType === FoilType.Holo ? 0.6 : 0.3;
      this.holoShader = new HoloShader(frontTex, strength);
      this.frontMaterial = this.holoShader.material;
    } else {
      this.frontMaterial = createGlossMaterial(frontTex);
    }

    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      this.frontMaterial,
      this.backMaterial,
    ];

    this.mesh = new THREE.Mesh(geo, materials);
    this.mesh.userData['cardInstance'] = card;
  }

  get isFaceUp(): boolean {
    return this._isFaceUp;
  }

  updateHolo(tiltX: number, tiltY: number, time: number, cameraPos: THREE.Vector3): void {
    if (!this.holoShader) return;
    this.holoShader.updateTilt(tiltX, tiltY);
    this.holoShader.updateTime(time);
    this.holoShader.updateCamera(cameraPos);
  }

  async flipToFaceUp(): Promise<void> {
    if (this._isFaceUp) return;
    this._isFaceUp = true;
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.mesh.rotation, { y: Math.PI / 2, duration: 0.18, ease: 'power2.in' });
      tl.call(() => {
        this.mesh.rotation.y = -Math.PI / 2;
      });
      tl.to(this.mesh.rotation, { y: 0, duration: 0.18, ease: 'power2.out' });
    });
  }

  async flipToFaceDown(): Promise<void> {
    if (!this._isFaceUp) return;
    this._isFaceUp = false;
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.mesh.rotation, { y: Math.PI / 2, duration: 0.18, ease: 'power2.in' });
      tl.call(() => {
        this.mesh.rotation.y = -Math.PI / 2;
      });
      tl.to(this.mesh.rotation, { y: 0, duration: 0.18, ease: 'power2.out' });
    });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.frontMaterial.dispose();
    this.backMaterial.dispose();
    this.holoShader?.dispose();
  }
}
