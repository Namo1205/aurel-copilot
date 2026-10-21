# v1 PRD: Aurel Copilot

**Status:** proposed · **Owner:** AI PM · **Engineering:** 2 full-stack, designer at 50% · **Horizon:** Q1 build and pilot, Q2 scale

## 1. Problem and goal

Reservations agents answer email in a median of 9 hours because they are at 90% utilisation and spend a quarter of their time looking up rates and policies. Special requests are typed into a notes field and 23% are not delivered. v1 puts a copilot in front of every email and WhatsApp message that drafts the reply with live data and turns every request into an owned PMS trace. Agents approve everything.

**Goal for v1:** first response under one hour in business hours on email and WhatsApp, with zero unauthorised promises, and every special request structured as a trace.

## 2. Users

| User | What they need from v1 | What they must never get |
|---|---|---|
| Reservations agent (22) | A draft they can send with a glance; the booking, rate and policy already found; one click to log requests to the hotel | A system that sends on their behalf, or that hides what it looked up |
| Reservations manager (2) | Exceptions arriving with full context and a suggested holding reply already sent | Exceptions decided by the tool |
| Hotel department staff | A task with an owner, a due date and the minimum information to deliver | Allergy or medical detail in a notes field or an email thread |
| Guest (indirect) | A fast, accurate, honest reply on the channel they used | A confirmation the hotel has not made |

## 3. Scope

**In v1 (Q1):** email, WhatsApp. All seven contact categories are triaged; five produce drafts and actions (enquiry, modification, special request, pre-arrival question, cancellation). Group and "other" produce an acknowledgement and a handoff. Nine hotels. English drafts; detect other languages and route to a speaker.

**Q2:** OTA messaging (Booking.com and Expedia inboxes), traces live at all nine hotels with an acknowledgement SLA, auto-send pilot for pre-arrival questions, multilingual drafts.

**Out:** phone and voice, payments beyond issuing a gateway link, guest-facing chat, group sales, pricing, CRM.

**Channel choice.** Email first because it is 58% of volume, the slowest channel, and the one where a draft-and-approve loop fits naturally. WhatsApp second because it is growing, guests expect minutes, and replies are short enough to approve quickly. OTA messaging waits for the integration. Phone is excluded: a 24% channel with a different risk profile and no transcript today.

## 4. Flows

**Flow A: inbound message to sent reply.**
1. Message arrives. Card numbers are redacted before anything is stored or displayed.
2. Copilot triages (category, hotel, urgency, language), matches the booking by reference or surname plus hotel or month, and flags sensitive data.
3. Copilot looks up what it needs: live availability and rates, hotel policies, modification and cancellation checks. The lookups are visible to the agent.
4. Copilot proposes actions (quote, modify booking, create trace, handoff, send payment link) and a draft reply.
5. Agent reviews. Each action is a checkbox; the draft is editable. Agent clicks Approve & send, or Hand off only.
6. Approved writes go to the PMS. Traces appear on the hotel board. Handoffs go to a manager or sales queue with context.

**Flow B: hotel receives a trace.** Department sees traces for its hotel ordered by due date, acknowledges, delivers, marks done. Restricted traces show only to the owning department. Unacknowledged traces within 24 hours of due escalate to the hotel's front office manager.

**Flow C: exception.** Manager receives the handoff with booking, rate terms, the guest's words and the holding reply already sent. Manager decides and replies from the same thread.

## 5. Agent behaviour spec

### What it handles

| Situation | It does | Confirms to the guest |
|---|---|---|
| New enquiry with dates | Quotes live published rates (Flexible and Advance Purchase) for the room and party, with totals and terms. Offers to hold and send a payment link. | Rates and availability as of now |
| Enquiry without dates or hotel | Asks for the missing facts in one message | Nothing |
| Price-match or discount ask | Quotes the published rate, explains direct-booking benefits, states plainly it cannot go below published | Nothing about price |
| Modification, Flexible or Stay Longer | Checks policy and live rate, proposes the change with the rate difference | The change only after approval and execution |
| Modification, Advance Purchase | Handoff to reservations manager, holding reply | Nothing |
| Special request (cot, occasion, transfer, early check-in, spa, dining) | One trace per request, correct department, due date before arrival | That the request is logged and the team will confirm |
| Allergy, medical, accessibility | Restricted trace with minimum detail to the owning department; sets sensitive flag; tells the guest who will see it; asks only what the hotel needs to deliver safely | That the information is held and who sees it |
| Pre-arrival question | Answers from that hotel's policy entries and cites them | The policy as written |
| Cancellation within policy | States the position, asks the guest to confirm, routes execution to an agent | No charge, if the policy says so |
| Cancellation or refund outside policy | Empathetic holding reply, handoff to manager same day | Nothing |
| Group or event (8+ rooms, meeting, wedding) | Acknowledgement with one-working-day SLA, handoff to Group Sales | Nothing |
| Card details in message | Redacts, proposes payment link, tells the guest the details were removed | Nothing |
| Travel advisor or programme booking | Confirms the standard amenity set, trace to front office, handoff to agent for the formal confirmation | Amenities; upgrade only as subject to availability |

### What it never does

- Confirms early check-in, an upgrade, a transfer or any special request as guaranteed.
- Quotes a number that did not come from the PMS in this session. Discounts or matches a price.
- Confirms a refund, credit or waiver outside policy. Asks for medical proof.
- Modifies an Advance Purchase booking. Cancels a booking autonomously.
- Stores, repeats or forwards card details.
- Writes allergy, medical or accessibility detail into free text or an email.
- Prices or holds inventory for groups.
- Guesses a booking. Answers a hotel question with no policy from general knowledge.
- Sends anything without an agent's approval (v1).

### When and how it hands off

| Trigger | To | Urgency | What travels with it |
|---|---|---|---|
| Refund, waiver, credit outside policy; non-public rate; Advance Purchase change | Reservations manager | Same day | Booking, rate terms, guest's words, holding reply sent |
| 8+ rooms, event space, wedding | Group Sales | One working day | Brief, dates, size, hotel |
| Advisor and VIP confirmations; within-policy cancellation execution; confidence below 0.6; non-English | Reservations agent | Same day | Proposal with reasons |
| Question no policy answers | Hotel team | Before arrival | Question and booking |

The handoff is explicit in the proposal, the agent sees it before sending, and the holding reply tells the guest who will contact them and when. A handoff never leaves the guest without a reply.

### How it confirms

- Quotes are stated as current rates; the reply offers a hold and a secure payment link.
- Booking changes are confirmed only after the PMS write succeeds, in an updated confirmation.
- Special requests are confirmed as "logged with [department]; they will confirm by [date]". Delivery is confirmed by the hotel, in writing, from the trace.
- Every draft lists what it deliberately did not promise, so the agent can see the boundary.

### How it fails

| Failure | Behaviour |
|---|---|
| Booking not found | Draft asks for the reference; no PMS actions proposed; confidence lowered |
| PMS unavailable | Draft acknowledges and gives a time to come back; no numbers quoted; item flagged |
| Model output invalid or model unavailable | One repair attempt, then fall back to the rules engine, visibly labelled |
| Model proposes an out-of-policy write | Blocked in code: modification re-checked against the PMS, sensitive traces forced restricted, card data re-redacted, human approval forced |
| Guest insists on something it cannot do | Second message on the same thread routes to an agent |

## 6. Success metrics

Targets are for end of Q2 unless stated. Baselines from the data pack.

| Metric | Baseline | Target | How measured |
|---|---|---|---|
| Median first response, email, business hours | 9 h | Under 1 h by week 12; under 30 min by Q2 | Message timestamps |
| Median first response, weekend | 26 h | Under 4 h | Same |
| Enquiry conversion, email | Blend of 34% / 9% bands | +8 points | Booking created within 7 days of enquiry |
| Special requests not delivered at check-in | 23% | Under 8% | Front office check-in audit, weekly sample of 100 |
| Requests captured as traces | ~0 | 100% of copilot-handled requests | PMS |
| Traces acknowledged within 24 h | n/a | 90% | PMS |
| Draft acceptance (sent with no or minor edit) | n/a | 70% by week 8 | Edit distance on send |
| Agent handle time, enquiry | 11 min | 6 min | Desk timing |
| Agent time on lookups | 25% | Under 10% | Time study, month 3 |

### Guardrails (any breach pauses rollout for that category)

| Guardrail | Limit |
|---|---|
| Unauthorised promises (early check-in, upgrade, transfer, refund) in sent messages | 0 in weekly QA sample of 50 |
| Card data stored or forwarded | 0 |
| Sensitive data in free text or email | 0 |
| Discount or price match offered | 0 |
| Quoted rate differing from PMS | 0 |
| Agent satisfaction with the tool, monthly pulse | 4 of 5 or above |
| "Communication before arrival" as a review theme | Out of top three by Q2 |
| Autonomous sends | 0 in Q1; Q2 pilot only for pre-arrival questions with acceptance above 90% for four weeks |

## 7. Rollout

- **Weeks 1 to 4.** Shadow mode. Copilot drafts for all email; nobody sends from it. Measure acceptance, fix the policy corpus, load traces for two pilot hotels.
- **Weeks 5 to 8.** Four volunteer agents, Lisbon and Mallorca. Send from the copilot. Weekly QA of 50 messages with the team, in the open.
- **Weeks 9 to 12.** All agents, all hotels, email. Traces at all nine hotels with the acknowledgement number in the weekly ops review.
- **Q2.** WhatsApp, OTA messaging, multilingual, auto-send pilot. Decision on year-two autonomy from the acceptance data.

## 8. Open questions and assumptions

- Email and WhatsApp provider APIs are assumed to support threaded read and send; the integration is scoped in week one.
- The PMS traces API is assumed to accept a department, due date and a restricted flag; if restricted is not native, we store sensitive detail in the copilot and send the PMS a pointer.
- Policy corpus: 140-plus policies per hotel exist as documents; v1 needs them structured. Two weeks of PM and designer time are budgeted for this with each hotel.
- GDPR: a data protection impact assessment is needed before sensitive traces go live; legal review in week two.
