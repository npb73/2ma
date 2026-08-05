# Maps

Maps are **JSON files** in this folder (same format as the map editor export).
The `.ts` wrappers only `parseGameMap` and register them in `index.ts`.

| JSON | Mode | Loader |
|------|------|--------|
| `solo-classic.json` | solo | `getSoloMap()` |
| `ranked-classic.json` | ranked 1v1 | `getRankedMap()` |

After editing a JSON (or pasting an editor export), rebuild shared / restart the game so client and server pick it up:

```bash
npm run build -w shared
```

Vite (client) reads `shared/src` directly via alias — a refresh is usually enough after saving the JSON.
