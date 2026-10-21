# Aurel Copilot

Agent-assist copilot for the Aurel Hotels central reservations office (CRO). It reads inbound guest messages, matches the booking, checks live rates and hotel policies, and proposes a triage, a set of PMS actions and a draft reply. A reservations agent approves before anything is sent or written.

Take-home deliverables live in [`docs/`](docs/):

| # | Deliverable | File |
|---|---|---|
| 1 | Strategy memo | [docs/01-strategy-memo.md](docs/01-strategy-memo.md) |
| 2 | v1 PRD | [docs/02-prd.md](docs/02-prd.md) |
| 3 | Working prototype | this repo (deploy link in the submission) |
| 4 | Build log | [docs/04-build-log.md](docs/04-build-log.md) |

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Without an API key the app runs in **demo mode** on a deterministic rules engine. To use the live model:

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Set `COPILOT_MODE=rules` to force the rules engine even when a key is present.

## Deploy (Vercel)

```bash
npx vercel            # first deploy, accept defaults
npx vercel env add ANTHROPIC_API_KEY production   # optional, enables live mode
npx vercel --prod
```

No database is needed. Desk state is kept in the browser (localStorage); API routes are stateless.

## What to click

1. **Desk** opens on the Sharma email. The copilot proposes a within-policy date change and two traces (cot, anniversary). Approve & send.
2. **Hotel traces** now shows what Aurel Lisboa's housekeeping and front office see, with due dates.
3. Open **Daniel Okafor**: a nut allergy becomes a restricted trace; the reply says who will see it.
4. Open **Tomás Herrera**: non-refundable compassionate cancellation. No refund promised; handoff to the manager.
5. Open **Marco Bianchi**: card details are redacted before display and a payment link replaces them.
6. **+ New message** to type your own, or use the example chips.

## Layout

```
src/lib/pms        mock PMS: 9 hotels, rate plans, policies, bookings, traces (reads + published-rate writes only)
src/lib/agent      proposal schema (zod), rules engine, Claude engine, execution of approved actions
src/lib/inbox      seed messages from the brief
src/app/api        analyze, execute, health
src/app            desk (/), hotel traces (/ops), how it works (/about)
scripts            run-rules.ts: prints the rules engine's output for every seed message
```

```bash
npx tsx scripts/run-rules.ts          # all seeds
npx tsx scripts/run-rules.ts m-005    # one message
```
