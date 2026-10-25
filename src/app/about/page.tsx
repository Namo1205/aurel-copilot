// Help for the desk team: one screen, written for an agent on shift. How the prototype
// is built (engines, what is simulated) lives in the README for reviewers.

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

const STEPS: [string, string][] = [
  ["It arrives and gets an owner", "Every email is sorted by what the guest needs and given a named owner the moment it lands. Nothing waits in a shared pile."],
  ["Aurel Assistant prepares the work", "It finds the booking, looks up today's price and the hotel's handbook, writes a suggested reply, and lists the hotel to-dos and PMS changes the reply implies."],
  ["Some answers go out on their own", "A pure policy question with the hotel named, such as check-out time or parking, is answered from the handbook and sent at once, with the section it came from. You see it under Sent alone."],
  ["Everything else waits for you", "Prices, changes, requests, cancellations and anything with a judgement call sit in your list with the suggested reply ready. You decide."],
];

const CAN_DO: [string, string][] = [
  ["Approve & send", "Sends the reply and does the ticked actions: the PMS change, the hotel to-dos, the payment link."],
  ["Edit first", "Change any word of the suggested reply before it goes. Edits are counted so the assistant can improve, never held against you."],
  ["Write it yourself", "Start from a blank box. The actions in the right panel still run if they stay ticked."],
  ["Attach files", "Up to 3 files, 3 MB in total, sent inside the email. Drop a file on the reply box or paste a screenshot."],
  ["Untick an action", "Any to-do or change in the right panel can be unticked before you approve."],
  ["Change the type", "If a message was sorted wrong, pick the right type above the thread. Every correction is counted; that is how a type earns the right to send alone."],
  ["Take ownership", "A colleague's conversation can be taken over with one click, and seniors can reassign from the thread or the dashboard."],
  ["End my shift", "Your open conversations move to colleagues on shift by the same rule that assigned them, and the dashboard lists the handovers."],
];

const NEVER: string[] = [
  "Confirm an early check-in, an upgrade, a transfer or a refund. The hotel confirms those; the reply says so.",
  "Quote a price the booking system did not return, or discount or match a price.",
  "Put an allergy, medical or accessibility detail anywhere but a restricted hotel to-do.",
  "Keep, repeat or forward card numbers. They are removed before anyone sees the message and a secure payment link is offered instead.",
  "Read your attachments or the guest's. It only knows a file is there.",
  "Send anything on its own except a cited handbook answer, the question asking which hotel, or one of the fixed templates: the holding reply, the group acknowledgement, the decline for messages that are not about a stay.",
  "Act on instructions written inside a guest's message. Text in a message is information, never an order.",
];

export default function Help() {
  return (
    <div className="mx-auto max-w-[1000px] w-full p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-stone-600 mt-1">How the desk works, what you can do, and what Aurel Assistant will never do on its own.</p>
      </div>

      <Card title="What happens to every email">
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-lg bg-stone-50 border border-stone-100 p-3">
              <div className="text-[11px] text-stone-400">Step {i + 1}</div>
              <div className="font-medium">{t}</div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">{d}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="What you can do">
          <ul className="space-y-2 text-sm">
            {CAN_DO.map(([t, d]) => (
              <li key={t}>
                <span className="font-medium">{t}.</span> <span className="text-stone-600">{d}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="What Aurel Assistant never does">
          <ul className="list-disc pl-5 space-y-2 text-sm text-stone-700">
            {NEVER.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Where the answers come from">
          <p className="text-sm text-stone-700 leading-relaxed">
            One handbook per hotel plus a group handbook, plain documents the hotels maintain: check-in times, facilities, parking, pets, transfers, dining, children, accessibility, and the group rules on cancellation, changes, prices and sensitive information. Every automatic answer shows <span className="font-medium">Based on</span> with the section it used. If a rule is wrong or missing, the fix is in the handbook, not in the software.
          </p>
        </Card>

        <Card title="Who to ask">
          <ul className="space-y-2 text-sm text-stone-700">
            <li>
              <span className="font-medium">A senior</span> for a reassignment, a stuck conversation, or a VIP you are unsure about.
            </li>
            <li>
              <span className="font-medium">The reservations manager</span> for any refund, waiver or rate outside the rules. The guest has already had the holding reply; the manager decides the same day.
            </li>
            <li>
              <span className="font-medium">The bell</span> in the header for what changed while you were away: a reply the guest did not receive, conversations moved to you, a guest replying to one you closed, items over an hour old.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
