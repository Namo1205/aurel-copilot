import { z } from "zod";

// The structured proposal the AI agent produces for every inbound message.
// Nothing in here is executed until a CRO agent approves it in the UI.

export const Category = z.enum([
  "new_booking_enquiry",
  "modify_booking",
  "special_request",
  "pre_arrival_question",
  "cancellation_refund",
  "group_event",
  "off_topic",
  "other",
]);

// What, if anything, the AI agent may send without a person. Only cited
// policy answers and the three fixed templates ever qualify (PRD section 4).
export const AutoSend = z.object({
  kind: z.enum(["none", "policy_answer", "holding_reply", "group_ack", "off_topic_decline"]),
  reason: z.string(),
  // The fixed text that went out. When set, draftReply is the owner's follow-up, not the template.
  body: z.string().optional(),
});
export type AutoSend = z.infer<typeof AutoSend>;
export type Category = z.infer<typeof Category>;

export const Channel = z.enum(["email", "whatsapp", "ota", "phone"]);
export type Channel = z.infer<typeof Channel>;

export const DepartmentEnum = z.enum([
  "front_office",
  "housekeeping",
  "fnb",
  "concierge",
  "reservations",
  "sales",
  "spa",
]);

export const HandoffTarget = z.enum(["reservations_manager", "group_sales", "reservations_agent", "hotel_team"]);
export type HandoffTarget = z.infer<typeof HandoffTarget>;

export const SensitiveType = z.enum(["allergy", "medical", "accessibility", "payment_card"]);

export const ProposedAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("quote"),
    hotelId: z.string(),
    roomType: z.string(),
    roomName: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    nights: z.number(),
    ratePlan: z.string(),
    nightlyRate: z.number(),
    total: z.number(),
    currency: z.literal("EUR"),
    refundable: z.boolean(),
    available: z.boolean(),
    rationale: z.string(),
  }),
  z.object({
    type: z.literal("modify_booking"),
    bookingId: z.string(),
    changes: z.object({
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      roomType: z.string().optional(),
      adults: z.number().optional(),
    }),
    withinPolicy: z.boolean(),
    newNightlyRate: z.number().optional(),
    rateDifferenceTotal: z.number().optional(),
    rationale: z.string(),
  }),
  z.object({
    type: z.literal("create_trace"),
    hotelId: z.string(),
    bookingId: z.string().nullable(),
    department: DepartmentEnum,
    summary: z.string(),
    due: z.string(),
    sensitive: z.boolean(),
    rationale: z.string(),
  }),
  z.object({
    type: z.literal("handoff"),
    to: HandoffTarget,
    reason: z.string(),
    urgency: z.enum(["today", "this_week", "before_arrival"]),
    context: z.string(),
  }),
  z.object({
    type: z.literal("send_payment_link"),
    bookingId: z.string().nullable(),
    rationale: z.string(),
  }),
]);
export type ProposedAction = z.infer<typeof ProposedAction>;

export const AgentProposal = z.object({
  triage: z.object({
    category: Category,
    secondaryCategories: z.array(Category),
    hotelId: z.string().nullable(),
    urgency: z.enum(["low", "normal", "high"]),
    language: z.string(),
    summary: z.string(),
  }),
  bookingMatch: z.object({
    bookingId: z.string().nullable(),
    confidence: z.enum(["none", "low", "high"]),
    note: z.string(),
  }),
  sensitiveData: z.object({
    present: z.boolean(),
    types: z.array(SensitiveType),
    handling: z.string(),
  }),
  actions: z.array(ProposedAction),
  draftReply: z.string(),
  didNotPromise: z.array(z.string()),
  policyCitations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  autoSendEligible: z.boolean(),
  autoSend: AutoSend.default({ kind: "none", reason: "" }),
  requiresHuman: z.boolean(),
  requiresHumanReason: z.string(),
});
export type AgentProposal = z.infer<typeof AgentProposal>;

export const CATEGORY_LABEL: Record<Category, string> = {
  new_booking_enquiry: "New booking enquiry",
  modify_booking: "Modify booking",
  special_request: "Special request",
  pre_arrival_question: "Pre-arrival question",
  cancellation_refund: "Cancellation / refund",
  group_event: "Group / event",
  off_topic: "Off-topic",
  other: "Other",
};

export const HANDOFF_LABEL: Record<HandoffTarget, string> = {
  reservations_manager: "Reservations manager",
  group_sales: "Group Sales",
  reservations_agent: "Reservations agent",
  hotel_team: "Hotel team",
};
