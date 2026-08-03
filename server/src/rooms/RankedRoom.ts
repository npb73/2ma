import { RATING_DELTA, TICK_HZ } from "@2ma/shared";
import { Room, type Client } from "@colyseus/core";
import { applyMatchRating, getUserById } from "../db.js";
import { verifyToken } from "../auth/jwt.js";
import { GameSim } from "../game/sim.js";
import {
  registerRoomCode,
  unregisterRoomCode,
} from "../matchmaking/codes.js";
import { PlayerState, RankedState } from "./schema.js";

interface JoinOptions {
  token?: string;
  isPrivate?: boolean;
  private?: boolean;
  roomCode?: string;
}

interface AuthUser {
  userId: string;
  displayName: string;
  rating: number;
}

export class RankedRoom extends Room<RankedState> {
  maxClients = 2;
  private sim!: GameSim;
  private tickInterval?: ReturnType<typeof setInterval>;
  private ratingApplied = false;
  private isPrivate = false;

  onCreate(options: JoinOptions): void {
    this.setState(new RankedState());
    this.sim = new GameSim(this.state);
    this.isPrivate = Boolean(options.isPrivate ?? options.private);
    this.state.isPrivate = this.isPrivate;
    this.autoDispose = true;

    const code = registerRoomCode(this.roomId);
    this.state.roomCode = code;

    this.setMetadata({
      roomCode: code,
      isPrivate: this.isPrivate,
      open: true,
    });

    // Private rooms created via API start empty — dispose if nobody joins.
    this.clock.setTimeout(() => {
      if (this.clients.length === 0) {
        void this.disconnect();
      }
    }, 120_000);
    this.onMessage("aim", (client, message: { angle?: number }) => {
      if (typeof message?.angle === "number") {
        this.sim.setAim(client.sessionId, message.angle);
      }
    });

    this.onMessage("fire", (client, message: { shotId?: string }) => {
      this.sim.fire(client.sessionId, message?.shotId);
    });

    this.onMessage("setTarget", (client, message: { mode?: number }) => {
      this.sim.setTarget(client.sessionId, Number(message?.mode) === 1 ? 1 : 0);
    });

    this.onMessage("pickCard", (client, message: { cardId?: string }) => {
      if (typeof message?.cardId === "string") {
        this.sim.pickCard(client.sessionId, message.cardId);
      }
    });

    this.onMessage("ready", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== "lobby") return;
      p.ready = true;
      this.tryStart();
    });
  }

  async onAuth(_client: Client, options: JoinOptions): Promise<AuthUser> {
    if (!options?.token) {
      throw new Error("Missing token");
    }
    const payload = verifyToken(options.token);
    const user = await getUserById(payload.userId);
    if (!user) throw new Error("User not found");
    return {
      userId: user._id.toString(),
      displayName: user.displayName,
      rating: user.rating,
    };
  }

  onJoin(client: Client, _options: JoinOptions, auth?: AuthUser): void {
    if (!auth) throw new Error("Unauthorized");
    const seat = this.clients.length - 1;
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = auth.userId;
    player.displayName = auth.displayName;
    player.rating = auth.rating;
    player.seat = seat;
    player.ready = false;
    this.state.players.set(client.sessionId, player);

    if (this.clients.length >= 2) {
      this.setMetadata({
        roomCode: this.state.roomCode,
        isPrivate: this.isPrivate,
        open: false,
      });
      // Auto-ready both when second joins for smoother MVP flow
      for (const [, p] of this.state.players) p.ready = true;
      this.tryStart();
    }
  }

  async onLeave(client: Client): Promise<void> {
    this.state.players.delete(client.sessionId);
    if (this.state.phase === "playing" && !this.sim.isEnded) {
      const remaining = [...this.state.players.keys()][0];
      if (remaining) {
        await this.endMatch(client.sessionId, remaining);
      }
    }
    if (this.clients.length === 0) {
      this.clock.setTimeout(() => this.disconnect(), 100);
    }
  }

  onDispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    unregisterRoomCode(this.roomId);
  }

  private tryStart(): void {
    if (this.state.phase !== "lobby") return;
    if (this.state.players.size < 2) return;
    const allReady = [...this.state.players.values()].every((p) => p.ready);
    if (!allReady) return;

    this.state.phase = "playing";
    this.sim.initChains();
    this.tickInterval = setInterval(() => this.step(), 1000 / TICK_HZ);
  }

  private step(): void {
    const result = this.sim.tick();
    if (result.loserSessionId) {
      const winner = this.sim.opponentSession(result.loserSessionId);
      void this.endMatch(result.loserSessionId, winner ?? "");
    }
  }

  private async endMatch(
    loserSessionId: string,
    winnerSessionId: string,
  ): Promise<void> {
    if (this.ratingApplied) return;
    this.ratingApplied = true;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }

    this.state.phase = "ended";
    this.state.loserId = loserSessionId;
    this.state.winnerId = winnerSessionId;
    this.state.ratingDelta = RATING_DELTA;

    const loser = this.state.players.get(loserSessionId);
    const winner = this.state.players.get(winnerSessionId);
    if (loser && winner) {
      try {
        await applyMatchRating(winner.userId, loser.userId, RATING_DELTA);
        winner.rating += RATING_DELTA;
        loser.rating -= RATING_DELTA;
      } catch (err) {
        console.error("[ranked] rating update failed", err);
      }
    }
  }
}
