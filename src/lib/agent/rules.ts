// Rule-based analysis engine. Runs with no API key and is fully deterministic.
// It encodes the same behaviour spec the Claude engine is prompted with, so the
// two modes can be diffed on the same inbox.

import {
  cancellationCheck,
  checkModification,
  findBookings,
  findHotelByText,
  getAvailabilityAndRates,
  getBooking,
  getGuest,
  getHotel,
  nightsBetween,
  searchPolicies,
  type Booking,
  type Hotel,
  type Policy,
  type RateQuote,
} from "@/lib/pms";
import type { InboundMessage } from "@/lib/inbox/seed";
import { AgentProposal, type Category, type ProposedAction } from "./schema";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
export function redactCards(text: string): string {
  return text.replace(CARD_RE, (m) => (m.replace(/\D/g, "").length >= 13 ? "[card number removed]" : m)).replace(
    /\bcvv\s*:?\s*\d{3,4}/gi,
    "CVV [removed]",
  );
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateIso: string, n: number): string {
  return iso(new Date(Date.parse(dateIso) + n * 86400000));
}
function nextOccurrence(month: number, day: number, now: Date): string {
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getTime() < now.getTime()) year += 1;
  return iso(new Date(Date.UTC(year, month - 1, day)));
}
function monthIndex(word: string): number {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : 0;
}
function fmtDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function fmtShort(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
function eur(n: number): string {
  return `EUR ${n.toLocaleString("en-GB")}`;
}

interface DateRange {
  checkIn: string;
  checkOut: string;
}

const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

export function parseDateRange(text: string, now: Date): DateRange | null {
  const t = text.toLowerCase();
  let m = t.match(new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})\\s+${MONTH_RE}`));
  if (m) {
    const mo = monthIndex(m[3]);
    const a = nextOccurrence(mo, +m[1], now);
    const b = nextOccurrence(mo, +m[2], now);
    if (Date.parse(b) > Date.parse(a)) return { checkIn: a, checkOut: b };
  }
  m = t.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})`));
  if (m) {
    const mo = monthIndex(m[1]);
    const a = nextOccurrence(mo, +m[2], now);
    const b = nextOccurrence(mo, +m[3], now);
    if (Date.parse(b) > Date.parse(a)) return { checkIn: a, checkOut: b };
  }
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\b`));
  const nights = t.match(/\b(\d{1,2})\s+nights?\b/);
  if (m && nights) {
    const a = nextOccurrence(monthIndex(m[2]), +m[1], now);
    return { checkIn: a, checkOut: addDays(a, +nights[1]) };
  }
  return null;
}

export function parseSingleDate(text: string, now: Date): string | null {
  const m = text.toLowerCase().match(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\b`));
  if (!m) return null;
  return nextOccurrence(monthIndex(m[2]), +m[1], now);
}

function parseAdults(text: string): number {
  const m = text.toLowerCase().match(/\b(\d)\s*(adults?|people|persons|pax|of us)\b/);
  if (m) return +m[1];
  if (/\bcouple\b|\bmy wife\b|\bmy husband\b|\bwe\b/.test(text.toLowerCase())) return 2;
  return 2;
}

function parseRoomType(text: string, hotel: Hotel): string | undefined {
  const t = text.toLowerCase();
  if (/sea ?view/.test(t)) return hotel.roomTypes.find((r) => r.code === "SEA" || r.code === "RIV" || r.code === "OCN")?.code;
  if (/suite/.test(t)) return hotel.roomTypes.find((r) => /suite/i.test(r.name))?.code;
  if (/villa/.test(t)) return hotel.roomTypes.find((r) => /villa/i.test(r.name))?.code;
  if (/family/.test(t)) return hotel.roomTypes.find((r) => r.code === "FAM")?.code;
  return undefined;
}

function parseTime(text: string, after: RegExp): string | null {
  const m = text.toLowerCase().match(after);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? m[2] : "00";
  const ap = m[3];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

interface Intents {
  card: boolean;
  group: boolean;
  cancel: boolean;
  compassionate: boolean;
  modify: boolean;
  enquiry: boolean;
  priceMatch: boolean;
  cot: boolean;
  occasion: string | null;
  transfer: boolean;
  earlyCheckIn: boolean;
  spa: boolean;
  dining: boolean;
  allergy: boolean;
  medical: boolean;
  accessibility: boolean;
  vip: boolean;
  parking: boolean;
  pets: boolean;
  faqOther: boolean;
  repeat: boolean;
}

function detect(text: string): Intents {
  const t = text.toLowerCase();
  const groupSize = t.match(/\b(\d{1,3})\s*(people|guests|pax|rooms|delegates|attendees)\b/);
  return {
    card: CARD_RE.test(text) || /\bcvv\b/i.test(text),
    group:
      (groupSize ? +groupSize[1] >= 8 : false) ||
      /\b(wedding|offsite|off-site|conference|meeting room|event space|group booking|corporate retreat)\b/.test(t),
    cancel: /\b(cancel|cancellation|refund)/.test(t),
    compassionate: /\b(hospital|passed away|bereave|funeral|died|death|emergency|surgery|diagnos)/.test(t),
    modify: /\b(push it|move (our|the|my) (booking|stay|dates)|change (the |our |my )?(dates?|room|booking)|a day (later|earlier)|one day (later|earlier)|extend|add (a|one|an extra) night|shorten|arrive a day|leave a day)\b/.test(
      t,
    ),
    enquiry: /\b(availability|available|rates?|prices?|how much|quote|per night|a night|book(ing)? a room|looking to book|any rooms?)\b/.test(t) && !/\bcancel/.test(t),
    priceMatch: /\b(beat it|beat that|price ?match|match (the|that) (price|rate)|cheaper|discount|best price|booking\.com shows|expedia shows)\b/.test(t),
    cot: /\b(cot|crib|baby bed|travel cot)\b/.test(t),
    occasion: (t.match(/\b(anniversary|birthday|honeymoon|proposal|celebrat\w+)\b/) || [null, null])[1],
    transfer: /\b(transfer|airport pick ?up|pick us up|driver|collect us)\b/.test(t),
    earlyCheckIn: /\b(early check[- ]?in|check[- ]?in (at|around|by) \d|arrive (early|at \d)|early arrival)/.test(t),
    spa: /\bspa|massage|treatment\b/.test(t),
    dining: /\b(restaurant|dinner|recommend|dining|eat)\b/.test(t),
    allergy: /\b(allerg|coeliac|celiac|gluten|lactose|anaphyla)/.test(t),
    medical: /\b(medical|diabet|epilep|asthma|oxygen|medication|dialysis)/.test(t),
    accessibility: /\b(wheelchair|accessib|mobility|step-free|hearing|visually impaired|disab)/.test(t),
    vip: /\b(travel advisor|luxury programme|luxury program|vip|virtuoso|amenit)/.test(t),
    parking: /\b(parking|park the car|garage|valet)\b/.test(t),
    pets: /\b(pet|dog|cat|puppy)s?\b/.test(t),
    faqOther: /\b(directions|how do we get|wifi|wi-fi|pool|gym|breakfast time|check[- ]?out time|dress code)\b/.test(t),
    repeat: /\b(third time|second time|again|still (no|haven't|not)|nobody (has )?(replied|answered)|chasing)\b/.test(t),
  };
}

function resolveBooking(msg: InboundMessage, hotel: Hotel | undefined, now: Date): { booking?: Booking; confidence: "none" | "low" | "high"; note: string } {
  const text = `${msg.subject ?? ""} ${msg.body}`;
  const ref = msg.bookingRef ?? text.match(/\bAUR-\d{5}\b/i)?.[0];
  if (ref) {
    const b = getBooking(ref);
    if (b) return { booking: b, confidence: "high", note: `Matched by reference ${b.id}.` };
    return { confidence: "none", note: `Reference ${ref} not found in the PMS.` };
  }
  const under = text.match(/\bunder\s+([A-Z][a-z]+)/)?.[1];
  const surname = under ?? msg.fromName.split(/[ ,]/).filter(Boolean).pop();
  if (surname) {
    const month = (() => {
      const m = text.toLowerCase().match(new RegExp(`\\bin\\s+${MONTH_RE}\\b`));
      return m ? monthIndex(m[1]) : undefined;
    })();
    const matches = findBookings({ surname, hotelId: hotel?.id, month });
    if (matches.length === 1) {
      const b = matches[0];
      return {
        booking: b,
        confidence: "high",
        note: `Matched by surname "${surname}"${hotel ? `, ${hotel.name}` : ""}${month ? `, ${MONTHS[month - 1]}` : ""}: ${b.id}, ${fmtShort(b.checkIn)} to ${fmtShort(b.checkOut)}, ${nightsBetween(b.checkIn, b.checkOut)} nights.`,
      };
    }
    if (matches.length > 1) return { confidence: "low", note: `${matches.length} bookings under "${surname}"; ask the guest for the reference.` };
  }
  void now;
  return { confidence: "none", note: "No booking reference or matching surname. Reply should ask for the reference if one is needed." };
}

function greeting(msg: InboundMessage, guestName?: string): string {
  const sender = msg.fromName.replace(/^Unknown.*$/, "");
  const first = (sender || guestName || "").split(/[ ,]/)[0];
  if (msg.channel === "whatsapp") return first ? `Hi ${first},` : "Hi,";
  if (msg.channel === "ota") return first ? `Dear ${first},` : "Dear guest,";
  return first ? `Dear ${first},` : "Dear guest,";
}

function signoff(msg: InboundMessage, hotel?: Hotel): string {
  if (msg.channel === "whatsapp" || msg.channel === "ota") return `Aurel Reservations${hotel ? ` for ${hotel.name}` : ""}`;
  return `Warm regards,\nAurel Reservations${hotel ? `\n${hotel.name}` : ""}`;
}

function pickQuotes(quotes: RateQuote[], roomType?: string): RateQuote[] {
  const avail = quotes.filter((q) => q.available);
  const pool = roomType ? avail.filter((q) => q.roomType === roomType) : avail;
  const byRoom = new Map<string, RateQuote[]>();
  for (const q of pool) byRoom.set(q.roomType, [...(byRoom.get(q.roomType) ?? []), q]);
  const first = [...byRoom.values()][0] ?? [];
  return first.filter((q) => q.ratePlan === "FLEX" || q.ratePlan === "ADV");
}

export function analyzeWithRules(msg: InboundMessage, now: Date = new Date()): AgentProposal {
  const rawText = `${msg.subject ?? ""}\n${msg.body}`;
  const it = detect(rawText);
  const text = redactCards(rawText);

  let hotel = findHotelByText(text);
  const bm = resolveBooking(msg, hotel, now);
  const booking = bm.booking;
  if (booking) hotel = getHotel(booking.hotelId);
  const guest = booking ? getGuest(booking.guestId) : undefined;

  const actions: ProposedAction[] = [];
  const paras: string[] = [];
  const didNotPromise: string[] = [];
  const citations = new Set<string>();
  const secondary = new Set<Category>();
  const sensitiveTypes: AgentProposal["sensitiveData"]["types"] = [];
  let urgency: "low" | "normal" | "high" = "normal";
  let confidence = 0.8;
  let handoffReason = "";
  const cite = (p: Policy[]) => p.forEach((x) => citations.add(x.id));
  const arrival = booking?.checkIn ?? parseSingleDate(text, now) ?? addDays(iso(now), 2);
  const dueBefore = (days: number) => addDays(arrival, -days);

  // 0. Payment card in a message: redact, never store, send a payment link. Overrides everything else.
  if (it.card) {
    sensitiveTypes.push("payment_card");
    cite(searchPolicies(hotel?.id ?? null, "card payment"));
    actions.push({
      type: "send_payment_link",
      bookingId: booking?.id ?? null,
      rationale: "Card details arrived in a message. They are redacted before storage and the guest is sent a gateway link instead.",
    });
    paras.push(
      "Thank you for your message. For your security we never take card details by email or message, so I have removed them from our system and not recorded them anywhere. Please use the secure payment link below instead; it takes under a minute and goes directly to our payment provider.",
      "[Secure payment link will be inserted on send]",
      "If you would rather pay by phone, call us and we will take it through the gateway with you.",
    );
    didNotPromise.push("Did not confirm the booking as guaranteed; the guarantee only applies once the gateway payment succeeds.");
    return finish("other", "high");
  }

  // 1. Primary category by priority.
  let category: Category = "other";
  if (it.group) category = "group_event";
  else if (it.cancel) category = "cancellation_refund";
  else if (it.modify && booking) category = "modify_booking";
  else if ((it.enquiry || it.priceMatch) && !(it.parking || it.pets || it.faqOther)) category = "new_booking_enquiry";
  else if (it.cot || it.occasion || it.transfer || it.earlyCheckIn || it.spa || it.dining || it.allergy || it.vip) category = "special_request";
  else if (it.parking || it.pets || it.faqOther) category = "pre_arrival_question";

  // 2. Group and events: route to sales, acknowledge, no quoting.
  if (it.group) {
    cite(searchPolicies(hotel?.id ?? null, "group event"));
    actions.push({
      type: "handoff",
      to: "group_sales",
      reason: "8+ rooms or event space requested. Group Sales owns pricing and contracting.",
      urgency: "this_week",
      context: text.slice(0, 400),
    });
    paras.push(
      `Thank you for thinking of ${hotel?.name ?? "Aurel"} for your group. Requests of this size are handled by our Group Sales team so you get a single proposal covering rooms, meeting space and dining. I have passed your brief to them and a sales manager will come back to you within one working day with availability and a proposal.`,
      "If you can share your preferred dates, an approximate room count per night and any meeting-room requirements, it will help us come back with something accurate first time.",
    );
    didNotPromise.push("No rates or availability quoted for a group; sales sets group pricing.");
    return finish(category, "normal");
  }

  // 3. Cancellation / refund.
  if (it.cancel) {
    if (!booking) {
      paras.push(
        "I am sorry to hear you need to cancel. To find your reservation and tell you exactly where you stand, could you reply with your booking reference (it starts with AUR-) or the name and dates of the stay? I will come back to you as soon as I have it.",
      );
      confidence = 0.6;
    } else {
      const chk = cancellationCheck(booking, iso(now));
      cite(searchPolicies(hotel!.id, booking.ratePlan === "ADV" ? "cancellation non-refundable exception" : "cancellation flexible"));
      if (chk.withinPolicy) {
        paras.push(
          `I am sorry to hear you need to cancel your stay at ${hotel!.name} from ${fmtDate(booking.checkIn)}. Your booking is on our Flexible rate and is still inside the free cancellation window, so there is no charge. Please reply with a quick "yes, please cancel" and I will process it and send written confirmation straight away.`,
        );
        actions.push({
          type: "handoff",
          to: "reservations_agent",
          reason: "Within-policy cancellation. Agent executes on guest confirmation (v1 does not cancel autonomously).",
          urgency: "today",
          context: `${booking.id}: ${chk.reason}`,
        });
      } else {
        urgency = it.compassionate ? "high" : "normal";
        handoffReason = "Refund or waiver outside policy needs a reservations manager.";
        actions.push({
          type: "handoff",
          to: "reservations_manager",
          reason: it.compassionate
            ? "Non-refundable booking with a compassionate reason (hospitalisation). Only a manager can grant a goodwill credit."
            : "Cancellation inside the chargeable window. Only a manager can waive the charge.",
          urgency: "today",
          context: `${booking.id}, ${hotel!.name}, ${fmtShort(booking.checkIn)} to ${fmtShort(booking.checkOut)}, ${booking.ratePlan} rate, ${eur(booking.nightlyRate)} per night. ${chk.reason}`,
        });
        paras.push(
          it.compassionate
            ? `I am so sorry to hear about your mother, and I hope she is being well looked after. Please do not worry about the booking right now.`
            : `Thank you for letting us know you need to cancel your stay at ${hotel!.name}.`,
          `I want to be straightforward with you: your reservation ${booking.id} is on a ${booking.ratePlan === "ADV" ? "prepaid, non-refundable rate" : "rate that is now inside its cancellation window"}, so I am not able to release the charge myself. What I have done is pass your case to our reservations manager today with a request to review it as a goodwill exception. They will contact you directly${it.compassionate ? ", and they will not ask you for anything you are not comfortable sharing" : ""}.`,
          "In the meantime, nothing further is needed from you, and your reservation stays in place so no option is closed off.",
        );
        didNotPromise.push("Did not confirm a refund, credit or waiver. Manager decides.");
        didNotPromise.push("Did not ask the guest for medical documentation.");
      }
    }
    return finish(category, urgency);
  }

  // 4. Modification.
  if (it.modify) {
    if (!booking) {
      paras.push(
        "Happy to help change your booking. Could you send me your booking reference (AUR-xxxxx) and the new dates you have in mind? I will check availability and the rate for the new dates and confirm by return.",
      );
      confidence = 0.6;
    } else {
      cite(searchPolicies(hotel!.id, "modify dates"));
      const t = text.toLowerCase();
      let shift = 0;
      if (/\b(a|one) day later\b|\bpush it (back )?(a|one) day\b/.test(t)) shift = 1;
      if (/\b(a|one) day earlier\b/.test(t)) shift = -1;
      const extendM = t.match(/\b(extend|add)\b.*?\b(a|an extra|one|\d)\s*(more )?nights?\b/);
      const changes: { checkIn?: string; checkOut?: string } = {};
      if (shift !== 0) {
        changes.checkIn = addDays(booking.checkIn, shift);
        changes.checkOut = addDays(booking.checkOut, shift);
      } else if (extendM) {
        const n = extendM[2] === "a" || extendM[2] === "an extra" || extendM[2] === "one" ? 1 : +extendM[2];
        changes.checkOut = addDays(booking.checkOut, n);
      }
      if (!changes.checkIn && !changes.checkOut) {
        paras.push(
          `Happy to help change your booking ${booking.id} at ${hotel!.name} (currently ${fmtShort(booking.checkIn)} to ${fmtShort(booking.checkOut)}). Could you confirm the exact new dates you would like? I will check availability and the rate for those dates and confirm by return.`,
        );
        confidence = 0.65;
      } else {
        const chk = checkModification(booking, changes);
        const newIn = changes.checkIn ?? booking.checkIn;
        const newOut = changes.checkOut ?? booking.checkOut;
        if (chk.allowed) {
          actions.push({
            type: "modify_booking",
            bookingId: booking.id,
            changes,
            withinPolicy: true,
            newNightlyRate: chk.newNightlyRate,
            rateDifferenceTotal: chk.rateDifferenceTotal,
            rationale: chk.reason,
          });
          const diff = chk.rateDifferenceTotal ?? 0;
          const diffText =
            diff === 0
              ? "The rate for the new dates is the same as your current booking."
              : diff > 0
                ? `The live rate for the new dates is ${eur(chk.newNightlyRate!)} per night, so the total increases by ${eur(diff)}.`
                : `The live rate for the new dates is ${eur(chk.newNightlyRate!)} per night, so the total comes down by ${eur(-diff)}.`;
          paras.push(
            `Good news: I can move your booking ${booking.id} at ${hotel!.name} to ${fmtDate(newIn)} to ${fmtDate(newOut)}, same ${hotel!.roomTypes.find((r) => r.code === booking.roomType)?.name ?? "room"} and the same flexible terms. ${diffText}`,
            "Reply with a quick \"yes\" and I will make the change and send you an updated confirmation.",
          );
        } else if (chk.requiresManager) {
          handoffReason = chk.reason;
          actions.push({
            type: "handoff",
            to: "reservations_manager",
            reason: chk.reason,
            urgency: "this_week",
            context: `${booking.id}: requested ${fmtShort(newIn)} to ${fmtShort(newOut)}.`,
          });
          paras.push(
            `Thank you for getting in touch about moving your stay. Your booking ${booking.id} is on a prepaid rate that does not allow date changes automatically, so I have asked our reservations manager to look at rebooking you for ${fmtShort(newIn)} to ${fmtShort(newOut)} as an exception. You will hear from them within one working day.`,
          );
          didNotPromise.push("Did not confirm the date change on a non-changeable rate.");
        } else {
          const alts = pickQuotes(getAvailabilityAndRates({ hotelId: hotel!.id, checkIn: newIn, checkOut: newOut, adults: booking.adults }));
          paras.push(
            `Thank you for getting in touch. Unfortunately your current room type is not available for ${fmtShort(newIn)} to ${fmtShort(newOut)}.${
              alts.length
                ? ` We do have a ${alts[0].roomName} available for those dates at ${eur(alts[0].nightlyRate)} per night on our flexible rate. Would you like me to move you to that, or keep your original dates?`
                : " Would you like me to keep your original dates, or look at other dates for you?"
            }`,
          );
          for (const q of alts.slice(0, 1)) actions.push(quoteAction(q, "Alternative room for the requested dates, live rate."));
        }
      }
    }
  }

  // 5. New booking enquiry / price match.
  if (!it.modify && (it.enquiry || it.priceMatch) && !it.cancel && !(it.parking || it.pets || it.faqOther)) {
    const range = parseDateRange(text, now);
    if (!hotel) {
      paras.push(
        "Thank you for your enquiry. Which of our hotels are you interested in, and for which dates and number of guests? As soon as I have those I will send live availability and rates.",
      );
      confidence = 0.55;
    } else if (!range) {
      paras.push(
        `Thank you for your interest in ${hotel.name}. Could you confirm your arrival and departure dates and the number of guests? I will come straight back with live availability and rates.`,
      );
      confidence = 0.65;
    } else {
      const adults = parseAdults(text);
      const roomType = parseRoomType(text, hotel);
      const quotes = pickQuotes(getAvailabilityAndRates({ hotelId: hotel.id, checkIn: range.checkIn, checkOut: range.checkOut, adults }), roomType);
      cite(searchPolicies(hotel.id, "rate parity price match"));
      if (!quotes.length) {
        const any = pickQuotes(getAvailabilityAndRates({ hotelId: hotel.id, checkIn: range.checkIn, checkOut: range.checkOut, adults }));
        paras.push(
          `Thank you for your enquiry. I am sorry, the room you asked for is fully booked for ${fmtShort(range.checkIn)} to ${fmtShort(range.checkOut)}.${
            any.length ? ` We do have a ${any[0].roomName} available at ${eur(any[0].nightlyRate)} per night on the flexible rate. Would that work, or would you like me to check nearby dates?` : " Would you like me to check nearby dates?"
          }`,
        );
        for (const q of any.slice(0, 1)) actions.push(quoteAction(q, "Alternative room, live rate."));
      } else {
        for (const q of quotes) actions.push(quoteAction(q, "Live published rate from the PMS. Matches OTA parity."));
        const flex = quotes.find((q) => q.ratePlan === "FLEX");
        const adv = quotes.find((q) => q.ratePlan === "ADV");
        const nights = nightsBetween(range.checkIn, range.checkOut);
        paras.push(
          `Thank you for your message. For ${fmtShort(range.checkIn)} to ${fmtShort(range.checkOut)} (${nights} nights, ${adults} adults) at ${hotel.name}, the ${quotes[0].roomName} is available at:`,
          [flex && `• ${eur(flex.nightlyRate)} per night, Flexible: free cancellation until 48 to 72 hours before arrival (${eur(flex.total)} total)`, adv && `• ${eur(adv.nightlyRate)} per night, Advance Purchase: prepaid and non-refundable (${eur(adv.total)} total)`]
            .filter(Boolean)
            .join("\n"),
        );
        if (it.priceMatch) {
          paras.push(
            "To be straight with you on price: our published rates are the same wherever you book, so I cannot go below what you have seen elsewhere. What booking directly with us gives you is a flexible check-out when available, a welcome drink on arrival, no booking fee, and a reservation we can adjust ourselves if your plans change. If you book direct and find the identical room and conditions cheaper on the day, tell us and a manager will look at it.",
          );
          didNotPromise.push("Did not discount or match the OTA price (rate parity; agents cannot discount).");
        }
        paras.push("Shall I hold one of these for you? I can send a secure payment link to confirm.");
      }
    }
  }

  // 6. Special requests. Each becomes a trace with an owner and a due date; the reply never confirms delivery.
  if (hotel && booking) {
    const roomInfo = hotel.roomTypes.find((r) => r.code === booking.roomType);
    if (it.cot) {
      secondary.add("special_request");
      cite(searchPolicies(hotel.id, "cot"));
      if (roomInfo && !roomInfo.cotCompatible) {
        paras.push(`On the cot: unfortunately a cot cannot be placed in the ${roomInfo.name}. I can look at a room type that takes one if that helps; just let me know.`);
        didNotPromise.push("Did not confirm a cot in a room that cannot take one.");
      } else {
        actions.push({
          type: "create_trace",
          hotelId: hotel.id,
          bookingId: booking.id,
          department: "housekeeping",
          summary: `Cot in ${roomInfo?.name ?? "room"} for infant, set up before arrival. Guest to confirm child's age.`,
          due: dueBefore(1),
          sensitive: false,
          rationale: "Cots are complimentary and room-compatible; housekeeping owns set-up.",
        });
        paras.push("A cot is no problem and is complimentary. I have asked housekeeping to have it set up in your room before you arrive; could you confirm your little one's age so they bring the right one?");
      }
    }
    if (it.occasion) {
      secondary.add("special_request");
      cite(searchPolicies(hotel.id, "anniversary celebration"));
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: "front_office",
        summary: `${capitalise(it.occasion)} during stay. Arrange complimentary in-room celebration touch (card + sparkling wine). Consider upgrade on arrival if availability allows.`,
        due: booking.checkIn,
        sensitive: false,
        rationale: "Standard celebration touch is hotel policy; upgrade is at the hotel's discretion on the day.",
      });
      paras.push(
        `Congratulations on your ${it.occasion}. I have let the team at ${hotel.name} know so they can mark the occasion for you in the room. I will not promise an upgrade in advance because that depends on what is free on the day, but the front office team will see the note and do what they can.`,
      );
      didNotPromise.push("Did not promise a room upgrade.");
    }
    if (it.transfer) {
      secondary.add("special_request");
      const pol = searchPolicies(hotel.id, "transfer airport");
      cite(pol);
      const flight = text.match(/\b([A-Z]{2}\d{3,4})\b/)?.[1];
      const lands = parseTime(text, /lands? (?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      urgency = it.repeat ? "high" : urgency;
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: "concierge",
        summary: `Airport transfer on arrival ${fmtShort(booking.checkIn)}${flight ? `, flight ${flight}` : ""}${lands ? ` landing ${lands}` : ""}. Book driver and SEND WRITTEN CONFIRMATION with driver details to guest.${it.repeat ? " Guest has asked more than once; reply today." : ""}`,
        due: it.repeat ? iso(now) : dueBefore(2),
        sensitive: false,
        rationale: "Transfers are only confirmed once the concierge has the flight number and has sent written confirmation.",
      });
      const price = pol.find((p) => /EUR \d+ per car/.test(p.text))?.text.match(/EUR \d+ per car[^.]*/)?.[0];
      paras.push(
        `${it.repeat ? "I am sorry you have had to ask more than once; that should not have happened. " : ""}On the transfer: I have logged it with the ${hotel.name} concierge${flight ? ` with your flight ${flight}` : ""}${lands ? ` landing at ${lands}` : ""}${price ? ` (${price})` : ""}. They will send you a written confirmation with the driver's name and meeting point${it.repeat ? " today" : " within 24 hours"}. Please treat it as booked only once you have that message from them; if it has not arrived by then, reply here and I will chase it personally.${flight ? "" : " Could you send me your flight number so they can track it?"}`,
      );
      didNotPromise.push("Did not confirm the transfer as booked; concierge confirms in writing.");
    }
    if (it.earlyCheckIn) {
      secondary.add("special_request");
      cite(searchPolicies(hotel.id, "early check-in"));
      const at = parseTime(text, /check[- ]?in (?:at|around|by) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ?? "early";
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: "front_office",
        summary: `Guest arriving around ${at} on ${fmtShort(booking.checkIn)}. Review departures the evening before and message guest with early check-in decision. Luggage storage and facilities available regardless.`,
        due: dueBefore(1),
        sensitive: false,
        rationale: "Early check-in is never guaranteed in advance; front office decides the evening before.",
      });
      const prev = pickQuotes(getAvailabilityAndRates({ hotelId: hotel.id, checkIn: addDays(booking.checkIn, -1), checkOut: booking.checkIn, adults: booking.adults, roomType: booking.roomType })).find((q) => q.ratePlan === "FLEX");
      paras.push(
        `Thank you for letting us know you land early. Our standard check-in at ${hotel.name} is ${hotel.checkIn}, and I cannot guarantee a room at ${at} because it depends on the previous night's departures. What I can promise is that the front office will check the evening before and message you with a definite answer, and that you can leave your luggage, freshen up and use the hotel from the moment you arrive.${
          prev ? ` If you want the room guaranteed from the morning, the only sure way is to book the previous night, which is ${eur(prev.nightlyRate)} on the flexible rate; just say and I will add it.` : ""
        }`,
      );
      if (prev) actions.push(quoteAction(prev, "Previous-night rate, the only way to guarantee early occupancy."));
      didNotPromise.push("Did not confirm early check-in (the exact failure that got the last bot switched off).");
    }
    if (it.spa) {
      secondary.add("special_request");
      cite(searchPolicies(hotel.id, "spa"));
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: hotel.departments.includes("spa") ? "spa" : "concierge",
        summary: `Guest wants spa on day two (${fmtShort(addDays(booking.checkIn, 1))}). Contact guest to pre-book treatments and times.`,
        due: dueBefore(3),
        sensitive: false,
        rationale: "Spa pre-books up to the day before arrival; the spa team owns the booking.",
      });
      paras.push(`For the spa on your second day, the spa team will be in touch to pre-book your treatments; if you already know what you would like and roughly what time, reply here and I will pass it on.`);
    }
    if (it.dining) {
      secondary.add("special_request");
      const dining = searchPolicies(hotel.id, "restaurant dining recommend");
      cite(dining);
      const rec = dining.find((p) => p.topic === "Nearby dining");
      paras.push(
        rec
          ? `For dinner nearby, the concierge's favourites are: ${rec.text.replace("The concierge recommends ", "").replace(" Reservations are made by the concierge.", "")} Tell me which evening and they will reserve a table for you.`
          : `For restaurant recommendations, the concierge team at ${hotel.name} will send you their current favourites and can book a table; tell me which evening you have in mind.`,
      );
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: "concierge",
        summary: "Guest asked for nearby restaurant recommendation; offer to book a table once they choose an evening.",
        due: dueBefore(2),
        sensitive: false,
        rationale: "Concierge owns dining reservations.",
      });
    }
    if (it.allergy || it.medical || it.accessibility) {
      secondary.add("special_request");
      if (it.allergy) sensitiveTypes.push("allergy");
      if (it.medical) sensitiveTypes.push("medical");
      if (it.accessibility) sensitiveTypes.push("accessibility");
      cite(searchPolicies(hotel.id, "allergy sensitive gdpr"));
      cite(searchPolicies(hotel.id, "dietary allergy"));
      urgency = "high";
      const what = it.allergy ? (text.match(/\b(severe |serious |mild )?(\w+) allerg\w*/i)?.[0] ?? "allergy") : it.accessibility ? "accessibility need" : "medical need";
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: it.allergy ? "fnb" : "front_office",
        summary: it.allergy
          ? `RESTRICTED: ${what} in party (child). Flag to executive chef; note on table card for every reservation during stay; brief breakfast team.`
          : `RESTRICTED: guest has stated a ${what}. Front office to confirm room and arrangements with guest before arrival.`,
        due: dueBefore(1),
        sensitive: true,
        rationale: "Special category data. Goes in a restricted trace, not the free-text notes, with only what the hotel needs to deliver safely.",
      });
      paras.push(
        it.allergy
          ? `Thank you for telling us about your daughter's ${what}. I have recorded it on a restricted note that only the hotel's kitchen and front office team can see, and the executive chef will be briefed before you arrive so every meal, including breakfast, is handled accordingly. It would help the team if you could confirm whether she carries an adrenaline pen and whether traces are a concern, so they can plan properly.`
          : `Thank you for letting us know. I have recorded it on a restricted note visible only to the team who need it at the hotel, and the front office will confirm the arrangements with you before you arrive.`,
      );
      didNotPromise.push("Did not guarantee an allergen-free kitchen; promised a briefed chef and table-card flag.");
    }
    if (it.vip) {
      secondary.add("special_request");
      cite(searchPolicies(hotel.id, "travel advisor programme amenity upgrade"));
      const code = booking.notes.match(/[A-Z]{3}-\d{4}/)?.[0];
      actions.push({
        type: "create_trace",
        hotelId: hotel.id,
        bookingId: booking.id,
        department: "front_office",
        summary: `Luxury programme booking${code ? ` (${code})` : ""}${guest?.vip ? ", returning VIP guest" : ""}. Apply standard amenity set: breakfast, hotel credit, early check-in and late check-out subject to availability. Upgrade on arrival if availability allows. Preferences: ${guest?.preferences.join(", ") || "none on file"}.`,
        due: dueBefore(1),
        sensitive: false,
        rationale: "Programme amenities are standard; the upgrade is subject to availability and is never guaranteed in writing.",
      });
      actions.push({
        type: "handoff",
        to: "reservations_agent",
        reason: "Advisor confirmations are issued by reservations staff after checking the programme code on the booking.",
        urgency: "this_week",
        context: `${booking.id}${code ? `, programme code ${code} on file` : ", no programme code on file: verify"}. Guest profile: ${guest?.stays ?? 0} previous stays.`,
      });
      paras.push(
        `Thank you for the note on ${guest?.name ?? "your client"}'s stay at ${hotel.name}, ${fmtShort(booking.checkIn)} to ${fmtShort(booking.checkOut)} (${booking.id}). I can confirm the booking is recognised under the programme${code ? ` (code ${code})` : ""} and carries the full amenity set: daily breakfast, the hotel credit, and early check-in and late check-out subject to availability. On the upgrade, I will be honest rather than make a promise the hotel cannot keep: it is confirmed on arrival subject to availability, and the hotel has ${guest?.vip ? "flagged the file as a returning VIP and " : ""}noted the request. A colleague will send you the formal written confirmation today.`,
      );
      didNotPromise.push("Did not guarantee the upgrade in writing.");
    }
  } else if (hotel && (it.cot || it.occasion || it.transfer || it.earlyCheckIn || it.spa || it.allergy || it.vip)) {
    paras.push("So that I can arrange the details you mention with the hotel team, could you send me your booking reference (AUR-xxxxx)? I will log everything with the right department as soon as I have it.");
    confidence = Math.min(confidence, 0.6);
  }

  // 7. Pre-arrival FAQ answered from policy.
  if (hotel && (it.parking || it.pets || it.faqOther)) {
    secondary.add("pre_arrival_question");
    const bits: string[] = [];
    if (it.parking) {
      const p = searchPolicies(hotel.id, "parking");
      cite(p);
      const pp = p.find((x) => x.topic === "Parking");
      bits.push(pp ? `Parking: ${pp.text}` : `Parking: the ${hotel.name} team will confirm the parking options for you.`);
    }
    if (it.pets) {
      const p = searchPolicies(hotel.id, "pets dog");
      cite(p);
      const pp = p.find((x) => x.topic === "Pets");
      bits.push(pp ? `Pets: ${pp.text}` : `Pets: the ${hotel.name} team will confirm their pet policy for you.`);
    }
    if (it.faqOther) bits.push(`Check-in at ${hotel.name} is from ${hotel.checkIn} and check-out is by ${hotel.checkOut}.`);
    paras.push(`Thank you for your message. Here is what you need for ${hotel.name}:`, bits.map((b) => `• ${b}`).join("\n"), "If you let me know your booking reference I can add the parking and your dog to the reservation so the team are expecting you.");
  } else if (!hotel && (it.parking || it.pets || it.faqOther)) {
    paras.push("Happy to help. Which Aurel hotel are you staying at? Parking and pet arrangements differ by property and I want to give you the exact answer.");
    confidence = 0.6;
  }

  if (!paras.length) {
    paras.push("Thank you for your message. I want to make sure I help with the right thing: could you tell me a little more about what you need, and your booking reference if you have one?");
    confidence = 0.4;
    actions.push({ type: "handoff", to: "reservations_agent", reason: "Intent unclear to the copilot.", urgency: "today", context: text.slice(0, 300) });
  }

  return finish(category, urgency);

  function quoteAction(q: RateQuote, rationale: string): ProposedAction {
    return {
      type: "quote",
      hotelId: q.hotelId,
      roomType: q.roomType,
      roomName: q.roomName,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights: q.nights,
      ratePlan: q.ratePlanName,
      nightlyRate: q.nightlyRate,
      total: q.total,
      currency: "EUR",
      refundable: q.refundable,
      available: q.available,
      rationale,
    };
  }

  function finish(cat: Category, urg: "low" | "normal" | "high"): AgentProposal {
    secondary.delete(cat);
    const handoff = actions.find((a) => a.type === "handoff");
    const sensitive = sensitiveTypes.length > 0;
    const onlyFaq = cat === "pre_arrival_question" && !sensitive && !handoff && actions.length === 0;
    const body = [greeting(msg, guest?.name), ...paras, signoff(msg, hotel)].join("\n\n");
    const proposal: AgentProposal = {
      triage: {
        category: cat,
        secondaryCategories: [...secondary],
        hotelId: hotel?.id ?? null,
        urgency: urg,
        language: "en",
        summary: summarise(cat, it, hotel, booking),
      },
      bookingMatch: { bookingId: booking?.id ?? null, confidence: bm.confidence, note: bm.note },
      sensitiveData: {
        present: sensitive,
        types: [...new Set(sensitiveTypes)],
        handling: sensitive
          ? sensitiveTypes.includes("payment_card")
            ? "Card number and CVV redacted before storage. Not written to the PMS or any note. Payment link issued instead."
            : "Stored only in a restricted trace with the minimum needed to deliver safely. Not copied into free-text notes or email forwards. Guest told who will see it."
          : "No special category data detected.",
      },
      actions,
      draftReply: body,
      didNotPromise,
      policyCitations: [...citations],
      confidence: Math.round(confidence * 100) / 100,
      autoSendEligible: onlyFaq && confidence >= 0.8,
      requiresHuman: true,
      requiresHumanReason: handoffReason || (handoff ? handoff.reason : "v1 rule: every outbound message is approved by a reservations agent before it is sent."),
    };
    return AgentProposal.parse(proposal);
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summarise(cat: Category, it: Intents, hotel?: Hotel, booking?: Booking): string {
  const bits: string[] = [];
  if (it.card) return "Guest sent card details in the message. Redact and send payment link.";
  if (cat === "group_event") bits.push("Group or event enquiry; route to sales");
  if (cat === "cancellation_refund") bits.push(it.compassionate ? "Compassionate cancellation on a non-refundable booking" : "Cancellation request");
  if (cat === "modify_booking") bits.push("Date change on an existing booking");
  if (cat === "new_booking_enquiry") bits.push(it.priceMatch ? "Rate enquiry with a price-match ask" : "Availability and rate enquiry");
  if (cat === "pre_arrival_question") bits.push("Pre-arrival question answerable from policy");
  const extras = [
    it.cot && "cot",
    it.occasion && it.occasion,
    it.transfer && "airport transfer",
    it.earlyCheckIn && "early check-in",
    it.spa && "spa",
    it.dining && "dining recommendation",
    it.allergy && "allergy (sensitive)",
    it.vip && "programme amenities",
    it.parking && "parking",
    it.pets && "pet",
  ].filter(Boolean) as string[];
  if (extras.length) bits.push(`requests: ${extras.join(", ")}`);
  const where = hotel ? ` at ${hotel.name}` : "";
  const ref = booking ? ` (${booking.id})` : "";
  return `${bits.join("; ") || "Unclear request"}${where}${ref}.`;
}
