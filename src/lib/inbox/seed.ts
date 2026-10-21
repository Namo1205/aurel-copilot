import type { Channel } from "@/lib/agent/schema";

export interface InboundMessage {
  id: string;
  channel: Channel;
  from: string;
  fromName: string;
  subject?: string;
  body: string;
  receivedMinutesAgo: number;
  bookingRef?: string; // present when the channel carries it (OTA threads, reply-to-confirmation emails)
}

// The seven messages from the brief plus a few that exercise the guardrails.
export const SEED_MESSAGES: InboundMessage[] = [
  {
    id: "m-001",
    channel: "email",
    from: "priya.sharma@example.com",
    fromName: "Priya Sharma",
    subject: "Our stay in May - small change",
    body: "Hi,\n\nWe're booked 3 nights in Lisbon in May under Sharma. Can we push it a day later and add a cot? Also it's our 10th anniversary - anything you can do?\n\nThanks,\nPriya",
    receivedMinutesAgo: 14,
  },
  {
    id: "m-002",
    channel: "email",
    from: "d.okafor@example.com",
    fromName: "Daniel Okafor",
    subject: "Re: Your booking AUR-48377 at Aurel Mallorca",
    body: "Hello,\n\nLooking forward to July. We're planning the spa on day two, and could you recommend a restaurant nearby? Oh, and our daughter has a severe nut allergy, just so you know. Thanks!\n\nDaniel",
    receivedMinutesAgo: 41,
    bookingRef: "AUR-48377",
  },
  {
    id: "m-003",
    channel: "whatsapp",
    from: "+44 7700 900123",
    fromName: "Unknown (WhatsApp)",
    body: "Hi! Sea view room 4-7 June, 2 adults? Booking.com shows 410 a night - can you beat it? Santorini",
    receivedMinutesAgo: 3,
  },
  {
    id: "m-004",
    channel: "ota",
    from: "Booking.com guest",
    fromName: "Elena Rossi",
    subject: "Reservation AUR-48402 - Aurel Roma",
    body: "Can I check in at 9am? Our flight lands at 6.",
    receivedMinutesAgo: 67,
    bookingRef: "AUR-48402",
  },
  {
    id: "m-005",
    channel: "phone",
    from: "+34 600 000 000",
    fromName: "Tomás Herrera",
    subject: "Call note (typed by agent)",
    body: "Guest called re booking AUR-48290 Madrid 30 Apr - 3 May. Said: \"I need to cancel. I know it's non-refundable, but my mother's just been admitted to hospital.\" Asked us to call back or email.",
    receivedMinutesAgo: 9,
    bookingRef: "AUR-48290",
  },
  {
    id: "m-006",
    channel: "email",
    from: "james@meridianluxurytravel.example",
    fromName: "James Carter, Meridian Luxury Travel",
    subject: "Whitfield 2-7 June Amalfi - amenity confirmation",
    body: "Dear Reservations,\n\nClient is a returning VIP booked through our luxury programme - please confirm the amenity and upgrade. Booking AUR-48155.\n\nKind regards,\nJames",
    receivedMinutesAgo: 128,
    bookingRef: "AUR-48155",
  },
  {
    id: "m-007",
    channel: "email",
    from: "hkim@example.com",
    fromName: "Hannah Kim",
    subject: "Airport transfer - Comporta 21 May",
    body: "Hi, this is the third time I'm asking: we need an airport transfer from Lisbon on 21 May. Flight TP1234 lands at 14:10. Please confirm someone will be there. Booking AUR-48455.",
    receivedMinutesAgo: 22,
    bookingRef: "AUR-48455",
  },
  {
    id: "m-008",
    channel: "email",
    from: "events@northstar-consulting.example",
    fromName: "Northstar Consulting",
    subject: "Offsite for 30 people - Madrid, October",
    body: "Hello, we are looking at a 3-night leadership offsite for about 30 people in Madrid in mid-October, with a meeting room each day and a group dinner. Could you send a proposal?",
    receivedMinutesAgo: 190,
  },
  {
    id: "m-009",
    channel: "whatsapp",
    from: "+351 910 000 000",
    fromName: "Unknown (WhatsApp)",
    body: "Hello, arriving Lisbon Friday with the car. Do you have parking and is it ok to bring our small dog?",
    receivedMinutesAgo: 35,
  },
  {
    id: "m-010",
    channel: "email",
    from: "marco.b@example.com",
    fromName: "Marco Bianchi",
    subject: "Payment for my booking",
    body: "Hi, you asked for a card to guarantee the room in Rome. Here it is: 4111 1111 1111 1111, exp 09/28, CVV 123. Please confirm.",
    receivedMinutesAgo: 51,
  },
];
