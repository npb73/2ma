import { Router, type Request, type Response } from "express";
import { config, yandexEnabled } from "../config.js";
import { findOrCreateYandexUser, getUserById } from "../db.js";
import { signToken, verifyToken } from "./jwt.js";

export const authRouter = Router();

function publicUser(u: {
  _id: { toString(): string };
  displayName: string;
  avatarUrl?: string;
  rating: number;
}) {
  return {
    id: u._id.toString(),
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    rating: u.rating,
  };
}

authRouter.get("/yandex", (_req: Request, res: Response) => {
  if (!yandexEnabled()) {
    res.status(400).json({
      error: "Yandex OAuth is not configured. Use /auth/dev while DEV_AUTH=true.",
    });
    return;
  }
  const url = new URL("https://oauth.yandex.ru/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.yandex.clientId);
  url.searchParams.set("redirect_uri", config.yandex.redirectUri);
  res.redirect(url.toString());
});

authRouter.get("/yandex/callback", async (req: Request, res: Response) => {
  try {
    if (!yandexEnabled()) {
      res.status(400).send("Yandex OAuth is not configured");
      return;
    }
    const code = String(req.query.code ?? "");
    if (!code) {
      res.status(400).send("Missing code");
      return;
    }

    const tokenRes = await fetch("https://oauth.yandex.ru/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.yandex.clientId,
        client_secret: config.yandex.clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      res.status(502).send("Failed to exchange Yandex code");
      return;
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string };

    const infoRes = await fetch("https://login.yandex.ru/info?format=json", {
      headers: { Authorization: `OAuth ${tokenJson.access_token}` },
    });
    if (!infoRes.ok) {
      res.status(502).send("Failed to fetch Yandex profile");
      return;
    }
    const info = (await infoRes.json()) as {
      id: string;
      login: string;
      display_name?: string;
      real_name?: string;
      default_avatar_id?: string;
      is_avatar_empty?: boolean;
    };

    const displayName =
      info.display_name || info.real_name || info.login || `player_${info.id}`;
    const avatarUrl =
      !info.is_avatar_empty && info.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
        : undefined;

    const user = await findOrCreateYandexUser({
      yandexId: String(info.id),
      displayName,
      avatarUrl,
    });
    const token = signToken({
      userId: user._id.toString(),
      displayName: user.displayName,
    });
    res.redirect(`${config.clientOrigin}/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error("[auth] yandex callback", err);
    res.status(500).send("Auth failed");
  }
});

authRouter.post("/dev", async (req: Request, res: Response) => {
  if (!config.devAuth) {
    res.status(403).json({ error: "DEV_AUTH is disabled" });
    return;
  }
  const name =
    typeof req.body?.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 32)
      : `Dev${Math.floor(Math.random() * 9000 + 1000)}`;
  const yandexId = `dev_${name.toLowerCase().replace(/\s+/g, "_")}`;
  const user = await findOrCreateYandexUser({
    yandexId,
    displayName: name,
  });
  const token = signToken({
    userId: user._id.toString(),
    displayName: user.displayName,
  });
  res.json({ token, user: publicUser(user) });
});

authRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = verifyToken(token);
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

authRouter.get("/status", (_req: Request, res: Response) => {
  res.json({
    yandexEnabled: yandexEnabled(),
    devAuth: config.devAuth,
  });
});
