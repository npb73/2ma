import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthTokenPayload {
  userId: string;
  displayName: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
}
