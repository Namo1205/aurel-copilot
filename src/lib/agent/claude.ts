// Live engine: Claude with read-only PMS tools, returning the same AgentProposal
// contract as the rules engine. Nothing here writes to the PMS; writes only
// happen in /api/execute after a human approves.

import Anthropic from "@anthropic-ai/sdk";
import {
  cancellationCheck,
  checkModification,
  findBookings,
  getAvailabilityAndRates,
  getBooking,
  getGuest,
  getHotel,
  HOTELS,
  searchPolicies,
} from "@/lib/pms";
import type { InboundMessage } from "@/lib/inbox/seed";
import { AgentProposal } from "./schema";
import { redactCards } from "./rules";

export const MODEL = "claude-opus-5-5";

export interface ToolCallLog {
  name: string;
  input: unknown;
  result: string;
}

function buildSystemPrompt(now: Date): string {
  const hotels = HOTELS.map(
    (h) =>
      `- ${h.id}: ${h.name}, ${h.city}, ${h.country} (${h.kind}). Check-in ${h.checkIn}, check-out ${h.checkOut}. Rooms: ${h.roomTypes
        .map((r) => `${r.code}=${r.name} (max ${r.maxGuests}${r.cotCompatible ? "" : ", no cot"})`)
        .join("; ")}. Departments: ${h.departments.join(", ")}.`,
  ).join("\n");

  return `You are the Aurel Hotels reservations copilot. You read one inbound guest message, look up facts in the PMS with the tools provided, and produce a structured proposal for a human reservations agent: triage, the booking you matched, proposed actions, and a draft reply. A human reads and approves everything before anything is sent or committed. Today is ${now.toISOString().slice(0, 10)}.

## What you do
- Triage the message into one primary category and any secondary ones.
- Find the booking when there is a reference or a surname plus hotel or month. Say how confident you are.
- Quote only live rates returned by get_availability_and_rates. Never invent a number.
- Turn every special request into a create_trace action for the right hotel department with a due date before arrival. The reply tells the guest the team will confirm; it never says the request is done.
- Answer pre-arrival questions from search_policies results for that hotel. If no policy covers it, say the hotel team will confirm.
- Write the reply in the voice of a warm, precise luxury-hotel reservations agent. Plain sentences. No exclamation marks. Match the channel: WhatsApp and OTA messages are short; email can be fuller. Greet the sender by first name when known.

## What you never do
- Never confirm early check-in, an upgrade, a transfer, or any special request as guaranteed. These are confirmed by the hotel team, in writing, later.
- Never discount, price-match or quote below published rates. Rate parity applies. Explain direct-booking benefits instead.
- Never confirm a refund, waiver or credit outside policy. Propose a handoff to the reservations manager with an empathetic holding reply.
- Never modify an Advance Purchase booking; hand off to the reservations manager.
- Never ask for, repeat or store card details. If card details appear, propose send_payment_link and tell the guest they have been removed.
- Never put allergy, medical or accessibility details in free text. Put the minimum needed in a create_trace with sensitive=true, and tell the guest who will see it. Set sensitiveData accordingly.
- Never quote or price groups (8+ rooms, events, weddings, meeting rooms). Hand off to group_sales.
- Never guess a booking. If you cannot match one and you need it, ask for the reference.

## Handoffs
- reservations_manager: policy exceptions, refunds outside policy, non-public or negotiated rates, Advance Purchase changes.
- group_sales: groups and events.
- reservations_agent: anything you are not confident about, advisor and VIP confirmations, executing a cancellation the guest has confirmed.
- hotel_team: only when a hotel must answer something no policy covers.

## Output
When you have finished using tools, respond with ONLY a JSON object (no prose, no code fences) matching this TypeScript shape exactly:
{
  "triage": { "category": "new_booking_enquiry"|"modify_booking"|"special_request"|"pre_arrival_question"|"cancellation_refund"|"group_event"|"other", "secondaryCategories": Category[], "hotelId": string|null, "urgency": "low"|"normal"|"high", "language": string, "summary": string },
  "bookingMatch": { "bookingId": string|null, "confidence": "none"|"low"|"high", "note": string },
  "sensitiveData": { "present": boolean, "types": ("allergy"|"medical"|"accessibility"|"payment_card")[], "handling": string },
  "actions": Action[],
  "draftReply": string,
  "didNotPromise": string[],
  "policyCitations": string[],   // policy ids you relied on
  "confidence": number,          // 0..1
  "autoSendEligible": boolean,   // true only for a pure pre-arrival FAQ answered fully from policy with no actions
  "requiresHuman": true,
  "requiresHumanReason": string
}
Action is one of:
- { "type": "quote", "hotelId", "roomType", "roomName", "checkIn", "checkOut", "nights", "ratePlan", "nightlyRate", "total", "currency": "EUR", "refundable", "available", "rationale" }  (copy numbers from the tool result)
- { "type": "modify_booking", "bookingId", "changes": { "checkIn"?, "checkOut"?, "roomType"?, "adults"? }, "withinPolicy", "newNightlyRate"?, "rateDifferenceTotal"?, "rationale" }  (only after check_modification says allowed)
- { "type": "create_trace", "hotelId", "bookingId": string|null, "department": "front_office"|"housekeeping"|"fnb"|"concierge"|"reservations"|"sales"|"spa", "summary", "due": "YYYY-MM-DD", "sensitive", "rationale" }
- { "type": "handoff", "to": "reservations_manager"|"group_sales"|"reservations_agent"|"hotel_team", "reason", "urgency": "today"|"this_week"|"before_arrival", "context" }
- { "type": "send_payment_link", "bookingId": string|null, "rationale" }

## Hotels
${hotels}`;
}

const tools: Anthropic.Tool[] = [
  {
    name: "lookup_booking",
    description: "Find a booking by reference (AUR-xxxxx) or by surname with optional hotel and arrival month. Returns booking, hotel and guest profile.",
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string" },
        surname: { type: "string" },
        hotelId: { type: "string" },
        month: { type: "integer", description: "Arrival month 1-12" },
      },
    },
  },
  {
    name: "get_availability_and_rates",
    description: "Live availability and published rates for a hotel, date range and party size. Optionally restrict to a room type code.",
    input_schema: {
      type: "object",
      properties: {
        hotelId: { type: "string" },
        checkIn: { type: "string", description: "YYYY-MM-DD" },
        checkOut: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "integer" },
        roomType: { type: "string" },
      },
      required: ["hotelId", "checkIn", "checkOut", "adults"],
    },
  },
  {
    name: "search_policies",
    description: "Search group-wide and hotel-specific policies (cancellation, parking, pets, transfers, cots, allergies, early check-in, parity, payment, groups, VIP programmes).",
    input_schema: {
      type: "object",
      properties: { hotelId: { type: "string" }, query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "check_modification",
    description: "Check whether a booking can be modified to new dates/room at published rates, and the rate difference.",
    input_schema: {
      type: "object",
      properties: {
        bookingId: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
        roomType: { type: "string" },
        adults: { type: "integer" },
      },
      required: ["bookingId"],
    },
  },
  {
    name: "check_cancellation",
    description: "Check whether cancelling a booking today is within policy.",
    input_schema: { type: "object", properties: { bookingId: { type: "string" } }, required: ["bookingId"] },
  },
];

function runTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "lookup_booking": {
      const ref = typeof input.reference === "string" ? input.reference : undefined;
      let bookings = ref ? [getBooking(ref)].filter(Boolean) : [];
      if (!bookings.length && typeof input.surname === "string") {
        bookings = findBookings({
          surname: input.surname,
          hotelId: typeof input.hotelId === "string" ? input.hotelId : undefined,
          month: typeof input.month === "number" ? input.month : undefined,
        });
      }
      return bookings.map((b) => ({
        booking: b,
        hotel: getHotel(b!.hotelId)?.name,
        guest: getGuest(b!.guestId),
      }));
    }
    case "get_availability_and_rates":
      return getAvailabilityAndRates({
        hotelId: String(input.hotelId),
        checkIn: String(input.checkIn),
        checkOut: String(input.checkOut),
        adults: Number(input.adults ?? 2),
        roomType: typeof input.roomType === "string" ? input.roomType : undefined,
      }).map(({ hotelId, roomType, roomName, nights, available, roomsLeft, ratePlan, ratePlanName, refundable, nightlyRate, total, cancellationTerms }) => ({
        hotelId,
        roomType,
        roomName,
        nights,
        available,
        roomsLeft,
        ratePlan,
        ratePlanName,
        refundable,
        nightlyRate,
        total,
        cancellationTerms,
      }));
    case "search_policies":
      return searchPolicies(typeof input.hotelId === "string" ? input.hotelId : null, String(input.query));
    case "check_modification": {
      const b = getBooking(String(input.bookingId));
      if (!b) return { error: "booking not found" };
      return checkModification(b, {
        checkIn: typeof input.checkIn === "string" ? input.checkIn : undefined,
        checkOut: typeof input.checkOut === "string" ? input.checkOut : undefined,
        roomType: typeof input.roomType === "string" ? input.roomType : undefined,
        adults: typeof input.adults === "number" ? input.adults : undefined,
      });
    }
    case "check_cancellation": {
      const b = getBooking(String(input.bookingId));
      if (!b) return { error: "booking not found" };
      return cancellationCheck(b, new Date().toISOString().slice(0, 10));
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function analyzeWithClaude(
  msg: InboundMessage,
  now: Date = new Date(),
): Promise<{ proposal: AgentProposal; toolCalls: ToolCallLog[]; model: string }> {
  const client = new Anthropic();
  const toolCalls: ToolCallLog[] = [];
  const safeBody = redactCards(msg.body);
  const cardRedacted = safeBody !== msg.body;

  const userContent = [
    `Channel: ${msg.channel}`,
    `From: ${msg.fromName} <${msg.from}>`,
    msg.subject ? `Subject: ${msg.subject}` : null,
    msg.bookingRef ? `Booking reference carried by the channel: ${msg.bookingRef}` : null,
    cardRedacted ? "NOTE: card details were present in the original message and have been redacted before you saw it." : null,
    "",
    safeBody,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
  const system = buildSystemPrompt(now);

  let finalText = "";
  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      tools,
      messages,
      output_config: { effort: "medium" },
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined this request.");
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      let out: unknown;
      try {
        out = runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      const text = JSON.stringify(out);
      toolCalls.push({ name: tu.name, input: tu.input, result: text.length > 600 ? text.slice(0, 600) + "…" : text });
      return { type: "tool_result", tool_use_id: tu.id, content: text };
    });
    messages.push({ role: "user", content: results });
  }

  let parsed = AgentProposal.safeParse(safeJson(finalText));
  if (!parsed.success) {
    // One repair pass: feed the validation errors back.
    messages.push({ role: "assistant", content: finalText || "{}" });
    messages.push({
      role: "user",
      content: `Your JSON did not validate: ${JSON.stringify(parsed.error.issues.slice(0, 8))}. Return the corrected JSON object only.`,
    });
    const fix = await client.messages.create({ model: MODEL, max_tokens: 8000, system, messages, output_config: { effort: "low" } });
    const text = fix.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    parsed = AgentProposal.safeParse(safeJson(text));
    if (!parsed.success) throw new Error("Model output did not match the proposal schema after one repair attempt.");
  }

  // Hard guardrails enforced in code regardless of what the model wrote.
  const proposal = parsed.data;
  proposal.requiresHuman = true;
  if (cardRedacted) {
    proposal.sensitiveData.present = true;
    if (!proposal.sensitiveData.types.includes("payment_card")) proposal.sensitiveData.types.push("payment_card");
    if (!proposal.actions.some((a) => a.type === "send_payment_link")) {
      proposal.actions.unshift({ type: "send_payment_link", bookingId: proposal.bookingMatch.bookingId, rationale: "Card details were present in the message (enforced in code)." });
    }
  }
  for (const a of proposal.actions) {
    if (a.type === "modify_booking") {
      const b = getBooking(a.bookingId);
      const chk = b ? checkModification(b, a.changes) : { allowed: false, reason: "booking not found", requiresManager: false };
      a.withinPolicy = chk.allowed;
      if (!chk.allowed) a.rationale = `Blocked in code: ${chk.reason}`;
    }
  }
  if (proposal.sensitiveData.present && proposal.sensitiveData.types.some((t) => t !== "payment_card")) {
    for (const a of proposal.actions) if (a.type === "create_trace" && /allerg|medical|wheelchair|access|diabet|epilep/i.test(a.summary)) a.sensitive = true;
  }
  proposal.draftReply = redactCards(proposal.draftReply);

  return { proposal, toolCalls, model: MODEL };
}

function safeJson(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return {};
  }
}
