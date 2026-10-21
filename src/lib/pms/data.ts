// Mock PMS seed data for Aurel Hotels. Fictional, internally consistent.
// Nine hotels: 4 city, 5 resort, across Portugal, Spain, Italy, Greece. All EUR.

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

// A representative slice of the 140+ policies per hotel. Group-wide first, then hotel-specific.
export const POLICIES: Policy[] = [
  {
    id: "P-ALL-CXL-FLEX",
    hotelId: "all",
    topic: "Cancellation - Flexible rate",
    text: "Flexible bookings can be cancelled free of charge until 48 hours before arrival at city hotels and 72 hours before arrival at resorts during peak months. Later cancellations are charged the first night.",
    tags: ["cancellation", "refund", "flexible"],
  },
  {
    id: "P-ALL-CXL-ADV",
    hotelId: "all",
    topic: "Cancellation - Advance Purchase",
    text: "Advance Purchase bookings are prepaid and non-refundable. Exceptions (bereavement, hospitalisation, travel bans) may be granted as a goodwill credit for a future stay only by a reservations manager, never by an agent.",
    tags: ["cancellation", "refund", "non-refundable", "exception", "compassionate"],
  },
  {
    id: "P-ALL-MOD",
    hotelId: "all",
    topic: "Modifications",
    text: "Flexible and Stay Longer bookings may be modified at the live rate for the new dates. Advance Purchase bookings cannot be modified; a reservations manager may rebook as an exception. Rate differences are always charged or refunded at published rates.",
    tags: ["modify", "change dates", "dates"],
  },
  {
    id: "P-ALL-PARITY",
    hotelId: "all",
    topic: "Rate parity and price matching",
    text: "Published rates on aurelhotels.com match OTA rates. Agents may not discount, match or undercut a quoted OTA price. Direct bookers receive the Aurel Direct benefits: flexible check-out when available, welcome drink, and no booking fee. Non-public and negotiated rates require a reservations manager.",
    tags: ["rate", "price match", "parity", "discount", "ota", "booking.com"],
  },
  {
    id: "P-ALL-PAYMENT",
    hotelId: "all",
    topic: "Payment details",
    text: "Card details must never be requested or accepted by email, WhatsApp or OTA messaging. Send the guest a secure payment link generated by the payment gateway.",
    tags: ["payment", "card", "credit card", "security"],
  },
  {
    id: "P-ALL-SENSITIVE",
    hotelId: "all",
    topic: "Allergy, medical and accessibility information",
    text: "Allergy, medical and accessibility details are special category data under GDPR. Record only what the hotel needs to deliver safely, in the dedicated trace with the restricted flag, never in free-text notes or email forwards. Confirm with the guest that we hold the information and who will see it.",
    tags: ["allergy", "medical", "accessibility", "gdpr", "sensitive", "dietary"],
  },
  {
    id: "P-ALL-GROUPS",
    hotelId: "all",
    topic: "Groups and events",
    text: "Requests for 8 or more rooms, any event space, weddings or meetings are handled by the Group Sales team, who respond within one working day.",
    tags: ["group", "event", "wedding", "meeting", "conference"],
  },
  {
    id: "P-ALL-EARLY",
    hotelId: "all",
    topic: "Early check-in",
    text: "Early check-in is never guaranteed in advance. Front office confirms the evening before arrival based on departures. Guaranteed early arrival requires booking the previous night. Luggage storage and use of facilities are always available from arrival.",
    tags: ["early check-in", "check-in", "arrival", "early"],
  },
  {
    id: "P-ALL-OCCASION",
    hotelId: "all",
    topic: "Celebrations and occasions",
    text: "For anniversaries, birthdays and honeymoons the hotel provides a complimentary in-room celebration touch (card, sparkling wine or cake) arranged by the hotel team. Room upgrades are at the hotel's discretion on the day and must not be promised in advance.",
    tags: ["anniversary", "birthday", "honeymoon", "celebration", "upgrade", "occasion"],
  },
  {
    id: "P-ALL-COT",
    hotelId: "all",
    topic: "Cots and extra beds",
    text: "Cots are complimentary for children under 2 and subject to room compatibility. Extra beds are available in rooms marked for 3 or more guests and are charged per night at the published supplement.",
    tags: ["cot", "crib", "baby", "extra bed", "children"],
  },
  {
    id: "P-ALL-VIP",
    hotelId: "all",
    topic: "Travel advisor and luxury programme bookings",
    text: "Bookings through recognised luxury programmes include a standard amenity set (breakfast, hotel credit, early check-in and late check-out subject to availability, upgrade on arrival subject to availability). Confirmations to advisors are issued by reservations staff after checking the programme code on the booking.",
    tags: ["vip", "travel advisor", "programme", "amenity", "upgrade", "virtuoso"],
  },
  {
    id: "P-ALL-TRANSFER",
    hotelId: "all",
    topic: "Airport transfers",
    text: "Private transfers are arranged by the concierge and charged at the published rate per vehicle. A transfer is only confirmed once the concierge has the flight number and has sent written confirmation with the driver details.",
    tags: ["transfer", "airport", "pick up", "driver", "car"],
  },
  {
    id: "P-LIS-PARK",
    hotelId: "LIS",
    topic: "Parking",
    text: "Valet parking is available at EUR 35 per night. Electric charging on request.",
    tags: ["parking", "car", "valet"],
  },
  {
    id: "P-LIS-PETS",
    hotelId: "LIS",
    topic: "Pets",
    text: "Dogs up to 12 kg are welcome in Deluxe and River View rooms at EUR 40 per night, maximum one per room.",
    tags: ["pets", "dog"],
  },
  {
    id: "P-ROM-PETS",
    hotelId: "ROM",
    topic: "Pets",
    text: "Pets are not accepted except certified assistance animals.",
    tags: ["pets", "dog"],
  },
  {
    id: "P-ROM-PARK",
    hotelId: "ROM",
    topic: "Parking",
    text: "No on-site parking. Partner garage 300 m away at EUR 45 per day; the concierge can reserve a space.",
    tags: ["parking", "car", "garage"],
  },
  {
    id: "P-MLL-DIET",
    hotelId: "MLL",
    topic: "Dietary requirements",
    text: "The kitchen can accommodate nut, gluten and dairy allergies with 24 hours' notice. Severe allergies are flagged to the executive chef and noted on the table card for every reservation during the stay.",
    tags: ["allergy", "dietary", "nut", "gluten", "restaurant"],
  },
  {
    id: "P-MLL-SPA",
    hotelId: "MLL",
    topic: "Spa bookings",
    text: "Spa treatments can be pre-booked by the concierge up to the day before arrival. Guests under 16 are not admitted to the thermal area.",
    tags: ["spa", "treatment", "wellness"],
  },
  {
    id: "P-MLL-DINING",
    hotelId: "MLL",
    topic: "Nearby dining",
    text: "The concierge recommends Es Racó d'es Teix (Michelin, 5 min walk), Ca's Patró March (seafood at the cala, 15 min walk) and Sebastian (modern Mediterranean, in the village). Reservations are made by the concierge.",
    tags: ["restaurant", "dining", "recommend"],
  },
  {
    id: "P-SAN-VIEW",
    hotelId: "SAN",
    topic: "Sea view guarantee",
    text: "Sea View Rooms and Plunge Pool Suites face the caldera. Cave Rooms face the courtyard. View category is guaranteed; the specific room is allocated on the day.",
    tags: ["sea view", "view", "room allocation"],
  },
  {
    id: "P-SAN-CHILD",
    hotelId: "SAN",
    topic: "Children",
    text: "Due to the cliffside terraces, Aurel Santorini welcomes children aged 12 and over only. Cots are not available.",
    tags: ["children", "cot", "age"],
  },
  {
    id: "P-AMF-TRANSFER",
    hotelId: "AMF",
    topic: "Airport transfers",
    text: "Private transfer from Naples airport is EUR 220 per car (up to 3 guests), 90 minutes. Confirmed by the concierge once the flight number is received.",
    tags: ["transfer", "airport", "naples"],
  },
  {
    id: "P-ATH-PARK",
    hotelId: "ATH",
    topic: "Parking",
    text: "Underground parking at EUR 28 per night, no reservation needed.",
    tags: ["parking", "car"],
  },
  {
    id: "P-COM-TRANSFER",
    hotelId: "COM",
    topic: "Airport transfers",
    text: "Private transfer from Lisbon airport is EUR 180 per car, 75 minutes. Confirmed by the concierge once the flight number is received.",
    tags: ["transfer", "airport", "lisbon"],
  },
];

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
