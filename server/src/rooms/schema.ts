import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class BallState extends Schema {
  @type("string") id: string = "";
  @type("uint8") color: number = 0;
  /** Distance along path in pixels from spawn. */
  @type("float32") dist: number = 0;
}

export class ProjectileState extends Schema {
  @type("string") id: string = "";
  @type("string") ownerSessionId: string = "";
  @type("uint8") color: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
  /** 0 = own chain, 1 = opponent */
  @type("uint8") targetMode: number = 0;
  @type("boolean") wild: boolean = false;
}

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") userId: string = "";
  @type("string") displayName: string = "";
  @type("int16") rating: number = 1000;
  @type("uint8") seat: number = 0;
  @type("boolean") ready: boolean = false;
  @type("float32") aim: number = 0;
  @type("uint8") currentColor: number = 0;
  @type("uint8") nextColor: number = 1;
  @type("uint8") targetMode: number = 0;
  @type("uint16") combo: number = 0;
  @type("uint16") level: number = 0;
  @type("string") pendingCard: string = "";
  @type(["string"]) usedCards = new ArraySchema<string>();
  @type("uint8") wildShotsLeft: number = 0;
  @type("boolean") explodeNeighbors: boolean = false;
  /** Timestamp (ms) until opponent speed boost ends — stored on victim via effect. */
  @type("float64") speedMultUntil: number = 0;
  @type("float32") speedMult: number = 1;
  @type([BallState]) chain = new ArraySchema<BallState>();
}

export class RankedState extends Schema {
  @type("string") phase: string = "lobby";
  @type("string") roomCode: string = "";
  @type("boolean") isPrivate: boolean = false;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([ProjectileState]) projectiles = new ArraySchema<ProjectileState>();
  /**
   * Ring buffer of recently resolved (hit / off-screen) projectile ids.
   * Clients use this to despawn predicted local shots even when the
   * projectile was added+removed between two patches.
   */
  @type(["string"]) resolvedShotIds = new ArraySchema<string>();
  @type("string") winnerId: string = "";
  @type("string") loserId: string = "";
  @type("int16") ratingDelta: number = 30;
}
