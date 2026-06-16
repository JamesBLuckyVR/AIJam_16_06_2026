import { DataLoader } from './data/DataLoader.js';
import { Engine } from './rendering/Engine.js';
import { SceneManager } from './scenes/SceneManager.js';
import { MarketSystem } from './systems/MarketSystem.js';
import { PackOpeningSystem } from './systems/PackOpeningSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { PointerManager } from './input/PointerManager.js';
import { DeviceOrientation } from './input/DeviceOrientation.js';
import { HUD } from './ui/HUD.js';
import { RoomScene } from './scenes/RoomScene.js';
import { PackShelfScene } from './scenes/PackShelfScene.js';
import { PackOpeningScene } from './scenes/PackOpeningScene.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { StoreScene } from './scenes/StoreScene.js';
import { StoreSelectScene } from './scenes/StoreSelectScene.js';

async function main(): Promise<void> {
  const hud = new HUD();

  try {
    hud.setLoadingProgress(0.1);
    const [config, packs, stores] = await Promise.all([
      DataLoader.loadGameConfig(),
      DataLoader.loadAllPacks(),
      DataLoader.loadAllStores(),
    ]);
    hud.setLoadingProgress(0.5);

    const inventory = SaveSystem.load(packs, config.startingMoney);
    hud.setLoadingProgress(0.7);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const engine = new Engine(canvas);

    const market = new MarketSystem(config);
    const packOpener = new PackOpeningSystem(config);
    const pointer = new PointerManager(canvas);
    const orientation = new DeviceOrientation();

    const sceneManager = new SceneManager();
    sceneManager.register('room',         () => new RoomScene());
    sceneManager.register('pack-shelf',   () => new PackShelfScene());
    sceneManager.register('pack-opening', () => new PackOpeningScene());
    sceneManager.register('collection',   () => new CollectionScene());
    sceneManager.register('store',        () => new StoreScene());
    sceneManager.register('store-select', () => new StoreSelectScene());

    const save = () => SaveSystem.save(inventory);

    sceneManager.init(
      { engine, hud, pointer, orientation, inventory, market, packOpener, config, packs, stores },
      save,
    );

    engine.setCallbacks(
      (delta) => sceneManager.update(delta),
      (renderer, camera) => sceneManager.render(renderer, camera),
    );

    hud.setLoadingProgress(1.0);

    await sceneManager.goto('room');
    engine.start();
    hud.hideLoadingScreen();

  } catch (err) {
    console.error('Failed to start game:', err);
    const loading = document.getElementById('loading-screen')!;
    loading.innerHTML = `<h1 style="color:#ff6b6b">Failed to load</h1><p style="color:#aaa;font-size:14px;margin-top:12px">${String(err)}</p>`;
  }
}

main();
