// Mock PMS seed data for Aurel Hotels. Fictional, internally consistent.
// Nine hotels: 4 city, 5 resort, across Portugal, Spain, Italy, Greece. All EUR.

import kb from "@/lib/policies/kb.json";

export type HotelKind = "city" | "resort";

export interface RoomType {
  code: string;
  name: string;
  baseRate: number; // EUR, flexible rate in shoulder season
  maxGuests: number;
  cotCompatible: boolean;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  country: string;
  kind: HotelKind;
  timezone: string;
  checkIn: string; // "15:00"
  checkOut: string; // "12:00"
  roomTypes: RoomType[];
  seasonality: { peakMonths: number[]; peakMultiplier: number };
  departments: Department[];
}

export type Department =
  | "front_office"
  | "housekeeping"
  | "fnb"
  | "concierge"
  | "reservations"
  | "sales"
  | "spa";

export interface Policy {
  id: string;
  hotelId: string | "all";
  topic: string;
  text: string;
  tags: string[];
  source?: string; // handbook file and section, e.g. docs/policies/aurel-lisboa.md#pets
}

export type RatePlanCode = "FLEX" | "ADV" | "LONGSTAY";

export interface RatePlan {
  code: RatePlanCode;
  name: string;
  multiplier: number;
  refundable: boolean;
  minNights: number;
  description: string;
}

export interface Booking {
  id: string;
  hotelId: string;
  guestId: string;
  surname: string;
  checkIn: string; // ISO date
  checkOut: string;
  roomType: string;
  adults: number;
  children: number;
  ratePlan: RatePlanCode;
  nightlyRate: number;
  channel: "direct" | "ota" | "travel_advisor";
  notes: string;
  status: "confirmed" | "cancelled" | "modified";
}

export interface GuestProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  vip: boolean;
  stays: number;
  preferences: string[];
  programme?: string;
}

export interface Trace {
  id: string;
  hotelId: string;
  bookingId: string | null;
  department: Department;
  summary: string;
  due: string; // ISO date
  status: "open" | "acknowledged" | "done";
  sensitive: boolean;
  createdAt: string;
  source: string;
}

const stdDepts: Department[] = [
  "front_office",
  "housekeeping",
  "fnb",
  "concierge",
  "reservations",
  "sales",
];

export const HOTELS: Hotel[] = [
  {
    id: "LIS",
    name: "Aurel Lisboa",
    city: "Lisbon",
    country: "Portugal",
    kind: "city",
    timezone: "Europe/Lisbon",
    checkIn: "15:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "DLX", name: "Deluxe Room", baseRate: 290, maxGuests: 2, cotCompatible: true },
      { code: "RIV", name: "River View Room", baseRate: 360, maxGuests: 3, cotCompatible: true },
      { code: "STE", name: "Tagus Suite", baseRate: 620, maxGuests: 3, cotCompatible: true },
    ],
    seasonality: { peakMonths: [5, 6, 7, 8, 9], peakMultiplier: 1.25 },
    departments: stdDepts,
  },
  {
    id: "MAD",
    name: "Aurel Madrid",
    city: "Madrid",
    country: "Spain",
    kind: "city",
    timezone: "Europe/Madrid",
    checkIn: "15:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "DLX", name: "Deluxe Room", baseRate: 310, maxGuests: 2, cotCompatible: true },
      { code: "PRM", name: "Premier Room", baseRate: 390, maxGuests: 3, cotCompatible: true },
      { code: "STE", name: "Retiro Suite", baseRate: 680, maxGuests: 3, cotCompatible: true },
    ],
    seasonality: { peakMonths: [4, 5, 9, 10], peakMultiplier: 1.2 },
    departments: stdDepts,
  },
  {
    id: "ROM",
    name: "Aurel Roma",
    city: "Rome",
    country: "Italy",
    kind: "city",
    timezone: "Europe/Rome",
    checkIn: "15:00",
    checkOut: "11:00",
    roomTypes: [
      { code: "CLS", name: "Classic Room", baseRate: 340, maxGuests: 2, cotCompatible: false },
      { code: "DLX", name: "Deluxe Room", baseRate: 420, maxGuests: 3, cotCompatible: true },
      { code: "STE", name: "Terrace Suite", baseRate: 790, maxGuests: 3, cotCompatible: true },
    ],
    seasonality: { peakMonths: [4, 5, 6, 9, 10], peakMultiplier: 1.3 },
    departments: stdDepts,
  },
  {
    id: "ATH",
    name: "Aurel Athens",
    city: "Athens",
    country: "Greece",
    kind: "city",
    timezone: "Europe/Athens",
    checkIn: "15:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "DLX", name: "Deluxe Room", baseRate: 260, maxGuests: 2, cotCompatible: true },
      { code: "ACR", name: "Acropolis View Room", baseRate: 330, maxGuests: 3, cotCompatible: true },
      { code: "STE", name: "Acropolis Suite", baseRate: 560, maxGuests: 3, cotCompatible: true },
    ],
    seasonality: { peakMonths: [5, 6, 9, 10], peakMultiplier: 1.2 },
    departments: stdDepts,
  },
  {
    id: "COM",
    name: "Aurel Comporta",
    city: "Comporta",
    country: "Portugal",
    kind: "resort",
    timezone: "Europe/Lisbon",
    checkIn: "16:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "GDN", name: "Garden Room", baseRate: 380, maxGuests: 2, cotCompatible: true },
      { code: "DUN", name: "Dune Villa", baseRate: 720, maxGuests: 4, cotCompatible: true },
      { code: "OCN", name: "Ocean Villa", baseRate: 1150, maxGuests: 4, cotCompatible: true },
    ],
    seasonality: { peakMonths: [6, 7, 8], peakMultiplier: 1.5 },
    departments: [...stdDepts, "spa"],
  },
  {
    id: "MLL",
    name: "Aurel Mallorca",
    city: "Deià, Mallorca",
    country: "Spain",
    kind: "resort",
    timezone: "Europe/Madrid",
    checkIn: "15:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "GDN", name: "Garden Room", baseRate: 350, maxGuests: 2, cotCompatible: true },
      { code: "SEA", name: "Sea View Room", baseRate: 450, maxGuests: 3, cotCompatible: true },
      { code: "FAM", name: "Family Suite", baseRate: 690, maxGuests: 4, cotCompatible: true },
      { code: "VIL", name: "Cliff Villa", baseRate: 1300, maxGuests: 4, cotCompatible: true },
    ],
    seasonality: { peakMonths: [6, 7, 8, 9], peakMultiplier: 1.45 },
    departments: [...stdDepts, "spa"],
  },
  {
    id: "AMF",
    name: "Aurel Amalfi",
    city: "Positano",
    country: "Italy",
    kind: "resort",
    timezone: "Europe/Rome",
    checkIn: "15:00",
    checkOut: "11:00",
    roomTypes: [
      { code: "CLS", name: "Classic Room", baseRate: 480, maxGuests: 2, cotCompatible: false },
      { code: "SEA", name: "Sea View Room", baseRate: 640, maxGuests: 2, cotCompatible: true },
      { code: "STE", name: "Panorama Suite", baseRate: 1180, maxGuests: 3, cotCompatible: true },
    ],
    seasonality: { peakMonths: [5, 6, 7, 8, 9], peakMultiplier: 1.4 },
    departments: [...stdDepts, "spa"],
  },
  {
    id: "SAN",
    name: "Aurel Santorini",
    city: "Oia, Santorini",
    country: "Greece",
    kind: "resort",
    timezone: "Europe/Athens",
    checkIn: "15:00",
    checkOut: "11:00",
    roomTypes: [
      { code: "CAV", name: "Cave Room", baseRate: 390, maxGuests: 2, cotCompatible: false },
      { code: "SEA", name: "Sea View Room", baseRate: 370, maxGuests: 2, cotCompatible: false },
      { code: "PLS", name: "Plunge Pool Suite", baseRate: 880, maxGuests: 3, cotCompatible: false },
    ],
    seasonality: { peakMonths: [7, 8, 9], peakMultiplier: 1.45 },
    departments: [...stdDepts, "spa"],
  },
  {
    id: "ALG",
    name: "Aurel Algarve",
    city: "Lagos, Algarve",
    country: "Portugal",
    kind: "resort",
    timezone: "Europe/Lisbon",
    checkIn: "15:00",
    checkOut: "12:00",
    roomTypes: [
      { code: "GDN", name: "Garden Room", baseRate: 280, maxGuests: 2, cotCompatible: true },
      { code: "SEA", name: "Sea View Room", baseRate: 360, maxGuests: 3, cotCompatible: true },
      { code: "FAM", name: "Family Suite", baseRate: 560, maxGuests: 4, cotCompatible: true },
    ],
    seasonality: { peakMonths: [6, 7, 8], peakMultiplier: 1.4 },
    departments: [...stdDepts, "spa"],
  },
];

export const RATE_PLANS: RatePlan[] = [
  {
    code: "FLEX",
    name: "Flexible",
    multiplier: 1,
    refundable: true,
    minNights: 1,
    description: "Free cancellation until 48 hours before arrival (72 hours at resorts in peak season).",
  },
  {
    code: "ADV",
    name: "Advance Purchase",
    multiplier: 0.85,
    refundable: false,
    minNights: 1,
    description: "15% below Flexible. Prepaid, non-refundable, non-changeable.",
  },
  {
    code: "LONGSTAY",
    name: "Stay Longer",
    multiplier: 0.9,
    refundable: true,
    minNights: 4,
    description: "10% below Flexible for stays of 4 nights or more. Same cancellation terms as Flexible.",
  },
];

// Policies come from the hotel handbooks in docs/policies, chunked by section and
// embedded at build time by scripts/build-kb.ts into src/lib/policies/kb.json.
export const POLICIES: Policy[] = (kb.chunks as { id: string; hotelId: string; topic: string; text: string; tags: string[]; source: string }[]).map(({ id, hotelId, topic, text, tags, source }) => ({
  id,
  hotelId,
  topic,
  text,
  tags,
  source,
}));

export const GUESTS: GuestProfile[] = [
  {
    id: "G-1001",
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    vip: false,
    stays: 1,
    preferences: ["High floor"],
  },
  {
    id: "G-1002",
    name: "Daniel Okafor",
    email: "d.okafor@example.com",
    vip: false,
    stays: 0,
    preferences: [],
  },
  {
    id: "G-1003",
    name: "Elena Rossi",
    email: "elena.rossi@example.com",
    phone: "+39 333 000 0000",
    vip: false,
    stays: 2,
    preferences: ["Quiet room"],
  },
  {
    id: "G-1004",
    name: "Margaret Whitfield",
    email: "via advisor",
    vip: true,
    stays: 6,
    preferences: ["Feather-free pillows", "Sparkling water"],
    programme: "Aurel Luxury Partners",
  },
  {
    id: "G-1005",
    name: "Tomás Herrera",
    phone: "+34 600 000 000",
    vip: false,
    stays: 0,
    preferences: [],
  },
  {
    id: "G-1006",
    name: "Hannah Kim",
    email: "hkim@example.com",
    vip: false,
    stays: 1,
    preferences: [],
  },
];

export const BOOKINGS: Booking[] = [
  {
    id: "AUR-48213",
    hotelId: "LIS",
    guestId: "G-1001",
    surname: "Sharma",
    checkIn: "2027-05-14",
    checkOut: "2027-05-17",
    roomType: "RIV",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 450,
    channel: "direct",
    notes: "",
    status: "confirmed",
  },
  {
    id: "AUR-48377",
    hotelId: "MLL",
    guestId: "G-1002",
    surname: "Okafor",
    checkIn: "2027-07-10",
    checkOut: "2027-07-15",
    roomType: "FAM",
    adults: 2,
    children: 1,
    ratePlan: "LONGSTAY",
    nightlyRate: 900,
    channel: "direct",
    notes: "",
    status: "confirmed",
  },
  {
    id: "AUR-48402",
    hotelId: "ROM",
    guestId: "G-1003",
    surname: "Rossi",
    checkIn: "2027-04-22",
    checkOut: "2027-04-25",
    roomType: "DLX",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 546,
    channel: "ota",
    notes: "",
    status: "confirmed",
  },
  {
    id: "AUR-48155",
    hotelId: "AMF",
    guestId: "G-1004",
    surname: "Whitfield",
    checkIn: "2027-06-02",
    checkOut: "2027-06-07",
    roomType: "SEA",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 896,
    channel: "travel_advisor",
    notes: "Programme code ALP-2291",
    status: "confirmed",
  },
  {
    id: "AUR-48290",
    hotelId: "MAD",
    guestId: "G-1005",
    surname: "Herrera",
    checkIn: "2027-04-30",
    checkOut: "2027-05-03",
    roomType: "PRM",
    adults: 2,
    children: 0,
    ratePlan: "ADV",
    nightlyRate: 398,
    channel: "direct",
    notes: "",
    status: "confirmed",
  },
  {
    id: "AUR-48455",
    hotelId: "COM",
    guestId: "G-1006",
    surname: "Kim",
    checkIn: "2027-05-21",
    checkOut: "2027-05-24",
    roomType: "DUN",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 720,
    channel: "direct",
    notes: "",
    status: "confirmed",
  },
];


// Two bookings that always arrive tomorrow, so the day-before check has
// something to act on whenever the prototype is opened.
function isoDaysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
GUESTS.push(
  { id: "G-1007", name: "Lena Fischer", email: "lena.fischer@example.com", vip: false, stays: 0, preferences: [] },
  { id: "G-1008", name: "Omar Haddad", email: "omar.h@example.com", vip: true, stays: 4, preferences: ["Corner room", "Oat milk"], programme: "Aurel Luxury Partners" },
);
BOOKINGS.push(
  {
    id: "AUR-48610",
    hotelId: "LIS",
    guestId: "G-1007",
    surname: "Fischer",
    checkIn: isoDaysFromNow(1),
    checkOut: isoDaysFromNow(3),
    roomType: "DLX",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 290,
    channel: "direct",
    notes: "",
    status: "confirmed",
  },
  {
    id: "AUR-48611",
    hotelId: "MLL",
    guestId: "G-1008",
    surname: "Haddad",
    checkIn: isoDaysFromNow(1),
    checkOut: isoDaysFromNow(5),
    roomType: "SEA",
    adults: 2,
    children: 0,
    ratePlan: "FLEX",
    nightlyRate: 450,
    channel: "travel_advisor",
    notes: "Programme code ALP-3012. Guest asked for a late check-out and a sea-facing table at dinner.",
    status: "confirmed",
  },
);
