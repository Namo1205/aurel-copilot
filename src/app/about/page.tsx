import { Badge } from "@/components/ui";

const rows: { situation: string; does: string; never: string; handoff: string }[] = [
  {
    situation: "New booking enquiry",
    does: "Quotes live published rates for the dates and party, Flexible and Advance Purchase, with totals and terms.",
    never: "Invents a rate, discounts, or matches an OTA price.",
    handoff: "Non-public or negotiated rates → reservations manager.",
  },
  {
    situation: "Modify a booking",
    does: "Checks policy and live availability; proposes the change with the rate difference for approval.",
    never: "Changes an Advance Purchase booking or commits without approval.",
    handoff: "Policy exceptions → reservations manager.",
  },
  {
    situation: "Special request",
    does: "Creates a PMS trace per request with department owner and due date; tells the guest the team will confirm.",
    never: "Says a request is done or guaranteed (early check-in, upgrade, transfer).",
    handoff: "Hotel confirms in writing before arrival.",
  },
  {
    situation: "Pre-arrival question",
    does: "Answers from the hotel's own policy entries and cites them.",
    never: "Answers from general knowledge when no policy exists.",
    handoff: "No policy → hotel team.",
  },
  {
    situation: "Cancellation or refund",
    does: "States where the booking stands under its rate terms; drafts an empathetic holding reply.",
    never: "Confirms a refund, credit or waiver outside policy, or asks for medical proof.",
    handoff: "Outside policy → reservations manager, same day.",
  },
  {
    situation: "Group or event",
    does: "Acknowledges with a one-working-day SLA and captures the brief.",
    never: "Quotes or holds inventory for 8+ rooms or events.",
    handoff: "Always → Group Sales.",
  },
  {
    situation: "Allergy, medical, accessibility",
    does: "Minimal detail in a restricted trace; tells the guest who will see it.",
    never: "Puts it in free-text notes, forwards it by email, or promises an allergen-free kitchen.",
    handoff: "Owning department (F&B or front office).",
  },
  {
    situation: "Card details in a message",
    does: "Redacts before storage, replies with a secure payment link.",
    never: "Repeats, stores or forwards card data.",
    handoff: "None needed.",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-[960px] w-full p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">How the copilot works</h1>
        <p className="text-sm text-stone-600 mt-2 leading-relaxed">
          Aurel Copilot is an agent-assist layer for the central reservations office. It reads every inbound email, WhatsApp and OTA message, matches the booking,
          checks live rates and the hotel&apos;s own policies, and proposes three things: a triage, a set of PMS actions, and a draft reply. A reservations agent approves,
          edits or rejects each action before anything is sent or written. In v1 nothing goes out without a human.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">The loop</h2>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Read", "Classify the message, extract dates, party, requests and sensitive data. Redact card numbers before anything is stored."],
            ["Look up", "Booking by reference or surname. Live rates and availability. Hotel-specific policies. Modification and cancellation checks."],
            ["Propose", "Quotes, booking changes, traces to hotel departments, handoffs to people, and a channel-appropriate draft reply."],
            ["Approve", "The agent reviews each action, edits the draft, and sends. Approved writes go to the PMS; traces appear on the hotel board."],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-400">Step {i + 1}</div>
              <div className="font-medium">{t}</div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Behaviour spec</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Situation</th>
                <th className="text-left px-3 py-2 font-medium">It does</th>
                <th className="text-left px-3 py-2 font-medium">It never</th>
                <th className="text-left px-3 py-2 font-medium">Hands off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.situation} className="align-top">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.situation}</td>
                  <td className="px-3 py-2 text-stone-700">{r.does}</td>
                  <td className="px-3 py-2 text-stone-700">{r.never}</td>
                  <td className="px-3 py-2 text-stone-700">{r.handoff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Two engines, one contract</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          Both engines return the same structured proposal and go through the same code-level guardrails (card redaction, modification re-check, sensitive-trace flag, human approval).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <Badge tone="amber">Rules engine</Badge>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Deterministic, keyword and pattern based. Runs with no API key, so the prototype is always usable. It is also the regression baseline: every seed message has a known-good output.
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <Badge tone="green">Live model</Badge>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Claude with read-only PMS tools (lookup booking, rates, policies, modification and cancellation checks). Activated by setting <span className="font-mono">ANTHROPIC_API_KEY</span>. Its lookups are shown on the desk so the agent can see what it checked.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2 text-sm text-stone-600">
        <h2 className="font-medium text-stone-900">What this prototype does not do</h2>
        <ul className="list-disc pl-5 space-y-1 text-xs leading-relaxed">
          <li>No real email, WhatsApp or OTA connectors. Messages are seeded or typed in. State lives in your browser.</li>
          <li>No phone. Calls are handled by people; the copilot can only work from a typed call note.</li>
          <li>No payments. The payment link is a placeholder for the gateway.</li>
          <li>No auto-send. The &quot;auto-send eligible&quot; flag only measures how many messages would qualify in phase 2.</li>
        </ul>
      </section>
    </div>
  );
}
