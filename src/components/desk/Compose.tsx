"use client";

// Simulates an inbound email for demos and rehearsals. Email is the only channel in v1
// (PRD: WhatsApp in week 11, OTA messaging in Q2), so there is nothing else to pick.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui";

const EXAMPLES: { label: string; fromName: string; from: string; subject: string; body: string }[] = [
  {
    label: "Rate enquiry",
    fromName: "Sofia Laurent",
    from: "sofia.l@example.com",
    subject: "Comporta in June",
    body: "Hello, do you have a Dune Villa available 12-16 June for 2 adults? What would the rate be?",
  },
  {
    label: "Wheelchair access",
    fromName: "George Adeyemi",
    from: "g.adeyemi@example.com",
    subject: "Booking AUR-48402 - access",
    body: "My wife uses a wheelchair. Can you make sure our room in Rome is step-free and has a roll-in shower? Booking AUR-48402.",
  },
  {
    label: "Policy question",
    fromName: "Nikos Alexiou",
    from: "nikos.a@example.com",
    subject: "Check-out at Athens",
    body: "Hi, what time is check out at Athens? And is there a gym?",
  },
];

export function Compose({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
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
        channel: "email",
        fromName: fromName.trim() || "Guest",
        from: from.trim() || "unknown",
        subject: subject.trim() || undefined,
        body: body.trim(),
        receivedMinutesAgo: 0,
      },
    });
    onClose();
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-center">
        <h3 className="font-semibold text-sm">Simulate an inbound email</h3>
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
              setFromName(e.fromName);
              setFrom(e.from);
              setSubject(e.subject);
              setBody(e.body);
            }}
            className="px-2 py-0.5 rounded-full border border-stone-300 hover:bg-stone-50"
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Guest name" className="rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Email address" className="rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={4} className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!body.trim()}>
          Add to inbox
        </Button>
      </div>
    </div>
  );
}
