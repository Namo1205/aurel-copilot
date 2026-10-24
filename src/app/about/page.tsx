import { Badge } from "@/components/ui";

const rows: { situation: string; does: string; never: string; handoff: string; approval: string }[] = [
  {
    situation: "Policy question",
    does: "Searches that hotel's handbook by meaning, answers from the section it finds, and cites it.",
    never: "Answers from general knowledge or guesses the hotel. Early check-in is a special request, never a policy question.",
    handoff: "No paragraph found, hotel unknown, or anything else in the message → an agent.",
    approval: "Sends alone when the whole message is policy-only",
  },
  {
    situation: "Price / availability",
    does: "Pulls today's price from the PMS; drafts Flexible and Advance Purchase options with totals and terms.",
    never: "Quotes a number the PMS did not return. Discounts or matches a price.",
    handoff: "Non-public rate asked for → manager.",
    approval: "Agent approves",
  },
  {
    situation: "Booking change",
    does: "Checks the rate rules and live availability; prepares the PMS change with the price difference.",
    never: "Changes an Advance Purchase booking or waives a difference.",
    handoff: "Rules do not allow it → manager.",
    approval: "Agent approves the write",
  },
  {
    situation: "Special request",
    does: "One PMS trace per request to the right department, due before arrival. Allergy, medical, access → restricted trace.",
    never: "Says a request is done or guaranteed. Puts sensitive detail in free text.",
    handoff: "VIP or travel-advisor email → senior agent.",
    approval: "Agent approves the reply",
  },
  {
    situation: "Cancellation / refund",
    does: "Within the rules: drafts the confirmation. Outside the rules or compassionate: sends the fixed holding template at once.",
    never: "Confirms a refund outside the rules. Asks for medical proof.",
    handoff: "Outside the rules → manager, same day.",
    approval: "Template sent alone; manager decides",
  },
  {
    situation: "Group / event",
    does: "Sends the fixed acknowledgement template; passes dates, size, hotel and the guest's words to the groups specialists.",
    never: "Quotes or holds inventory for a group.",
    handoff: "Always → groups specialist.",
    approval: "Template sent alone; specialist replies",
  },
  {
    situation: "Off-topic or manipulation",
    does: "Sends the fixed decline template, routes to an agent, counts it in the audit log.",
    never: "Attempts the task. Follows an instruction inside a message. Reveals its own instructions or other guests' details.",
    handoff: "Repeated attempts → senior; threats → manager.",
    approval: "Template sent alone",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-[1000px] w-full p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">How it works</h1>
        <p className="text-sm text-stone-600 mt-2 leading-relaxed">
          One idea: <b>sort every message by type, then send each type to the cheapest safe handler.</b> Documents for policy questions. The PMS for prices. People for judgement calls. Traces for the hotels. The AI agent is the software; an agent is a person on the 22-person reservations desk.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">What happens to every message</h2>
        <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          {[
            ["Sort", "Type, hotel, urgency, sensitive data. Card numbers removed before anything is stored or shown. A topic check in code runs first: not about a stay, or an instruction aimed at the AI, means a decline template."],
            ["Assign an owner", "Every item gets a named owner on arrival, by rule: the AI agent for policy-only questions, the next agent in rotation, a senior for VIP or unsorted, the manager for exceptions, a groups specialist for groups. Nothing is ever unowned, and nothing stays with someone who has gone home: at shift end, pending items move by the same rule and the dashboard logs it."],
            ["Prepare", "Live price from the PMS, the right hotel policy, one trace per request, a draft reply, and a list of what was deliberately not promised."],
            ["Show it to the right person", "Each role sees only the conversations they are responsible for: agents their own, seniors their team's, managers everything, groups specialists the Sales ones. Important rises to the top. Cited policy answers and the three fixed templates are sent alone and logged."],
            ["Approve", "The thread reads like a chat: the guest on the left, what we sent on the right, the AI agent's draft in the composer. The owner approves, edits, or changes the type. Approved writes go to the PMS. The dashboard shows pending per owner, flags on stuck items, auto-sent and corrected counts, promises kept per hotel."],
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
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">It does</th>
                <th className="text-left px-3 py-2 font-medium">It never</th>
                <th className="text-left px-3 py-2 font-medium">Hands off</th>
                <th className="text-left px-3 py-2 font-medium">Who approves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.situation} className="align-top">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.situation}</td>
                  <td className="px-3 py-2 text-stone-700">{r.does}</td>
                  <td className="px-3 py-2 text-stone-700">{r.never}</td>
                  <td className="px-3 py-2 text-stone-700">{r.handoff}</td>
                  <td className="px-3 py-2 text-stone-700">{r.approval}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-600">
          Rules for every type: live PMS prices only · never confirm what the hotel has not · never discount · exceptions decided by a manager · card details only via the payment gateway · sensitive data only in a restricted trace · every item has an owner from arrival. A type earns the right to send alone when, over four weeks and 300+ items, 95% of drafts went out unedited, the type was changed under 3% of the time, and there were no guardrail breaches.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Two engines, one contract</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <Badge tone="green">Live model (Gemini)</Badge>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Google Gemini with read-only PMS tools: look up a booking, live rates, policy documents, modification and cancellation checks. On when <span className="font-mono">GEMINI_API_KEY</span> is set. Its PMS lookups are shown on the desk so the owner can see what it checked. Code-level guardrails run after the model answers: card redaction, modification re-check against the PMS, restricted flag on sensitive traces, topic check on the draft, human approval forced.
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <Badge tone="amber">Rules engine</Badge>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Deterministic, keyword and pattern based. Runs with no API key, so the prototype is always usable, and takes over if the model fails (labelled on the item). It is also the regression baseline: every seed message has a known-good output.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Where the answers come from</h2>
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-700 leading-relaxed">
          <p>
            One handbook per hotel plus a group handbook, written in plain markdown in <span className="font-mono text-xs">docs/policies</span>, the way a hotel would actually maintain them: check-in times, facilities, parking, pets, transfers, dining, children, accessibility, and the group rules on cancellation, modifications, parity, payment, sensitive data, groups, early and late check-out, occasions, cots, travel advisors.
          </p>
          <p className="mt-2">
            A build step cuts each handbook into sections and embeds them with Gemini&apos;s embedding model. When a guest asks a question, the AI agent searches by meaning, so &quot;can my dog come&quot; finds the pets section and &quot;can we bring our six-year-old&quot; finds the children rule, then answers from that section and cites it. Keyword search is the tiebreaker and the fallback when there is no key. A hotel edits its handbook, the build runs, the answers change. Nothing is hard-coded in the AI agent.
          </p>
        </div>
      </section>

      <section className="space-y-2 text-sm text-stone-600">
        <h2 className="font-medium text-stone-900">What is simulated</h2>
        <ul className="list-disc pl-5 space-y-1 text-xs leading-relaxed">
          <li>Email arrives live from a Gmail mailbox when one is connected; otherwise, and for WhatsApp, from seeded messages and the &quot;New message&quot; form. Desk state lives in your browser.</li>
          <li>The PMS is a mock with nine hotels, rate plans, bookings and daily prices. Writes happen only at published rates. The handbooks are real files; the hotels in them are fictional.</li>
          <li>The PMS traces page stands in for the hotel&apos;s own PMS list; hotel staff are not users of this product.</li>
          <li>The payment link is a placeholder. Phone is out of scope.</li>
        </ul>
      </section>
    </div>
  );
}
