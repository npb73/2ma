import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class BallState extends Schema {
  @type("string") id: string = "";
  /** Ball type id from shared BALL_TYPES catalog. */
  @type("string") typeId: string = "solid_0";
  /** Distance along path in pixels from spawn. */
  @type("float32") dist: number = 0;
  /** Bomb fuse seconds remaining; <0 means inactive / not a lit bomb. */
  @type("float32") fuse: number = -1;
}

export class ProjectileState extends Schema {
  @type("string") id: string = "";
  @type("string") ownerSessionId: string = "";
  @type("string") typeId: string = "solid_0";
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
}

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") userId: string = "";
  @type("string") displayName: string = "";
  @type("int16") rating: number = 1000;
  @type("uint8") seat: number = 0;
  @type("boolean") ready: boolean = false;
  @type("float32") aim: number = 0;
  @type("string") currentType: string = "solid_0";
  @type("string") nextType: string = "solid_1";
  @type("uint16") combo: number = 0;
  @type("uint16") level: number = 0;
  /** Cleared-ball progress toward the next level. */
  @type("uint16") exp: number = 0;
  /** Level-ups waiting for a pick while an offer is already open. */
  @type("uint8") offerDebt: number = 0;
  /** Weighted ball pool (each entry = equal spawn chance). */
  @type(["string"]) ballPool = new ArraySchema<string>();
  /** Level-up offer: up to 3 ball type ids. */
  @type(["string"]) pendingOffer = new ArraySchema<string>();
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
  /** Shared RNG seed — both seats draw the same unit stream. */
  @type("uint32") ballSeed: number = 0;
}
