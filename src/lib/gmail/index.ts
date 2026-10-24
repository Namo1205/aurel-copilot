// Live Gmail link for the demo. Plain REST calls to the Gmail API with an OAuth
// refresh token; no SDK. Reads new mail from the desk mailbox, labels what it has
// taken, and sends replies in the same thread. Only ever replies to the sender.

import type { InboundMessage } from "@/lib/inbox/seed";

const LABEL_NAME = "Aurel/Desk";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

export function gmailSendEnabled(): boolean {
  return gmailConfigured() && process.env.GMAIL_SEND !== "off";
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 30_000) return cached.token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Gmail token refresh failed: ${j.error ?? r.status} ${j.error_description ?? ""}`.trim());
  cached = { token: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function gmail<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Gmail ${init?.method ?? "GET"} ${path} failed (${r.status}): ${text.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

export async function profile(): Promise<{ emailAddress: string }> {
  return gmail<{ emailAddress: string }>("/profile");
}

// --- labels ---------------------------------------------------------------

let labelId: string | null = null;

async function deskLabelId(): Promise<string> {
  if (labelId) return labelId;
  const list = await gmail<{ labels: { id: string; name: string }[] }>("/labels");
  const found = list.labels.find((l) => l.name === LABEL_NAME);
  if (found) return (labelId = found.id);
  const created = await gmail<{ id: string }>("/labels", {
    method: "POST",
    body: JSON.stringify({ name: LABEL_NAME, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return (labelId = created.id);
}

// --- reading ---------------------------------------------------------------

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload: GmailPart;
}

function b64url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findPart(p: GmailPart, mime: string): GmailPart | undefined {
  if (p.mimeType === mime && p.body?.data) return p;
  for (const c of p.parts ?? []) {
    const f = findPart(c, mime);
    if (f) return f;
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Cut the quoted history off a reply so the AI agent reads only the new words.
function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{5,120} wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From: .+@.+/.test(line.trim()) && out.length > 0) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseFrom(value: string): { name: string; email: string } {
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { name: value.trim(), email: value.trim().toLowerCase() };
}

function header(p: GmailPart, name: string): string {
  return p.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function toInbound(m: GmailMessage): InboundMessage {
  const from = parseFrom(header(m.payload, "From"));
  const subject = header(m.payload, "Subject");
  const plain = findPart(m.payload, "text/plain");
  const html = findPart(m.payload, "text/html");
  const raw = plain?.body?.data ? b64url(plain.body.data) : html?.body?.data ? stripHtml(b64url(html.body.data)) : m.payload.body?.data ? b64url(m.payload.body.data) : "";
  const body = stripQuoted(raw) || "(empty message)";
  const received = m.internalDate ? Number(m.internalDate) : Date.now();
  const refMatch = `${subject} ${body}`.match(/\bAUR-\d{5}\b/);
  return {
    id: `gmail-${m.id}`,
    channel: "email",
    from: from.email,
    fromName: from.name,
    subject: subject || undefined,
    body: body.slice(0, 6000),
    receivedMinutesAgo: Math.max(0, Math.round((Date.now() - received) / 60000)),
    bookingRef: refMatch?.[0],
    gmail: {
      id: m.id,
      threadId: m.threadId,
      messageId: header(m.payload, "Message-ID"),
      references: header(m.payload, "References") || undefined,
      to: header(m.payload, "To") || undefined,
    },
  };
}

// New, unread mail in the inbox that the desk has not taken yet. Each message
// is labelled and marked read as it is taken, so it is only delivered once.
export async function pullNewMessages(max = 10): Promise<InboundMessage[]> {
  const q = `in:inbox is:unread -label:${LABEL_NAME} newer_than:3d`;
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  const ids = list.messages ?? [];
  if (!ids.length) return [];
  const label = await deskLabelId();
  const out: InboundMessage[] = [];
  for (const { id } of ids) {
    const full = await gmail<GmailMessage>(`/messages/${id}?format=full`);
    // Skip what the desk itself sent, and system mail nobody should ever reply to
    // (Google account notices, bounces, newsletters).
    const fromHeader = header(full.payload, "From").toLowerCase();
    if (fromHeader.includes((await selfAddress()).toLowerCase()) || isSystemSender(fromHeader)) {
      await gmail(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [label], removeLabelIds: ["UNREAD"] }) });
      continue;
    }
    out.push(toInbound(full));
    await gmail(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [label], removeLabelIds: ["UNREAD"] }) });
  }
  return out;
}

const SYSTEM_SENDER = /no-?reply|do-?not-?reply|mailer-daemon|postmaster|@google\.com|@accounts\.google|notification|newsletter/i;
export function isSystemSender(from: string): boolean {
  return SYSTEM_SENDER.test(from);
}

let self: string | null = null;
async function selfAddress(): Promise<string> {
  if (self) return self;
  self = (await profile()).emailAddress;
  return self;
}

// --- sending ---------------------------------------------------------------

function encodeHeader(value: string): string {
  // RFC 2047 so accents in names and subjects survive.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function sendReply(input: { message: InboundMessage; body: string }): Promise<{ id: string; threadId: string; to: string }> {
  const { message, body } = input;
  if (!gmailSendEnabled()) throw new Error("Gmail sending is off (GMAIL_SEND=off or not configured).");
  if (!message.gmail) throw new Error("This message did not come from Gmail; nothing to reply to.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.from)) throw new Error(`Refusing to send: sender address "${message.from}" is not a valid email.`);
  if (isSystemSender(message.from)) throw new Error(`Refusing to send: "${message.from}" is a system address.`);
  const me = await selfAddress();
  const subject = message.subject ? (/^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`) : "Re: your message to Aurel Reservations";
  const refs = [message.gmail.references, message.gmail.messageId].filter(Boolean).join(" ");
  // Headers, one blank line, then the body. The blank line is what makes the text an
  // email body rather than one more header, so it is added after empty optional headers are dropped.
  const headers = [
    `From: Aurel Reservations <${me}>`,
    `To: ${encodeHeader(message.fromName)} <${message.from}>`,
    `Subject: ${encodeHeader(subject)}`,
    message.gmail.messageId ? `In-Reply-To: ${message.gmail.messageId}` : "",
    refs ? `References: ${refs}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter((l) => l !== "");
  const mime = headers.join("\r\n") + "\r\n\r\n" + Buffer.from(body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sent = await gmail<{ id: string; threadId: string }>("/messages/send", { method: "POST", body: JSON.stringify({ raw, threadId: message.gmail.threadId }) });
  return { ...sent, to: message.from };
}
