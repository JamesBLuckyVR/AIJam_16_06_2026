# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT**: Update this file whenever any design decision about the game changes.

## Project

**AIJam_16_06_2026** — a card pack opening simulator game jam project started 2026-06-16 by James Brooks (JamesBLuckyVR).

GitHub remote: https://github.com/JamesBLuckyVR/AIJam_16_06_2026

---

## Tech Stack

| Concern | Choice |
|---|---|
| Build | Vite 6 + TypeScript (strict) |
| 3D / Shaders | Three.js r184 |
| Animation timelines | GSAP 3.15 |
| Web hosting | GitHub Pages (`gh-pages` branch) |
| Mobile APK | Capacitor 8 (wraps same `dist/` build) |
| UI overlay | Vanilla HTML/CSS (no framework) |

**Critical Vite setting**: `base: process.env.NODE_ENV === 'production' ? './' : '/'`
This makes asset paths work for both GitHub Pages subdirectory URLs and Capacitor's `file://` protocol.

---

## Game Overview

A TCG card pack opening simulator. Players earn in-game money, buy booster packs, open them with a tactile 3D gesture, reveal cards, and choose to sell or keep each card.

### Core Loop
1. Player starts in their **Room** (hub scene)
2. From the Room they can: view card collection, view their packs, or navigate to a store
3. At a **Store**: buy/sell packs and cards at daily market prices
4. On the **Pack Shelf**: tap a pack to bring it to the Pack Opening screen
5. On the **Pack Opening** screen: rotate the pack, draw a line to cut it open, swipe through revealed cards

---

## Scenes

### Room (Hub)
- 2D background image as a DOM `<div>` behind a transparent Three.js canvas
- DOM buttons to navigate to: Card Collection, Pack Shelf, Store Select
- Can be upgraded to a full 3D room environment later

### Pack Shelf
- 3D scene with packs scattered on a floor plane
- Player's owned packs displayed as 3D PackMesh objects
- Tap a pack → it floats up → transition to Pack Opening scene

### Pack Opening (Hero Feature)
State machine:
```
INSPECT   → drag to rotate the pack in 3D
CUTTING   → draw a line across the pack to cut it
CUT_ANIM  → packTop animates off-screen along the cut direction
REVEALING → cards emerge one at a time, flip face-up
SWIPING   → swipe left = discard, swipe right = keep
           → quick flick = fast throw, slow drag = peek next card
SUMMARY   → show kept cards, return button
```

### Card Collection
- Scrollable grid of all owned cards
- Tap/hover to show card details tooltip with current market value

### Store
- Glass counter with cards and packs laid out in 3D
- Price labels rendered as DOM `<div>` elements anchored to 3D positions via `Vector3.project(camera)`
- Buy and sell interactions
- Multiple stores exist, each with different daily pricing

### Store Select
- List of available stores with names and flavor text
- Selecting one loads the Store scene for that store

---

## 3D Rendering

### Cards
- Geometry: `THREE.PlaneGeometry(2.5, 3.5)` (standard card aspect ratio ~1:1.4)
- Back: shared static card-back texture
- Front: loaded from `faceTexture` path; placeholder via `TextureGenerator` (canvas-drawn)
- Flip animation: tween `mesh.scale.x` 1→0, swap texture, 0→−1 (avoids gimbal lock)
- Normal cards: `THREE.MeshStandardMaterial` with `roughness: 0.1, metalness: 0.05`
- Holo cards: custom GLSL `ShaderMaterial` (see Holographic Shader below)

### Packs
- Two meshes: `packTop` (upper ~40%) + `packBottom` (lower ~60%)
- Positioned together to appear as a single pack
- Both share the pack art texture with UV offset to show correct portion
- Cut animation: GSAP timeline moves `packTop` along the cut angle + upward + slight twist

### Holographic Shader
GLSL `ShaderMaterial` uniforms: `uCardTexture`, `uTiltX`, `uTiltY` (−1..1), `uTime`

Effect breakdown:
- `NdotV`-based iridescent color shift (view-dependent)
- UV sine-band rainbow pattern shifted by tilt + time
- Specular highlight
- `updateTilt(x, y)` called each frame from `DeviceOrientation` (mobile gyroscope) or pointer position

On iOS 13+: `DeviceOrientationEvent.requestPermission()` must be called inside a user-gesture handler. Trigger it on the first pack-open tap.

---

## Data Architecture

### File Layout
```
public/data/
  game.config.json          # Global tunable values
  manifest.json             # Lists all pack and store filenames (required for static hosting)
  packs/
    [packname].pack.json    # One file per pack
  stores/
    [storename].store.json  # One file per store
```

### `game.config.json` — Global Settings
```json
{
  "cardsPerPack": 5,
  "holoChance": 0.08,
  "reverseHoloChance": 0.15,
  "fullHoloChance": 0.02,
  "startingMoney": 50.00,
  "marketTrendSeed": 42
}
```
`cardsPerPack` lives **only** here — packs do not override it.

### `[packname].pack.json` — Pack Definition
```json
{
  "id": "starter",
  "displayName": "Starter Pack",
  "cost": 4.99,
  "artTexture": "textures/packs/starter.png",
  "cards": [
    {
      "id": "001",
      "name": "Common Slime",
      "rarity": "Common",
      "baseCost": 0.50,
      "drawChance": 0.25,
      "characterTexture": "textures/cards/slime_char.png",
      "faceTexture": "textures/cards/slime_face.png"
    }
  ]
}
```

**RULE — drawChance must sum to exactly 1.00**: All `drawChance` values across all cards in a pack must total `1.00`. When adding or removing cards, every card's `drawChance` must be recalculated to maintain this invariant. `DataLoader` validates this at load time and throws a descriptive error if `Math.abs(sum - 1.0) > 0.001`.

### `[storename].store.json` — Store Definition
```json
{
  "id": "card-corner",
  "displayName": "Card Corner",
  "seed": 1001,
  "markupRange": 0.10,
  "buyMultiplier": 0.50,
  "sellMultiplier": 1.00,
  "inventory": ["starter", "premium"]
}
```
- `seed`: unique per store, used in deterministic daily price calculation
- `markupRange`: fraction for store-specific price variance (0.10 = ±10%)
- `buyMultiplier`: fraction of market value the store pays the player when buying cards
- `sellMultiplier`: multiplier on market value the store charges the player to buy items
- `inventory`: list of pack IDs this store sells

### `manifest.json`
```json
{
  "packs": ["starter.pack.json", "premium.pack.json"],
  "stores": ["card-corner.store.json", "collectors-vault.store.json"]
}
```
`DataLoader` reads this first to discover what files to fetch (static hosts have no directory listing).

---

## Market Pricing System

Prices are **deterministic per UTC day** — all players see the same prices at any given store on the same calendar day.

### Algorithm
```typescript
function composeSeed(marketTrendSeed, storeSeed, itemId, dayNumber): number {
  // XOR-combine all inputs: (marketTrendSeed ^ storeSeed ^ idHash(itemId) ^ dayNumber) >>> 0
}

getDailyPrice(baseCost, storeSeed, markupRange, itemId): number {
  const day = Math.floor(Date.now() / 86400000); // UTC day number
  const rng = mulberry32(composeSeed(...));
  const marketFactor = 0.7 + rng() * 0.6;        // global trend: ±30% from base
  const storeFactor  = (1 - markupRange) + rng() * (2 * markupRange); // store markup
  return Math.round(baseCost * marketFactor * storeFactor * 100) / 100;
}
```

PRNG: `mulberry32` (fast, high-quality 32-bit seeded PRNG — see `src/utils/prng.ts`).

---

## Card Rarities & Foil Types

```typescript
enum CardRarity { Common, Uncommon, Rare, UltraRare, Secret }
enum FoilType   { None, ReverseHolo, Holo, FullHolo }
```

Foil chances are rolled per card drawn, using values from `game.config.json`:
- `fullHoloChance` checked first
- then `holoChance`
- then `reverseHoloChance`
- else `None`

---

## Class Responsibilities

| Class | File | Role |
|---|---|---|
| `CardDefinition` | `src/types/index.ts` | Static data shape for a card (from .pack.json) |
| `CardInstance` | `src/entities/Card.ts` | Runtime card: wraps definition + foilType + uuid |
| `PackDefinition` | `src/types/index.ts` | Static data shape for a pack |
| `StoreDefinition` | `src/types/index.ts` | Static data shape for a store |
| `PlayerInventory` | `src/entities/PlayerInventory.ts` | Player money, owned cards, owned packs; serialize/deserialize |
| `MarketSystem` | `src/systems/MarketSystem.ts` | `getDailyPrice()` — deterministic daily prices |
| `PackOpeningSystem` | `src/systems/PackOpeningSystem.ts` | `drawCards()` — weighted random draw + foil roll |
| `SaveSystem` | `src/systems/SaveSystem.ts` | localStorage read/write |
| `DataLoader` | `src/data/DataLoader.ts` | `fetch()` all JSON data; validates drawChance sums |
| `Engine` | `src/rendering/Engine.ts` | WebGLRenderer, camera, RAF loop, resize |
| `CardMesh` | `src/rendering/CardMesh.ts` | Card 3D mesh, texture, flip animation |
| `PackMesh` | `src/rendering/PackMesh.ts` | Two-part pack mesh, cut animation |
| `HoloShader` | `src/rendering/HoloShader.ts` | GLSL ShaderMaterial with tilt-responsive iridescence |
| `TextureGenerator` | `src/rendering/TextureGenerator.ts` | Canvas-drawn placeholder textures |
| `SceneManager` | `src/scenes/SceneManager.ts` | Scene registry, fade transitions, SceneContext injection |
| `PointerManager` | `src/input/PointerManager.ts` | Unified PointerEvent handler (mouse + touch) |
| `GestureDetector` | `src/input/GestureDetector.ts` | Cut-line detection, swipe velocity |
| `DeviceOrientation` | `src/input/DeviceOrientation.ts` | Gyroscope tilt → holo shader uniforms |
| `HUD` | `src/ui/HUD.ts` | Vanilla DOM overlay for money display, tooltips, buttons |

---

## Input Design

- All interaction uses the `PointerEvent` API (single code path covers mouse and touch)
- Canvas `pointerdown` handler guards `e.target === canvas` to avoid eating HUD button taps
- HUD container: `pointer-events: none`; individual interactive elements: `pointer-events: auto`
- **Swipe detection**: track last N pointer positions + timestamps → compute x-velocity → if `|v| > threshold`, auto-throw; otherwise release based on card position vs. center
- **Cut detection**: validate that the drawn line crosses both opposite edges of the pack's screen bounding box

---

## Save System

- Storage: `localStorage`, key `'cardpacksim_save_v1'`
- Stored shape: `{ money: number, cards: {defId, foilType, instanceId}[], packs: string[] }`
- On load: `CardInstance`s are rehydrated by looking up `defId` in loaded pack definitions
- No backend required

---

## Deployment

### GitHub Pages
```bash
npm run deploy   # builds then pushes dist/ to gh-pages branch
```
URL: `https://JamesBLuckyVR.github.io/AIJam_16_06_2026/`

GitHub repo Settings > Pages must be set to serve from the `gh-pages` branch.

### Android APK (Capacitor)
```bash
npm run build
npx cap sync android
npx cap open android   # then Build > Generate Signed APK in Android Studio
```
Set `minSdkVersion: 26` (Android 8.0) in `android/app/build.gradle` for reliable WebGL 2.

---

## Known Risks

| Risk | Mitigation |
|---|---|
| Holo GLSL too heavy on low-end Android | Fall back to `MeshStandardMaterial` + env map when WebGL2 unavailable |
| iOS 13+ DeviceOrientation permission | Call `requestPermission()` inside pack-open tap handler |
| Card texture memory on mobile | `TextureGenerator` caches by `defId`; dispose textures on scene exit |
| No directory listing on static host | `manifest.json` explicitly lists all filenames |
