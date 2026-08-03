import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 2567),
  mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/zuma",
  jwtSecret: process.env.JWT_SECRET ?? "dev-change-me-in-production",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  yandex: {
    clientId: process.env.YANDEX_CLIENT_ID ?? "",
    clientSecret: process.env.YANDEX_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.YANDEX_REDIRECT_URI ??
      "http://localhost:2567/auth/yandex/callback",
  },
  devAuth: process.env.DEV_AUTH === "true",
};

export function yandexEnabled(): boolean {
  return Boolean(config.yandex.clientId && config.yandex.clientSecret);
}
