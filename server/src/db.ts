import { MongoClient, type Collection, type Db, ObjectId } from "mongodb";
import { STARTING_RATING } from "@2ma/shared";
import { config } from "./config.js";

export interface UserDoc {
  _id: ObjectId;
  yandexId: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

let client: MongoClient;
let db: Db;

export async function connectDb(): Promise<void> {
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db();
  await users().createIndex({ yandexId: 1 }, { unique: true });
  console.log("[db] connected", config.mongoUri);
}

export function users(): Collection<UserDoc> {
  return db.collection<UserDoc>("users");
}

export async function findOrCreateYandexUser(input: {
  yandexId: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<UserDoc> {
  const now = new Date();
  const existing = await users().findOne({ yandexId: input.yandexId });
  if (existing) {
    await users().updateOne(
      { _id: existing._id },
      {
        $set: {
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          updatedAt: now,
        },
      },
    );
    return {
      ...existing,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      updatedAt: now,
    };
  }

  const doc: UserDoc = {
    _id: new ObjectId(),
    yandexId: input.yandexId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    rating: STARTING_RATING,
    createdAt: now,
    updatedAt: now,
  };
  await users().insertOne(doc);
  return doc;
}

export async function getUserById(id: string): Promise<UserDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return users().findOne({ _id: new ObjectId(id) });
}

export async function applyMatchRating(
  winnerId: string,
  loserId: string,
  delta: number,
): Promise<void> {
  const now = new Date();
  await Promise.all([
    users().updateOne(
      { _id: new ObjectId(winnerId) },
      { $inc: { rating: delta }, $set: { updatedAt: now } },
    ),
    users().updateOne(
      { _id: new ObjectId(loserId) },
      { $inc: { rating: -delta }, $set: { updatedAt: now } },
    ),
  ]);
}
