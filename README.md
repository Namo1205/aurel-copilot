# Aurel Reservations AI Agent

Prototype for the Aurel Hotels AI PM take-home. An AI agent reads every email and WhatsApp message to the central reservations desk, marks its type, assigns a named owner, drafts the reply with live PMS prices and the hotel's own policy, turns requests into PMS traces, and sends alone only what cannot go wrong (cited policy answers and three fixed templates). People approve the rest in one click. A dashboard shows every owner's pending work.

Deliverables are in [`docs/`](docs/):

| # | Deliverable | File |
|---|---|---|
| 1 | Strategy memo (3 pages) | [docs/01-strategy-memo.pdf](docs/01-strategy-memo.pdf) |
| 2 | v1 PRD (4 pages) | [docs/02-prd.pdf](docs/02-prd.pdf) |
| 3 | Working prototype | this repo (deploy link in the submission) |
| 4 | Build log (1 page) | [docs/04-build-log.md](docs/04-build-log.md) |
| – | Demo script (12 minutes, live email) | [docs/05-demo-script.md](docs/05-demo-script.md) |
| – | Emails to send while recording, with expected results | [docs/06-recording-emails.md](docs/06-recording-emails.md) |

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Without an API key the app runs in **demo mode** on a deterministic rules engine that encodes the same behaviour spec. To use the live model:

```bash
cp .env.example .env.local
# set GEMINI_API_KEY=...        (Google AI Studio key)
# optional GEMINI_MODEL=gemini-3.6-flash (default; Pro models need billing enabled)
npm run dev
```

Models are tried in a chain: `GEMINI_MODEL` first, then `gemini-3-flash-preview`, then `gemini-3.5-flash-lite` (override with `GEMINI_MODELS=a,b,c`). A model whose daily quota is used up, or that is retired or overloaded, hands over to the next; only when every model fails does the desk drop to the rules engine, labelled on the item. On the free tier that triples the number of live emails per day.

Set `COPILOT_MODE=rules` to force the rules engine even when a key is present.

## Sign in

Four roles, one prototype password: `aurel`. Or deep-link straight in:

| Role | Deep link | What they see first |
|---|---|---|
| Reservations agent | `/login?as=agt-1` | Important view, own queue |
| Senior agent | `/login?as=snr-1` | Same, plus reassignment and the team table on the dashboard |
| Reservations manager | `/login?as=mgr-1` | Dashboard, then the Manager queue |
| Groups & events specialist | `/login?as=grp-1` | Sales queue |

Hotel department staff are not users: traces are written to the (simulated) PMS. The **PMS traces** page stands in for the hotel's PMS list.

## What to click

The desk is a conversation view: the list on the left, the thread in the middle with the AI agent's draft sitting in the composer, booking and actions in the panel on the right. Each role sees only what they are responsible for:

| Role | Sees | Lands on |
|---|---|---|
| Agent | Their own conversations, open and done | Open |
| Senior | Their own plus every agent's, with a team rail to focus on one agent and reassign | Open |
| Manager | Everything, plus the Manager view (exceptions) and the Sent-alone log | Dashboard, then Manager |
| Groups specialist | Sales conversations only | Open |

With a mailbox connected the desk starts empty and shows only real guest mail. Without one it loads the thirteen sample messages from the brief; they are also one click away on the sign-in page, or at `/?samples=load`.

**Live:** keep a desk tab open, email the desk address from any account. Within 20 seconds the conversation appears, sorted, with an owner. A policy question is answered alone and shows as the AI agent's bubble; the reply lands in your inbox in the same thread. Anything else waits in the composer for the owner: read the draft, check the actions in the right panel, press **Approve & send**. A guest's later reply joins the same thread.

**Samples:** sign in as an agent on shift (`/login?as=agt-5`), load the samples. **Priya Sharma** is a within-rules date change plus two traces; approve it and the traces land in **PMS traces**. Sign in as a senior (`/login?as=snr-2`) for the team rail, Important and Sent alone; as the manager (`/login?as=mgr-2`) for Tomás Herrera's compassionate cancellation (holding reply already sent by the AI agent, follow-up waiting for the manager) and **Run day-before check** on the dashboard.

**When something fails:** if Gmail cannot deliver a reply, the bubble turns red with "The guest has not received this", the text in an editable box and **Send again**; only the email is resent. If sorting fails, the thread offers **Try again** and **Write the reply yourself**.

**Shift end:** the header shows your shift. **End my shift** moves your open conversations to colleagues on shift by the owner rule and the dashboard lists the handovers; shifts also end on the clock. If nobody of your role is on shift the item stays with you, flagged.

Deep links: `/?tab=auto&item=m-013` opens a view and the conversation holding that message; `/login?as=agt-5&next=%2F%3Fsamples%3Dload` signs in and loads samples. "Clear the desk" on the sign-in page removes everything.

## Policy handbooks and search

The AI agent answers policy questions from the hotel handbooks in [`docs/policies/`](docs/policies/): one markdown file per hotel plus `aurel-group.md` for the rules that apply everywhere. Each `## Section` carries an id and tags on the line below it:

```markdown
## Pets
<!-- id: P-LIS-PETS · tags: pets, pet, dog, dogs, cat, animal -->
Dogs up to 12 kg are welcome in Deluxe and River View rooms at EUR 40 per night…
```

`npm run kb:build` cuts the handbooks into sections, embeds them with Gemini's embedding model and writes `src/lib/policies/kb.json` (text, shipped to the browser) and `kb-vectors.json` (vectors, server only). Both are committed, so the app needs no key to read them. Search is by meaning with keyword scoring as the tiebreaker; without a key it is keyword only. Edit a handbook, run the build, the answers change.

```bash
npm run kb:build                                      # rebuild after editing a handbook
npx tsx --env-file=.env.local scripts/search-check.ts # keyword vs meaning on 12 paraphrased questions
```

## Live Gmail (optional, for the demo)

A real mailbox for the desk. A guest emails it from a phone, the message appears on the desk within 20 seconds, the owner approves, and the reply lands in the guest's inbox in the same thread. Cited policy answers and the three fixed templates go out alone.

Use a fresh Gmail account for the desk, never a personal one: the desk takes every unread message in that inbox.

1. Create the desk Gmail account (for example `aurel.desk.demo@gmail.com`) and sign in to it.
2. In [Google Cloud Console](https://console.cloud.google.com) create a project, open **APIs & Services → Library**, enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): external, any app name, your support email. Under **Audience** keep it in *Testing* and add the desk Gmail address as a **test user**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Desktop app**. Copy the client ID and client secret into `.env.local`:
   ```
   GMAIL_CLIENT_ID=...apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=...
   ```
5. Sign in once; the refresh token is written to `.env.local`:
   ```bash
   npx tsx --env-file=.env.local scripts/gmail-auth.ts
   ```
   Open the printed URL, choose the desk account, accept the "unverified app" warning (it is your own test app), click Allow.
6. Restart the server. The header shows **Live mail: address**. Send the desk an email and watch it arrive.

Set `GMAIL_SEND=off` to read live mail but send nothing. Mail the desk has taken is labelled `Aurel/Desk` and marked read in the mailbox. The desk only ever replies to the original sender, in the same thread, with the text the owner approved.

## Layout

```
src/lib/pms        mock PMS: 9 hotels, rate plans, per-hotel policy paragraphs, bookings, traces
src/lib/agent      proposal schema (zod), rules engine, Gemini engine, templates + topic check, execution
src/lib/desk       roster of 22, owner-on-arrival rule, Important rule, queues
src/lib/inbox      seed messages from the brief plus guardrail tests
src/lib/gmail      live Gmail link: pull new mail, label it, send replies in-thread
src/lib/store.tsx  client state: items, owners, queues, sessions (localStorage)
src/app            login, desk (/), dashboard, PMS traces (/ops), how it works (/about), API routes incl. /api/gmail/*
scripts            run-rules.ts, run-gemini.ts (Gemini vs rules diff), run-day-before.ts, gmail-auth.ts (one-time Gmail sign-in)
```

```bash
npx tsx scripts/run-rules.ts          # all seeds
npx tsx scripts/run-rules.ts m-012    # one message
npx tsx --env-file=.env.local scripts/run-gemini.ts   # every seed through Gemini, diffed against the rules engine
npx tsx scripts/run-day-before.ts     # what the day-before check sends and traces
```

## Deploy (Vercel)

```bash
npx vercel
npx vercel env add GEMINI_API_KEY production
npx vercel --prod
```

No database. Desk state is kept in the browser; API routes are stateless.
