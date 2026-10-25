# Build log

**Tooling:** Claude Code in VS Code, one continuous session from reading the brief to a deployable build. Stack: Next.js 16, TypeScript, Tailwind, Google Gemini 3.6 Flash (`@google/genai`), zod. No database; desk state lives in the browser, API routes are stateless.

## How the work was split

**Me:** the thinking. I stopped the tool after it built a first prototype straight from the brief and made it discuss the problem first: what happens today, the root causes, whether this is an operations or a software problem, who the 22 people are and how the work splits between them. The product shape is mine: sort every message by type, give it a named owner on arrival so nothing is unowned, an Important view plus Agent / Manager / Sales / Traces / Auto-sent queues, policy questions answered alone from the first live week, three fixed templates, a dashboard the whole desk can see with flags rather than scores, a day-before check for tomorrow's arrivals, and scope guardrails after I saw an AI agent elsewhere being talked into writing Python. I also set the rules for the documents: the brief's items only, diagrams and tables over text, plain words, no repetition, PDF.

**The tool:** the arithmetic from the data pack, the memo and PRD as HTML with inline SVG printed to PDF, the mock PMS for nine hotels, the rules engine, the Gemini engine with tool declarations, the roster and owner rules, the store, the UI, lint and build fixes, headless-browser screenshots to check layout, and scripts that print the engines' output as text so behaviour could be reviewed before touching the UI.

**Together:** three review rounds on the memo and PRD. I pasted reviewer notes and asked "are these worth it"; we kept the ones that changed a decision and dropped the rest.

## Decisions the tool would not have made

1. **Owner on arrival, not a shared queue.** The tool's first design was an inbox with queues. Queues let items sit. Every item now gets a named person (or the AI agent) by rule the moment it arrives, and the dashboard shows pending per owner.
2. **No headcount reduction.** The tool drafted "22 to 15 through attrition". The numbers do not support the COO's 40%, and a layoff is not what the brief asks us to plan. The memo now says replacing leavers is decided on measured hours, nothing more.
3. **Sales is inside the 22.** The tool had "route groups to Sales, saving 108 hours a week". The brief says the desk handles every contact and the "sales team" is only a decision column. The lever was an invention and came out; the three groups specialists became users with their own login.
4. **Hotel staff are not users.** The tool built a hotel-side board. The desk does not get to redesign the hotels' tools; traces go into the PMS the hotels already use, and the board is relabelled as a stand-in for that list.
5. **Gemini, not Claude.** My call for the live model. The engine was rewritten against the Gemini function-calling API behind the same zod contract, so the rules engine and the guardrails did not change.

## What broke and how it was fixed

- **Next 16 rejected `Date.now()` in client state and `runtime` exports** under `cacheComponents`. Flag off, seed state inside the hydration effect.
- **React compiler lint** failed on an impure call during render and `setState` in an effect. Lazy initial state and an interval.
- **Regex edge cases in the rules engine** ("9am", "do you have parking", "spa" inside "sparkling"): word-level matching with tag weighting and a relative cut-off.
- **The topic check missed "write me a Python script that scrapes hotel prices"** because "hotel" and "prices" counted as stay words. Strong off-topic words now win over stay words.
- **"What time is check-out" had no policy to cite**, so it could not be sent alone. Per-hotel hours and facilities paragraphs were generated for all nine hotels.
- **PDF page overflow**, repeatedly: fixed by cutting text rather than shrinking fonts, verified each time by reading the PDF back and counting pages.
- **The first desk UI was cluttered and put the action below the fold.** Three or four badges per item, a stats strip, cards inside cards, engine timings and re-run buttons on the agent's screen, and an agent landing on items they could not act on. Rebuilt around the agent's job: land on your own items, guest's message left, reply and Approve button right, one line per PMS action under it, developer controls moved to the footer and the sign-in page.
- **A fixed template replaced the follow-up draft.** When the holding reply or group acknowledgement went out automatically, the owner saw the same template again as their draft. The template now travels separately from the draft, so the manager sees a real follow-up to decide on.
- **Policy knowledge was 42 paragraphs hard-coded in the mock PMS with keyword matching**, which the PRD had been calling "policy documents". Replaced with ten markdown handbooks a hotel could maintain (97 sections), embedded with Gemini's embedding model at build time, searched by meaning with keywords as tiebreaker and fallback. On twelve paraphrased questions keyword search missed one ("can we bring our 6 year old"); meaning-based search found all twelve. The rules engine's output on the 13 seeds did not change.
- **Live Gmail mailbox.** A real desk mailbox (reservationsaurel@gmail.com) connected through the Gmail API with OAuth; new mail is polled every 20 seconds, labelled and marked read as it is taken, and approved replies go back in the same thread. Two things the first connection exposed: Google's own account notices arrived as "guest messages" (now a system-sender guard: no-reply, mailer-daemon, Google notices are labelled and skipped, and never replied to), and a test email from a made-up address went straight to Gmail's spam folder, which the desk correctly never reads. The client secret had also been pasted on the refresh-token line, a reminder that the setup needs a checklist, not a paragraph. The first real round trip then delivered an empty email: my message builder filtered out blank lines to drop unused headers, and with them the one blank line that separates headers from body, so Gmail read the whole reply as a malformed header. The desk showed the text, the guest saw nothing. Fixed by building the headers first and adding the separator afterwards; verified by reading the sent message back through the API.
- **Numbers drifting between memo and PRD**: one pass at the end reconciled every figure in both documents.

## Second day

**Decisions.** The team never sees the word "AI": the tool is Aurel Assistant, because a tool read as "we are being replaced" is resisted by the people training it. Email only. The mailbox is the source of truth: every desk loads it on sign-in; no manual reload. Three numbers and one red line on the dashboard, not eight tiles. A policy question with no hotel named gets a fixed question back; the one-word reply is read with the thread. A quiet quote comes back to its owner after 48 hours, never sent alone. A reply with a placeholder cannot be sent; a reply never confirms a change the PMS did not make.

**What broke.** The API routes had no sign-in (server-signed cookie, checked everywhere). Vercel's free cron runs once a day (GitHub Actions every five minutes, Gmail labels as the only state). The OAuth app in Testing status expires its token weekly (publish it). A stale dev server kept the old token and code. Line endings flipped whole diffs (`.gitattributes`). Gemini wrote "we have successfully updated your reservation" and it went out once (tense rules in the prompt, write-first guardrail in code). Every change was checked in headless Chrome, screenshots read back.

## Honest limitations

- **Live run, Gemini.** All thirteen seeds went through Gemini and were diffed against the rules engine; type and auto-send decision agreed on twelve. The one difference is a judgement call ("parking and pets, arriving today": Gemini asked for the booking reference first). Two fixes came out of it: a question that needs a trace is a special request, and the send-alone decision is made in code, not by the model.
- Owners are assigned in each browser, so two browsers can give one loaded item to two people; a shared store is the fix. A message the scheduled check handled is sorted again when a desk takes it, roughly double the model cost per live email. GitHub schedules run at best every five minutes.
- Attachments were verified offline and in the browser, not with a real file through Gmail. There is no test runner; every check ran through throwaway scripts.
- The PMS is a mock; the payment link is a placeholder; WhatsApp and OTA messaging are next quarter; phone is out of scope. The day-before check is a button a manager or senior presses; in production it is a scheduled job.
