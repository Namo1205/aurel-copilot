// Offline check of the Gmail message parser: a fake API payload with an HTML part,
// a quoted history and a booking reference, no credentials needed.
import { toInbound } from "../src/lib/gmail";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const plain = `Hi there,\n\nCan we add a cot for our stay AUR-48213 in May? Also what time is check-in?\n\nThanks,\nPriya\n\nOn Thu, 23 Oct 2026 at 10:02, Aurel Reservations <desk@example.com> wrote:\n> Dear Priya, your booking is confirmed.\n> Warm regards`;
const msg = {
  id: "18f0abc",
  threadId: "18f0aaa",
  internalDate: String(Date.now() - 5 * 60000),
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "From", value: "Priya Sharma <priya.sharma@example.com>" },
      { name: "To", value: "aurel.desk.demo@gmail.com" },
      { name: "Subject", value: "Re: Our stay in May" },
      { name: "Message-ID", value: "<abc123@mail.example.com>" },
      { name: "References", value: "<root@mail.example.com>" },
    ],
    parts: [
      { mimeType: "text/plain", body: { data: b64(plain) } },
      { mimeType: "text/html", body: { data: b64("<p>Hi there,</p><p>Can we add a cot…</p>") } },
    ],
  },
};
const out = toInbound(msg as never);
console.log(JSON.stringify(out, null, 2));
if (out.body.includes("wrote:") || out.body.includes(">")) throw new Error("quoted history not stripped");
if (out.bookingRef !== "AUR-48213") throw new Error("booking reference not picked up");
if (out.from !== "priya.sharma@example.com" || out.fromName !== "Priya Sharma") throw new Error("sender not parsed");
console.log("\nparser ok");
