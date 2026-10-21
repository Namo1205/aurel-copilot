# Build log

**Tooling:** Claude Code (Claude Fable 5.1) in VS Code, one session, about three hours from reading the brief to a deployable build. Stack: Next.js 16, TypeScript, Tailwind, Anthropic TypeScript SDK, zod. No database.

## How the work was split

**Me:** the product decisions. Read of the data, the bet, what not to build, the behaviour spec (what the copilot handles, never does, hands off, confirms, fails), the shape of the proposal object that both engines must produce, the decision to make traces the core artefact and to build a hotel-side board, the guardrails that live in code rather than in a prompt, and the rollout. I also wrote the memo and PRD, with the tool checking arithmetic against the data pack.

**The tool:** scaffolding, the mock PMS data for nine hotels, the rules engine implementation, the Claude engine with tool definitions, all UI components, lint and build fixes, and a script that prints the engine's output for every seed message so I could review behaviour as text before touching the UI. It also took screenshots with headless Edge to check the layout.

**Together:** iterating the rules engine against the ten seed messages. I read each proposal, said what was wrong ("the advisor email greets the guest, not the sender"; "do you have parking is not a rate enquiry"), the tool fixed it and re-ran all ten.

## Three decisions the tool would not have made

1. **Agent-assist, not an autonomous booking agent.** The default reading of the brief is "build the bot the COO asked for". The data says the money is in response time and the broken-promise rate, the PMS cannot discount so there is nothing to negotiate, and the team switched off the last bot for an unauthorised promise. So v1 drafts and proposes; a human approves every send and write. Autonomy is earned per category from the acceptance data this design collects.

2. **Two engines, one contract, with the rules engine as the baseline.** A deterministic rules engine runs when there is no API key, so the prototype is always usable by a reviewer and never depends on a credential. It also encodes the behaviour spec as code, which makes it a regression baseline: every seed message has a known-good output, and the live model can be diffed against it. Left alone, the tool would have built one LLM call with a prompt and no fallback.

3. **Traces are the product, so build the hotel side.** The obvious prototype is a chat-style inbox. The 23% failure rate lives in the handoff, so the copilot's main output is a structured PMS trace with a department owner, a due date and a restricted flag, and the prototype includes the board the hotel sees. Code-level guardrails follow from the same thinking: card redaction, modification re-check against the PMS, forced restricted flag on sensitive traces and forced human approval are enforced after the model answers, whatever it wrote.

## What broke and how it was fixed

- **Next 16 prerender rejected `Date.now()` in client state.** The scaffold enables `cacheComponents`, which treats a clock read during prerender as an error. Fixed by seeding state inside the hydration effect and turning the experimental flag off for the prototype. The same flag also rejected the `runtime` segment config on API routes.
- **React compiler lint rules.** Two failures: an impure call during render, and `setState` inside an effect. Fixed with a lazy initial state and an interval.
- **Regex word boundary dropped "9am".** The early check-in pattern ended with `\b` after a digit, so "check in at 9am" never matched and the message fell to "unclear". Removed the boundary.
- **"Do you have parking" classified as a rate enquiry.** The enquiry trigger included "do you have". Tightened to rate and availability words, and FAQ intents now take priority.
- **Policy search matched "spa" in "sparkling" and "space".** Substring matching on policy text pulled in unrelated policies as citations. Replaced with word-level matching, tag and topic weighting, and a relative score cut-off.
- **The hero scenario was blocked by the mock inventory.** The deterministic availability hash made the Sharma date change "unavailable" one night in three, so the demo never showed the within-policy modification path. Reduced the sold-out probability and changed the hash salt, then confirmed all ten seeds produce the intended path.
- **Advisor email greeted the guest.** Greeting logic preferred the matched guest's name over the sender's. Reversed the preference.

## Honest limitations

- **The live Claude engine is not exercised end to end in this log.** The build environment had no API key, so live mode was written against the SDK documentation and typechecked, but not run. Mitigations: zod validation of the model's JSON, one repair pass, code-level guardrails, and automatic fallback to the rules engine with the failure shown on screen. First task after deployment is to run the ten seeds in live mode and diff against the rules output.
- No real email or WhatsApp connectors; state is in the browser; the payment link is a placeholder.
- Session export: the Claude Code transcript for this session is attached where the submission allows.
