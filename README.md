# AIJam_16_06_2026 — Card Pack Opening Simulator

A TCG card pack opening simulator. Buy booster packs, open them with a 3D gesture, reveal holographic cards, and sell or keep them across a daily-shifting market.

## Running locally

**Prerequisites**: Node.js 18+

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

You start with $50.00. Visit a store to buy packs, then open them from the Pack Shelf.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build + push `dist/` to the `gh-pages` branch |

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds and deploys to GitHub Pages automatically.

Manual deploy: `npm run deploy` (requires write access to the repo).

Live URL: `https://JamesBLuckyVR.github.io/AIJam_16_06_2026/`

## Android APK (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android   # Build > Generate Signed APK in Android Studio
```
