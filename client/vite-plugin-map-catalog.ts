import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.resolve(root, "../shared/src/maps");
const genScript = path.resolve(root, "../shared/scripts/gen-map-catalog.mjs");

async function regenerate(): Promise<void> {
  const mod = await import(`${pathToFileURL(genScript).href}?t=${Date.now()}`);
  const { changed, files } = mod.generateMapCatalog();
  console.log(
    `[maps] catalog.gen.ts ${changed ? "updated" : "up-to-date"} (${files.length} maps)`,
  );
}

/** Regenerates shared map catalog when JSON files are added/changed/removed. */
export function mapCatalogPlugin(): Plugin {
  return {
    name: "2ma-map-catalog",
    async buildStart() {
      await regenerate();
    },
    configureServer(server) {
      server.watcher.add(mapsDir);
      const onFs = (file: string) => {
        if (!file.endsWith(".json")) return;
        if (!file.startsWith(mapsDir)) return;
        void regenerate().then(() => {
          const catalog = path.join(mapsDir, "catalog.gen.ts");
          const mod = server.moduleGraph.getModuleById(catalog);
          if (mod) void server.reloadModule(mod);
        });
      };
      server.watcher.on("add", onFs);
      server.watcher.on("change", onFs);
      server.watcher.on("unlink", onFs);
    },
  };
}
