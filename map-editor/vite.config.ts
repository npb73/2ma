import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@2ma/shared": path.resolve(root, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5174,
  },
});
