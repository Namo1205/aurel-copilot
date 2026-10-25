# Aurel Reservations AI Agent

Prototype for the Aurel Hotels AI PM take-home. An AI agent reads every email and WhatsApp message to the central reservations desk, marks its type, assigns a named owner, drafts the reply with live PMS prices and the hotel's own policy, turns requests into PMS traces, and sends alone only what cannot go wrong: cited policy answers, a fixed question back when a policy question names no hotel, and the fixed templates. A message is sorted together with the guest's earlier messages in the same conversation, so a one-word reply such as "Lisboa" completes the earlier question. People approve the rest in one click. A dashboard shows every owner's pending work.

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

Four roles, one shared password: `aurel` locally, or whatever `DESK_PASSWORD` is set to. Signing in sets a server cookie that every API route checks, so nobody can sort, send or poll mail from outside the desk. The password is asked once per browser; after that the deep links below sign you straight in:

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

With a mailbox connected the desk starts empty and shows only real guest mail. Without one it loads the thirteen sample messages from the brief; they are also one click away on the sign-in page, or at `/?samples=load`. "Remove the sample messages" on the sign-in page takes only the samples off; real mail is never cleared from a production build.

Desk state lives in the browser, and the mailbox is the source of truth. When a signed-in desk opens with a mailbox connected it **loads the whole mailbox automatically**, page by page: every guest message ever received, answered ones closed with the reply the desk sent, unanswered ones open, sorted and owned like new mail. Anything older than a day is marked as arrived before the desk was connected: it gets an owner and a suggested reply, but nothing is sent alone, a person decides. The header shows the progress; the load repeats after 12 hours. Every 20 seconds each open desk also picks up what the scheduled check or another browser took, so auto-replies appear everywhere within a poll.

Two limits worth knowing. Unanswered old mail is sorted by the language model on first load, so a large backlog costs requests on the free tier. And owners are still assigned in each browser, so two browsers can give the same old item to different people; a shared store is the fix and is not in this prototype.

**Notifications:** the bell in the header carries only what the list cannot show: a reply the guest did not receive, conversations moved to you by a senior or at a shift end, a guest replying to a conversation you closed, items in your queue over an hour old, and your shift ending with work open. Seniors and managers also see agents with several overdue items, manager-queue arrivals and handovers that found nobody. New arrivals are not notifications; the list marks them with a "new since you last looked" line. Read state is per person.

**Attachments:** files a guest sends show under their message as chips and open through the desk, fetched from the mailbox on demand; Aurel Assistant is told only that attachments exist, never what is in them. A reply can carry up to 3 files, 3 MB in total (the hosting request limit after encoding); they are sent inside the email and the thread records only the names. The assistant never sends an attachment alone.

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

### Replies with no desk tab open

Desk tabs poll the mailbox every 20 seconds, so with every tab closed nothing is read. The scheduled check fills that gap for the types that may send alone. A GitHub Actions workflow ([.github/workflows/poll-mailbox.yml](.github/workflows/poll-mailbox.yml)) calls `GET /api/cron/poll` every five minutes with a bearer token. That route reads new mail and:

- sends the cited policy answer, the question asking which hotel, the group acknowledgement, the holding reply or the off-topic decline, then labels the message `Aurel/Auto-replied` and leaves it unread, so the next desk tab still receives it and shows the reply in the thread;
- labels everything that needs a person `Aurel/Waiting` and leaves it alone for the desk.

Nothing is stored on the server; the Gmail labels are the whole state. Two costs to know about: a message the check has seen is sorted again when a desk tab takes it, so on the free Gemini tier every live email costs roughly double while the schedule is on; and GitHub runs schedules at best every five minutes, often a few minutes late. To switch it on:

1. Set `CRON_SECRET` in `.env.local` and on Vercel (`openssl rand -base64 32`).
2. In the GitHub repository, Settings → Secrets and variables → Actions, add `DESK_URL` (the deployment, no trailing slash) and `CRON_SECRET` (same value).
3. Push to the default branch. Run it once by hand from the Actions tab to check the response: `{"checked":n,"replied":[…],"waiting":[…]}`.

Without `CRON_SECRET` the route answers 503 and the workflow fails loudly instead of silently doing nothing.

## Layout

```
src/lib/pms        mock PMS: 9 hotels, rate plans, per-hotel policy paragraphs, bookings, traces
src/lib/agent      proposal schema (zod), rules engine, Gemini engine, templates + topic check, execution
src/lib/desk       roster of 22, owner-on-arrival rule, Important rule, queues
src/lib/inbox      seed messages from the brief plus guardrail tests
src/lib/gmail      live Gmail link: pull new mail, label it, send replies in-thread; labels Aurel/Desk, Aurel/Auto-replied, Aurel/Waiting
src/lib/store.tsx  client state: items, owners, queues, sessions (localStorage)
src/app            login, desk (/), dashboard, PMS traces (/ops), how it works (/about), API routes incl. /api/gmail/* and /api/cron/poll
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
npx vercel env add DESK_PASSWORD production   # what the team types to sign in
npx vercel env add DESK_SECRET production     # signs the session cookie: openssl rand -base64 32
npx vercel env add GEMINI_API_KEY production
npx vercel --prod
```

Without `DESK_PASSWORD` the password is `aurel` and the cookie is signed with a development secret, fine on a laptop, not on a public URL.

No database. Desk state is kept in the browser; API routes are stateless.
