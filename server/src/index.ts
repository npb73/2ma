import http from "http";
import express from "express";
import cors from "cors";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { authRouter } from "./auth/routes.js";
import { RankedRoom } from "./rooms/RankedRoom.js";
import { resolveRoomCode } from "./matchmaking/codes.js";

async function main(): Promise<void> {
  await connectDb();

  const app = express();
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);

  app.post("/match/create", async (req, res) => {
    try {
      const token = String(req.body?.token ?? "");
      if (!token) {
        res.status(401).json({ error: "Missing token" });
        return;
      }
      const room = await matchMaker.createRoom("ranked", {
        token,
        isPrivate: true,
      });
      res.json({
        roomId: room.roomId,
        roomCode: room.metadata?.roomCode,
      });
    } catch (err) {
      console.error("[match/create]", err);
      res.status(500).json({ error: "Failed to create room" });
    }
  });

  app.post("/match/join-code", async (req, res) => {
    try {
      const code = String(req.body?.code ?? "");
      const roomId = resolveRoomCode(code);
      if (!roomId) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      res.json({ roomId });
    } catch (err) {
      console.error("[match/join-code]", err);
      res.status(500).json({ error: "Failed to resolve code" });
    }
  });

  const server = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server }),
  });

  gameServer.define("ranked", RankedRoom).filterBy(["isPrivate"]);

  // Public queue rooms only — joinOrCreate with private:false
  // Private rooms are created via /match/create

  await gameServer.listen(config.port);
  console.log(`[server] http://localhost:${config.port}`);
  console.log(`[server] client origin ${config.clientOrigin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
