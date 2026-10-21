// Mock PMS API. Mirrors the constraints in the brief:
// - can read availability, live rates, bookings, guest profiles
// - can create/modify bookings at published rates only
// - cannot discount or override policy
// - supports "traces" (tasks to a hotel department with a due date)
// Pure functions over seed data; writes return new objects and never mutate the seed.

import {
  BOOKINGS,
  GUESTS,
  HOTELS,
  POLICIES,
  RATE_PLANS,
  type Booking,
  type Department,
  type GuestProfile,
  type Hotel,
  type Policy,
  type RatePlanCode,
  type Trace,
} from "./data";

export * from "./data";

export function getHotel(id: string): Hotel | undefined {
  return HOTELS.find((h) => h.id === id);
}

export function findHotelByText(text: string): Hotel | undefined {
  const t = text.toLowerCase();
  return HOTELS.find(
    (h) =>
      t.includes(h.city.split(",")[0].toLowerCase()) ||
      t.includes(h.name.toLowerCase()) ||
      t.includes(h.name.replace("Aurel ", "").toLowerCase()),
  );
}

export function getBooking(id: string): Booking | undefined {
  return BOOKINGS.find((b) => b.id.toLowerCase() === id.toLowerCase());
}

export function findBookings(q: {
  surname?: string;
  hotelId?: string;
  month?: number; // 1-12
}): Booking[] {
  return BOOKINGS.filter((b) => {
    if (q.surname && b.surname.toLowerCase() !== q.surname.toLowerCase()) return false;
    if (q.hotelId && b.hotelId !== q.hotelId) return false;
    if (q.month && new Date(b.checkIn).getUTCMonth() + 1 !== q.month) return false;
    return true;
  });
}

export function getGuest(id: string): GuestProfile | undefined {
  return GUESTS.find((g) => g.id === id);
}

export function searchPolicies(hotelId: string | null, query: string): Policy[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2);
  const matchWord = (hayWords: string[], w: string) =>
    hayWords.some((h) => (w.length >= 5 ? h.startsWith(w) || w.startsWith(h) && h.length >= 5 : h === w));
  const scored = POLICIES.filter((p) => p.hotelId === "all" || !hotelId || p.hotelId === hotelId)
    .map((p) => {
      const tagWords = p.tags.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/));
      const topicWords = p.topic.toLowerCase().split(/[^a-z0-9]+/);
      const textWords = p.text.toLowerCase().split(/[^a-z0-9]+/);
      let score = 0;
      for (const w of words) {
        if (matchWord(tagWords, w)) score += 3;
        else if (matchWord(topicWords, w)) score += 2;
        else if (matchWord(textWords, w)) score += 1;
      }
      if (p.hotelId === hotelId) score += 0.5;
      return { p, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  // Prefer hotel-specific over group-wide when both cover the same topic.
  const seen = new Set<string>();
  const out: Policy[] = [];
  for (const { p, score } of scored) {
    if (score < top * 0.6) break;
    const key = p.topic.toLowerCase();
    if (seen.has(key) && p.hotelId === "all") continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 4);
}

// Deterministic pseudo-availability so the demo is stable across reloads.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export interface RateQuote {
  hotelId: string;
  roomType: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  available: boolean;
  roomsLeft: number;
  ratePlan: RatePlanCode;
  ratePlanName: string;
  refundable: boolean;
  nightlyRate: number; // average across nights, EUR
  total: number;
  currency: "EUR";
  cancellationTerms: string;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn);
  const b = Date.parse(checkOut);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function getAvailabilityAndRates(q: {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  roomType?: string;
}): RateQuote[] {
  const hotel = getHotel(q.hotelId);
  if (!hotel) return [];
  const nights = nightsBetween(q.checkIn, q.checkOut);
  if (nights <= 0) return [];
  const rooms = hotel.roomTypes.filter(
    (r) => (!q.roomType || r.code === q.roomType) && r.maxGuests >= q.adults,
  );
  const out: RateQuote[] = [];
  for (const room of rooms) {
    let total = 0;
    let minLeft = 9;
    for (let i = 0; i < nights; i++) {
      const d = new Date(Date.parse(q.checkIn) + i * 86400000);
      const month = d.getUTCMonth() + 1;
      const dow = d.getUTCDay();
      const peak = hotel.seasonality.peakMonths.includes(month) ? hotel.seasonality.peakMultiplier : 1;
      const weekend = dow === 5 || dow === 6 ? 1.1 : 1;
      const noise = 0.95 + hash(`${hotel.id}${room.code}${d.toISOString().slice(0, 10)}`) * 0.1;
      total += Math.round((room.baseRate * peak * weekend * noise) / 5) * 5;
      const r = hash(`inventory:${hotel.id}:${room.code}:${d.toISOString().slice(0, 10)}`);
      const left = r < 0.05 ? 0 : 1 + Math.floor(r * 5);
      minLeft = Math.min(minLeft, left);
    }
    for (const plan of RATE_PLANS) {
      if (nights < plan.minNights) continue;
      const planTotal = Math.round(total * plan.multiplier);
      out.push({
        hotelId: hotel.id,
        roomType: room.code,
        roomName: room.name,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        nights,
        available: minLeft > 0,
        roomsLeft: minLeft,
        ratePlan: plan.code,
        ratePlanName: plan.name,
        refundable: plan.refundable,
        nightlyRate: Math.round(planTotal / nights),
        total: planTotal,
        currency: "EUR",
        cancellationTerms: plan.description,
      });
    }
  }
  return out;
}

export interface ModificationCheck {
  allowed: boolean;
  reason: string;
  newNightlyRate?: number;
  rateDifferenceTotal?: number;
  requiresManager: boolean;
}

export function checkModification(
  booking: Booking,
  changes: { checkIn?: string; checkOut?: string; roomType?: string; adults?: number },
): ModificationCheck {
  if (booking.ratePlan === "ADV") {
    return {
      allowed: false,
      requiresManager: true,
      reason: "Advance Purchase bookings cannot be modified at published rates. A reservations manager may rebook as an exception.",
    };
  }
  const checkIn = changes.checkIn ?? booking.checkIn;
  const checkOut = changes.checkOut ?? booking.checkOut;
  const roomType = changes.roomType ?? booking.roomType;
  const adults = changes.adults ?? booking.adults;
  const quotes = getAvailabilityAndRates({ hotelId: booking.hotelId, checkIn, checkOut, adults, roomType }).filter(
    (r) => r.ratePlan === booking.ratePlan,
  );
  const q = quotes[0];
  if (!q || !q.available) {
    return {
      allowed: false,
      requiresManager: false,
      reason: "The requested room is not available for the new dates at the published rate.",
    };
  }
  const oldTotal = booking.nightlyRate * nightsBetween(booking.checkIn, booking.checkOut);
  return {
    allowed: true,
    requiresManager: false,
    reason: "Within policy: same rate plan, live rate applied for the new dates.",
    newNightlyRate: q.nightlyRate,
    rateDifferenceTotal: q.total - oldTotal,
  };
}

export function applyModification(
  booking: Booking,
  changes: { checkIn?: string; checkOut?: string; roomType?: string; adults?: number },
): Booking {
  const check = checkModification(booking, changes);
  if (!check.allowed) throw new Error(check.reason);
  return {
    ...booking,
    checkIn: changes.checkIn ?? booking.checkIn,
    checkOut: changes.checkOut ?? booking.checkOut,
    roomType: changes.roomType ?? booking.roomType,
    adults: changes.adults ?? booking.adults,
    nightlyRate: check.newNightlyRate ?? booking.nightlyRate,
    status: "modified",
  };
}

export function cancellationCheck(booking: Booking, asOf: string): { withinPolicy: boolean; reason: string } {
  const plan = RATE_PLANS.find((p) => p.code === booking.ratePlan)!;
  if (!plan.refundable) {
    return { withinPolicy: false, reason: "Non-refundable rate. Any goodwill credit needs a reservations manager." };
  }
  const hotel = getHotel(booking.hotelId)!;
  const month = new Date(booking.checkIn).getUTCMonth() + 1;
  const windowHours = hotel.kind === "resort" && hotel.seasonality.peakMonths.includes(month) ? 72 : 48;
  const hoursLeft = (Date.parse(booking.checkIn) - Date.parse(asOf)) / 3600000;
  if (hoursLeft >= windowHours) return { withinPolicy: true, reason: `Free cancellation window (${windowHours}h) still open.` };
  return { withinPolicy: false, reason: `Inside the ${windowHours}h window: first night is chargeable unless a manager waives it.` };
}

let traceSeq = 100;
export function createTrace(input: {
  hotelId: string;
  bookingId: string | null;
  department: Department;
  summary: string;
  due: string;
  sensitive: boolean;
  source: string;
}): Trace {
  traceSeq += 1;
  return {
    id: `TR-${Date.now().toString(36).toUpperCase().slice(-4)}${traceSeq}`,
    status: "open",
    createdAt: new Date().toISOString(),
    ...input,
  };
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  front_office: "Front Office",
  housekeeping: "Housekeeping",
  fnb: "Food & Beverage",
  concierge: "Concierge",
  reservations: "Reservations",
  sales: "Group Sales",
  spa: "Spa",
};
