# Strategy memo: what Aurel should build with AI

**To:** COO · **From:** AI Product Manager · **Date:** 21 October 2026 · **Decision requested:** approve the two-quarter plan in section 5

## 1. What the data actually says

The brief frames the problem as "we need a booking agent". The data describes two different problems, and neither is a shortage of bots.

**Problem one: we answer too slowly, and slowness costs bookings.** Median first response to email is 9 hours on weekdays and 26 at weekends. An enquiry answered inside an hour converts at 34%; after 24 hours, 9%. Enquiries and quotes are 31% of 5,400 weekly contacts, about 1,670 a week. Every point of conversion on that flow is roughly 17 bookings a week. At an assumed average of three nights at EUR 450, one point is about EUR 1.2M a year in room revenue. Moving even a third of those enquiries from the slow band into the fast band is worth more than the entire CRO payroll.

**Problem two: we do not keep the promises we make.** Special requests are 18% of contacts, about 970 a week. They go into a free-text notes field that front office reads on the day. 23% are not delivered, which is roughly 220 broken promises a week and 11,000 a year. One in forty involves an allergy, medical or accessibility need, so about 24 a week carry safety and GDPR exposure. "Communication before arrival" is already our second most common complaint theme. This is not an AI problem. It is a handoff problem: the PMS has a traces feature with owners and due dates, and most hotels do not use it.

**Why the team is slow.** Weighted average handle time is 8.3 minutes, so 5,400 contacts need about 750 agent hours a week against roughly 825 hours available from 22 people. The team runs at about 90% utilisation before breaks, training and the 41% annual attrition that keeps a quarter of the desk on a six-week ramp. A quarter of all agent time goes on looking up rates and the 140-plus policies per hotel. That lookup time alone is about five full-time equivalents, and it is exactly the work a machine does better.

**The constraints that shape the answer.** The PMS can read everything and write bookings only at published rates. It cannot discount, so a bot cannot negotiate. Rate parity means there is nothing to negotiate anyway. Policy exceptions need a manager. Card details cannot travel in messages. The last auto-reply bot was switched off for promising an early check-in the hotel could not deliver, and the team reads your headcount target as a threat. Any system that makes guest-facing promises without a human in the loop will fail for the same reason the last one did.

## 2. Who we are solving for, and why

The primary user is the **reservations agent**. Not the guest directly, and not the COO's dashboard. If agents answer in an hour instead of nine, conversion moves. If agents' requests become structured tasks hotels actually see, the 23% failure rate moves. If agents stop spending a quarter of their day in policy documents, capacity moves. Guests get a faster, more honest reply. Hotels get a task list instead of a notes field. The COO gets the economics. But the person whose day changes is the agent, and if they do not trust the tool, none of the rest happens.

Secondary users are the **hotel department staff** who receive traces, and **reservations managers** who receive the exceptions.

## 3. Vision, two to three years out

**Every promise made before arrival is kept, and every enquiry is answered within the hour, at any time, in any language.**

- **Year one:** a copilot that drafts every email and WhatsApp reply with live rates and the right hotel's policy, turns every request into an owned, dated PMS trace, and hands exceptions to the right human. Agents approve everything. Response time collapses; the lookup quarter of the day disappears; traces become the operating norm across all nine hotels.
- **Year two:** the copilot earns autonomy category by category, measured against a human-approved baseline. Pre-arrival questions and within-policy modifications send without review. A guest-facing direct booking flow on web and WhatsApp handles simple stays at published rates with payment through the gateway. Hotels close traces in the same system, so the CRO can see whether a promise was kept before the guest does.
- **Year three:** pre-arrival orchestration. The system reaches out proactively (transfer confirmation, allergy briefing, early-arrival decision the evening before) and voice assist supports phone agents in real time. The CRO becomes a smaller guest-success team that handles judgement, relationships and exceptions. Headcount reaches roughly 14 through attrition, not layoffs.

## 4. The one bet for these two quarters

**Build the reservations copilot for email and WhatsApp, with traces as the output.** Those two channels are 69% of volume and the ones the PMS and team can support today. One product, three jobs:

1. **Read and triage** every inbound message, match the booking, flag sensitive data, redact card details.
2. **Draft the reply** using live PMS rates and the hotel's own policies, never promising what the hotel has not confirmed.
3. **Create the traces**: each special request becomes a task for a named department with a due date before arrival, with the restricted flag for allergy, medical and accessibility details.

Humans approve every send and every write in v1. That is not caution for its own sake; it is how we get the acceptance data that decides what goes autonomous in year two, and how we win back a team that watched the last bot get switched off.

**What we will not build in these two quarters**

- An autonomous booking agent on every channel. We will not have payment-in-message, voice, or a team that trusts it in 3 months, and the PMS gives it nothing to negotiate with.
- Phone (24% of volume). Voice is a different product with different risks. Phone agents get the same copilot for typed call notes and nothing more.
- OTA messaging integration (7%). Phase two, once the email flow is proven; the behaviour is identical.
- Group and event sales, dynamic pricing, a CRM, or a guest-facing chatbot.

**Where AI is the wrong answer**

- **Compassionate cancellations and refund exceptions.** Someone whose mother is in hospital should be answered by a person with authority to decide. The copilot drafts the empathetic holding reply and routes it; it never decides.
- **Price negotiation.** There is no latitude. Parity and the PMS make it impossible, and a model that pretends otherwise would make promises we cannot keep. The right answer is a clear explanation of direct-booking benefits.
- **The 23% broken-promise rate.** This is an accountability and workflow failure. AI structures the request; the fix is hotels owning traces with due dates and a weekly number someone is answerable for. We will put that operating rhythm in place alongside the software.
- **Headcount as the goal.** A tool built to remove 40% of the team will be resisted by 100% of it. A tool built to make agents fast and right will remove the work, and attrition will do the rest.

## 5. Reply to the COO

You asked for an AI booking agent on every channel within three months, and reservations headcount down 40% by year end. Here is what I will stake my name on instead, and why it gets you more.

**On the booking agent.** I can put a system in front of every email and WhatsApp message in 12 weeks that answers with live rates in minutes instead of hours, and a direct booking flow in the second quarter. I will not promise an autonomous agent on every channel by month three. Phone needs voice, OTA messaging needs an integration we have not scoped, the PMS cannot take payment in a message, and the last bot was switched off for exactly the kind of promise an unsupervised agent makes. If a competitor's bot confirms an early check-in it cannot deliver, that is their review problem. I would rather our agent be the one that is right.

**On revenue.** The number that matters is not headcount, it is the 34% versus 9% conversion gap. Closing it on email alone is worth several million a year at our rates, and every direct booking it wins saves 18% commission. That is the business case for this programme, and it pays for the team several times over.

**On headcount.** Attrition is 41%. Nine people will leave this year without anyone being asked to. If the copilot removes the lookup quarter of the day and halves drafting time, we do not backfill, and the desk is around 15 by year end, roughly a 30% reduction, with better response times than today. I will not plan on 40% through layoffs, because the people we would lose are the ones we need to train the system and approve its output while it earns trust. If, after two quarters, acceptance rates show the copilot can send without review for the safe categories, the second-year plan takes the team to about 14 with no loss of service.

**What I need from you.** Agreement that the public commitment is "we answer in an hour and keep every promise", not "we have a bot". A sponsor at each hotel for traces, with a weekly promise-kept number in the ops review. And permission to tell the CRO team that this year's target is response time, not headcount, and that nobody is being replaced by the tool they are training.

## 6. Assumptions written down

- Average booking value of EUR 1,350 (three nights at EUR 450) for the conversion arithmetic. Direct mix and length of stay vary by hotel; the direction holds at half that value.
- 22 agents at 37.5 hours; business hours covering 07:00 to 23:00 across four countries.
- Handle times in the brief include lookup time. The 25% lookup figure is an average; it is higher on enquiries and modifications.
- Hotels can be held to acknowledging traces within 24 hours if the number is reviewed weekly. Where it is not, the software will not help.
- Engineering: two full-stack engineers can ship a Next.js application with PMS read access, published-rate writes and traces in one quarter; the second quarter is WhatsApp, OTA messaging and the auto-send pilot. Connectors to the real email and WhatsApp providers are the main integration risk and are scoped first.
