#!/usr/bin/env node
/**
 * Watch shared/src/maps/*.json → regenerate catalog + rebuild shared dist
 * so the server (which imports @2ma/shared from dist) stays in sync.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = path.resolve(__dirname, "..");
const MAPS_DIR = path.join(SHARED_ROOT, "src/maps");
const genScript = path.join(__dirname, "gen-map-catalog.mjs");

let building = false;
let queued = false;

async function regenerate() {
  const mod = await import(`${pathToFileURL(genScript).href}?t=${Date.now()}`);
  return mod.generateMapCatalog();
}

function buildShared() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  void (async () => {
    try {
      const { changed, files } = await regenerate();
      console.log(
        `[maps] catalog ${changed ? "updated" : "ok"} (${files.length}); rebuilding shared…`,
      );
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.platform === "win32" ? "npx.cmd" : "npx",
          ["tsc"],
          { cwd: SHARED_ROOT, stdio: "inherit", shell: false },
        );
        child.on("exit", (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error(`tsc exited ${code}`));
        });
      });
      fs.mkdirSync(path.join(SHARED_ROOT, "dist/maps"), { recursive: true });
      for (const f of fs.readdirSync(MAPS_DIR).filter((n) => n.endsWith(".json"))) {
        fs.copyFileSync(
          path.join(MAPS_DIR, f),
          path.join(SHARED_ROOT, "dist/maps", f),
        );
      }
      console.log("[maps] shared dist ready");
    } catch (e) {
      console.error("[maps]", e instanceof Error ? e.message : e);
    } finally {
      building = false;
      if (queued) {
        queued = false;
        buildShared();
      }
    }
  })();
}

console.log(`[maps] watching ${MAPS_DIR} (rebuild shared dist)`);
buildShared();

let timer = null;
fs.watch(MAPS_DIR, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(buildShared, 120);
});
