// Live Gmail link for the demo. Plain REST calls to the Gmail API with an OAuth
// refresh token; no SDK. Reads new mail from the desk mailbox, labels what it has
// taken, and sends replies in the same thread. Only ever replies to the sender.

import type { InboundMessage } from "@/lib/inbox/seed";

// Labels are the only state the mailbox link keeps, and they live in Gmail itself.
export const LABELS = {
  desk: "Aurel/Desk", // taken by a desk tab, delivered once
  autoReplied: "Aurel/Auto-replied", // the scheduled check already answered it
  waiting: "Aurel/Waiting", // the scheduled check saw it; it needs a person
} as const;
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

const labelIds = new Map<string, string>();

async function labelId(name: string): Promise<string> {
  const hit = labelIds.get(name);
  if (hit) return hit;
  const list = await gmail<{ labels: { id: string; name: string }[] }>("/labels");
  for (const l of list.labels) labelIds.set(l.name, l.id);
  const found = labelIds.get(name);
  if (found) return found;
  const created = await gmail<{ id: string }>("/labels", {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  labelIds.set(name, created.id);
  return created.id;
}

export async function addLabels(gmailId: string, names: string[]): Promise<void> {
  const addLabelIds = await Promise.all(names.map(labelId));
  await gmail(`/messages/${gmailId}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds }) });
}

// --- reading ---------------------------------------------------------------

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

// Real attachments only: parts with a file name and an id. Small inline images (signature
// logos) are skipped.
function collectAttachments(p: GmailPart, out: NonNullable<InboundMessage["attachments"]> = []): NonNullable<InboundMessage["attachments"]> {
  const disposition = p.headers?.find((h) => h.name.toLowerCase() === "content-disposition")?.value.toLowerCase() ?? "";
  const size = p.body?.size ?? 0;
  const inlineLogo = disposition.startsWith("inline") && (p.mimeType ?? "").startsWith("image/") && size < 50 * 1024;
  if (p.filename && p.body?.attachmentId && !inlineLogo) out.push({ id: p.body.attachmentId, name: p.filename, mimeType: p.mimeType ?? "application/octet-stream", size });
  for (const c of p.parts ?? []) collectAttachments(c, out);
  return out;
}

// One attachment's bytes, fetched from Gmail when a person opens it.
export async function fetchAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const a = await gmail<{ data?: string; size?: number }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  if (!a.data) throw new Error("Attachment has no data.");
  return Buffer.from(a.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  labelIds?: string[];
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
  const attachments = collectAttachments(m.payload);
  return {
    id: `gmail-${m.id}`,
    channel: "email",
    from: from.email,
    fromName: from.name,
    subject: subject || undefined,
    body: body.slice(0, 6000),
    receivedMinutesAgo: Math.max(0, Math.round((Date.now() - received) / 60000)),
    bookingRef: refMatch?.[0],
    attachments: attachments.length ? attachments : undefined,
    gmail: {
      id: m.id,
      threadId: m.threadId,
      at: new Date(received).toISOString(),
      messageId: header(m.payload, "Message-ID"),
      references: header(m.payload, "References") || undefined,
      to: header(m.payload, "To") || undefined,
    },
  };
}

// Unread inbox mail no desk tab has taken. Changes nothing in the mailbox except
// system mail (the desk's own copies, Google notices, bounces), which is labelled
// as taken and skipped so it is never replied to. Messages the scheduled check has
// already answered come back flagged, so the caller shows the reply instead of sending one.
export async function listNewMessages(opts: { max?: number; excludeLabels?: string[] } = {}): Promise<InboundMessage[]> {
  const exclude = [LABELS.desk, ...(opts.excludeLabels ?? [])];
  const q = `in:inbox is:unread ${exclude.map((l) => `-label:${l}`).join(" ")} newer_than:3d`;
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=${opts.max ?? 10}`);
  const ids = list.messages ?? [];
  if (!ids.length) return [];
  const [desk, autoReplied, me] = await Promise.all([labelId(LABELS.desk), labelId(LABELS.autoReplied), selfAddress()]);
  const out: InboundMessage[] = [];
  for (const { id } of ids) {
    const full = await gmail<GmailMessage>(`/messages/${id}?format=full`);
    const fromHeader = header(full.payload, "From").toLowerCase();
    if (fromHeader.includes(me.toLowerCase()) || isSystemSender(fromHeader)) {
      await gmail(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [desk], removeLabelIds: ["UNREAD"] }) });
      continue;
    }
    const msg = toInbound(full);
    msg.gmail!.autoReplied = (full.labelIds ?? []).includes(autoReplied);
    out.push(msg);
  }
  return out;
}

// A desk tab takes a message: labelled and marked read, so it is delivered once.
export async function markTaken(gmailId: string): Promise<void> {
  const [desk, waiting] = await Promise.all([labelId(LABELS.desk), labelId(LABELS.waiting)]);
  await gmail(`/messages/${gmailId}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [desk], removeLabelIds: ["UNREAD", waiting] }) });
}

// What a desk tab polls: every new message, taken as it is read.
export async function pullNewMessages(max = 10): Promise<InboundMessage[]> {
  const list = await listNewMessages({ max });
  for (const m of list) await markTaken(m.gmail!.id);
  return list;
}

export interface OwnReply {
  body: string;
  at: string;
}

export interface ThreadHistory {
  // What the desk itself sent, oldest first.
  own: OwnReply[];
  // What the guest wrote, oldest first, quoted history stripped.
  guest: { body: string; at: string }[];
}

function messageAt(m: GmailMessage): string {
  return new Date(Number(m.internalDate ?? Date.now())).toISOString();
}

// Split one thread's messages into the desk's replies and the guest's messages.
function splitThread(messages: GmailMessage[], me: string): ThreadHistory {
  const own: OwnReply[] = [];
  const guest: { body: string; at: string }[] = [];
  for (const m of messages) {
    const from = header(m.payload, "From").toLowerCase();
    const plain = findPart(m.payload, "text/plain");
    const html = findPart(m.payload, "text/html");
    const raw = plain?.body?.data ? b64url(plain.body.data) : html?.body?.data ? stripHtml(b64url(html.body.data)) : m.payload.body?.data ? b64url(m.payload.body.data) : "";
    const at = messageAt(m);
    if (from.includes(me)) own.push({ body: raw.trim(), at });
    else if (!isSystemSender(from)) guest.push({ body: stripQuoted(raw).slice(0, 2000), at });
  }
  const byTime = (a: { at: string }, b: { at: string }) => Date.parse(a.at) - Date.parse(b.at);
  return { own: own.sort(byTime), guest: guest.sort(byTime) };
}

// One Gmail thread, split into the desk's replies and the guest's messages.
export async function threadHistory(threadId: string): Promise<ThreadHistory> {
  const me = (await selfAddress()).toLowerCase();
  const t = await gmail<{ messages?: GmailMessage[] }>(`/threads/${threadId}?format=full`);
  return splitThread(t.messages ?? [], me);
}

// One guest message as the sync hands it to a desk: with the reply the desk sent to it,
// if any, and whether a desk has already taken it.
export interface SyncItem {
  message: InboundMessage;
  receivedAt: string;
  reply: OwnReply | null;
  taken: boolean;
}

function itemsFromThread(messages: GmailMessage[], me: string, deskLabel: string, autoRepliedLabel: string): SyncItem[] {
  const { own } = splitThread(messages, me);
  const out: SyncItem[] = [];
  for (const m of messages) {
    const from = header(m.payload, "From").toLowerCase();
    if (from.includes(me) || isSystemSender(from)) continue;
    const message = toInbound(m);
    const labels = m.labelIds ?? [];
    message.gmail!.autoReplied = labels.includes(autoRepliedLabel);
    const receivedAt = messageAt(m);
    // The first reply the desk sent after this message is the one that answered it.
    const reply = own.find((r) => Date.parse(r.at) > Date.parse(receivedAt)) ?? null;
    out.push({ message, receivedAt, reply, taken: labels.includes(deskLabel) });
  }
  return out;
}

// One page of the whole mailbox, oldest guest messages with their replies, for the
// automatic load when a desk opens. Pages through every thread, any age.
export async function listThreadsPage(pageToken?: string | null, max = 15): Promise<{ items: SyncItem[]; nextPageToken: string | null; estimate: number }> {
  const q = "-in:spam -in:trash -in:drafts -in:chats";
  const list = await gmail<{ threads?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
    `/threads?q=${encodeURIComponent(q)}&maxResults=${max}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
  );
  const [me, desk, autoReplied] = await Promise.all([selfAddress(), labelId(LABELS.desk), labelId(LABELS.autoReplied)]);
  const items: SyncItem[] = [];
  for (const t of list.threads ?? []) {
    const full = await gmail<{ messages?: GmailMessage[] }>(`/threads/${t.id}?format=full`);
    items.push(...itemsFromThread(full.messages ?? [], me.toLowerCase(), desk, autoReplied));
  }
  items.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  return { items, nextPageToken: list.nextPageToken ?? null, estimate: list.resultSizeEstimate ?? 0 };
}

// Messages some desk took since `sinceIso`: the scheduled check's auto-replies, or mail
// another browser took. Lets every open desk show them within one poll.
export async function recentlyTaken(sinceIso: string, max = 20): Promise<SyncItem[]> {
  const after = Math.floor(Date.parse(sinceIso) / 1000);
  if (!Number.isFinite(after)) return [];
  const q = `label:${LABELS.desk} after:${after}`;
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  const ids = list.messages ?? [];
  if (!ids.length) return [];
  const [me, desk, autoReplied] = await Promise.all([selfAddress(), labelId(LABELS.desk), labelId(LABELS.autoReplied)]);
  const threads = new Map<string, Promise<GmailMessage[]>>();
  const wanted = new Set(ids.map((m) => m.id));
  const out: SyncItem[] = [];
  for (const { threadId } of ids) {
    if (!threads.has(threadId)) threads.set(threadId, gmail<{ messages?: GmailMessage[] }>(`/threads/${threadId}?format=full`).then((t) => t.messages ?? []));
  }
  for (const [, p] of threads) {
    const messages = await p;
    for (const item of itemsFromThread(messages, me.toLowerCase(), desk, autoReplied)) if (wanted.has(item.message.gmail!.id)) out.push(item);
  }
  return out.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
}

// Every reply the desk itself sent in a thread, oldest first.
export async function ownRepliesInThread(threadId: string): Promise<OwnReply[]> {
  return (await threadHistory(threadId)).own;
}

// Attach the guest's earlier messages in the thread to a new message, so the sorter
// reads a short reply together with the question it answers. Returns the history.
export async function attachThreadContext(msg: InboundMessage): Promise<ThreadHistory | null> {
  if (!msg.gmail?.threadId) return null;
  const hist = await threadHistory(msg.gmail.threadId).catch(() => null);
  if (!hist) return null;
  const at = msg.gmail.at ? Date.parse(msg.gmail.at) : Date.now();
  const prior = hist.guest.filter((g) => Date.parse(g.at) < at);
  if (prior.length) msg.priorMessages = prior;
  return hist;
}

// The desk's latest reply in a thread: what the scheduled check sent.
export async function ownReplyInThread(threadId: string): Promise<OwnReply | null> {
  const all = await ownRepliesInThread(threadId);
  return all[all.length - 1] ?? null;
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

export interface OutgoingAttachment {
  name: string;
  mimeType: string;
  dataBase64: string;
}

// Up to a few MB in total: Vercel accepts about 4.5 MB per request, base64 included.
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export function attachmentsTooLarge(atts: OutgoingAttachment[] | undefined): boolean {
  return !!atts && atts.reduce((s, a) => s + Math.floor((a.dataBase64.length * 3) / 4), 0) > MAX_ATTACHMENT_BYTES;
}

const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");
const asciiName = (name: string) => name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

// The raw email: headers, one blank line, then either the text alone or a multipart body
// with the text first and each file after it.
export function buildMime(headers: string[], body: string, attachments: OutgoingAttachment[] = []): string {
  if (!attachments.length) {
    const h = [...headers, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64"];
    return h.join("\r\n") + "\r\n\r\n" + wrap76(Buffer.from(body, "utf8").toString("base64"));
  }
  const boundary = `aurel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const h = [...headers, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`];
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(Buffer.from(body, "utf8").toString("base64"))}`,
    ...attachments.map((a) => {
      const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType) ? a.mimeType : "application/octet-stream";
      const name = asciiName(a.name) || "attachment";
      return `--${boundary}\r\nContent-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(a.dataBase64.replace(/\s+/g, ""))}`;
    }),
  ];
  return h.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + `\r\n--${boundary}--`;
}

export async function sendReply(input: { message: InboundMessage; body: string; attachments?: OutgoingAttachment[] }): Promise<{ id: string; threadId: string; to: string }> {
  const { message, body, attachments } = input;
  if (attachmentsTooLarge(attachments)) throw new Error(`Attachments are limited to ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB in total.`);
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
  ].filter((l) => l !== "");
  const mime = buildMime(headers, body, attachments);
  const raw = Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sent = await gmail<{ id: string; threadId: string }>("/messages/send", { method: "POST", body: JSON.stringify({ raw, threadId: message.gmail.threadId }) });
  return { ...sent, to: message.from };
}
