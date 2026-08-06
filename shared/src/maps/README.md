# Maps

Drop map-editor JSON exports into **this folder** (`shared/src/maps/*.json`).
They appear in the game automatically — no TypeScript registry edits.

| Field | Notes |
|-------|--------|
| `id` | Unique catalog key (must not collide) |
| `background` | Hex from `MAP_BG_PALETTE` |
| `width` / `height` | One of `MAP_ASPECTS` |
| `players` | `1` = solo (lobby picker), `2` = ranked |

Preferred defaults (if present): id `solo-classic`, `ranked-classic`.
Otherwise the first map with matching `players` is used.

## Workflow

1. Export from map editor → save as `shared/src/maps/my-map.json`
2. With `npm run dev`, the catalog regenerates and shared rebuilds
3. Solo: choose the map in the lobby dropdown
4. Ranked: server uses the preferred / first 2-player map from the catalog

## How discovery works

`shared/scripts/gen-map-catalog.mjs` scans `*.json` and writes `catalog.gen.ts`.

- **`npm run dev`:** watches the folder, regenerates + rebuilds shared dist
- **Client (Vite):** also regenerates on JSON changes
- **Build:** `npm run build -w shared` runs generation first
- **Manual:** `npm run maps:gen`

## Shipped maps

| JSON | Mode |
|------|------|
| `solo-classic.json` | solo |
| `ranked-classic.json` | ranked 1v1 |
