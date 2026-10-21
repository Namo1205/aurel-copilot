"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui";
import type { Channel } from "@/lib/agent/schema";

const EXAMPLES: { label: string; channel: Channel; fromName: string; from: string; subject?: string; body: string }[] = [
  {
    label: "Rate enquiry",
    channel: "email",
    fromName: "Sofia Laurent",
    from: "sofia.l@example.com",
    subject: "Comporta in June",
    body: "Hello, do you have a Dune Villa available 12-16 June for 2 adults? What would the rate be?",
  },
  {
    label: "Wheelchair access",
    channel: "email",
    fromName: "George Adeyemi",
    from: "g.adeyemi@example.com",
    subject: "Booking AUR-48402 - access",
    body: "My wife uses a wheelchair. Can you make sure our room in Rome is step-free and has a roll-in shower? Booking AUR-48402.",
  },
  {
    label: "Late check-out",
    channel: "whatsapp",
    fromName: "Unknown (WhatsApp)",
    from: "+33 6 00 00 00 00",
    body: "Hi, what time is check out at Athens? And is there a gym?",
  },
];

export function Compose({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [channel, setChannel] = useState<Channel>("email");
  const [fromName, setFromName] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const submit = () => {
    if (!body.trim()) return;
    dispatch({
      type: "add_message",
      message: {
        id: `m-${Date.now().toString(36)}`,
        channel,
        fromName: fromName.trim() || (channel === "whatsapp" ? "Unknown (WhatsApp)" : "Guest"),
        from: from.trim() || "unknown",
        subject: channel === "email" || channel === "ota" ? subject.trim() || undefined : undefined,
        body: body.trim(),
        receivedMinutesAgo: 0,
      },
    });
    onClose();
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-center">
        <h3 className="font-semibold text-sm">Simulate an inbound message</h3>
        <button onClick={onClose} className="ml-auto text-xs text-stone-500 hover:underline">
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-stone-500">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            onClick={() => {
              setChannel(e.channel);
              setFromName(e.fromName);
              setFrom(e.from);
              setSubject(e.subject ?? "");
              setBody(e.body);
            }}
            className="px-2 py-0.5 rounded-full border border-stone-300 hover:bg-stone-50"
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="rounded-md border border-stone-300 px-2 py-1.5 text-sm bg-white">
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="ota">OTA message</option>
          <option value="phone">Phone note</option>
        </select>
        <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Guest name" className="rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Email or number" className="rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      </div>
      {channel === "email" || channel === "ota" ? (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      ) : null}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={4} className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!body.trim()}>
          Add to inbox
        </Button>
      </div>
    </div>
  );
}
