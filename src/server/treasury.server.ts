import { createHash } from "node:crypto";
import type { SessionConfig } from "@tanstack/react-start/server";

const MIN_SESSION_PASSWORD_LENGTH = 32;
const FALLBACK_SESSION_SECRET = "dev-insecure-fallback-please-set-SESSION_SECRET-now";

function normalizeSessionPassword(secret?: string) {
  const value = secret?.trim() || FALLBACK_SESSION_SECRET;
  if (value.length >= MIN_SESSION_PASSWORD_LENGTH) {
    return value;
  }

  return createHash("sha256").update(value).digest("hex");
}

export function getSessionConfig(): SessionConfig {
  return {
    password: normalizeSessionPassword(process.env.SESSION_SECRET),
    name: "treasurer_session",
    maxAge: 60 * 60 * 8, // 8 hours
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    },
  };
}

export type TreasurerSession = { authenticated?: boolean; loginAt?: number };

// Constant-time string compare
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Tiny in-memory rate limiter (per-process). Good enough for guest submissions.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}