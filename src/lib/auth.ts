// Desk sign-in for the API routes. The browser keeps the role for display; the
// server trusts only this cookie. One shared password (DESK_PASSWORD) and a
// signing secret (DESK_SECRET); both default for local development.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ROSTER, type Role } from "@/lib/desk/roster";

const COOKIE = "aurel_desk_session";
const MAX_AGE_SECONDS = 7 * 24 * 3600;

export const DESK_PASSWORD = process.env.DESK_PASSWORD || "aurel";
const SECRET = process.env.DESK_SECRET || `dev-only:${DESK_PASSWORD}`;

export interface ServerSession {
  staffId: string;
  role: Role;
  name: string;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(pw: unknown): boolean {
  return typeof pw === "string" && safeEqual(pw, DESK_PASSWORD);
}

// Token: "<staffId>.<expiry seconds>.<signature>". No personal data inside.
export function issueToken(staffId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const payload = `${staffId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined, now = Date.now()): ServerSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [staffId, expStr, sig] = parts;
  if (!safeEqual(sig, sign(`${staffId}.${expStr}`))) return null;
  if (!/^\d+$/.test(expStr) || Number(expStr) * 1000 < now) return null;
  const s = ROSTER.find((x) => x.id === staffId);
  if (!s) return null;
  return { staffId: s.id, role: s.role, name: s.name };
}

export async function setSessionCookie(staffId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, issueToken(staffId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<ServerSession | null> {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}

// For route handlers: `const s = await getSession(); if (!s) return unauthorized();`
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Sign in to the desk first." }, { status: 401 });
}

// The scheduled mailbox check authenticates with a bearer token, not a cookie.
export function cronConfigured(): boolean {
  return !!process.env.CRON_SECRET;
}

export function checkCronSecret(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(authorizationHeader ?? "", `Bearer ${secret}`);
}
