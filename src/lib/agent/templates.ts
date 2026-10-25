// Fixed templates that may be sent without a person, and the topic check that
// runs in code before drafting and before every send (PRD section 4).

import type { Channel } from "./schema";

export const TEMPLATES = {
  holding_reply: (opts: { name: string; hotel?: string; channel: Channel }) =>
    [
      opts.channel === "whatsapp" ? `Hi ${opts.name},` : `Dear ${opts.name},`,
      `Thank you for your message. We have received it and a reservations manager will contact you today${opts.hotel ? ` about your stay at ${opts.hotel}` : ""}. Nothing further is needed from you for now.`,
      opts.channel === "whatsapp" ? "Aurel Reservations" : "Warm regards,\nAurel Reservations",
    ].join("\n\n"),

  group_ack: (opts: { name: string; hotel?: string; channel: Channel }) =>
    [
      `Dear ${opts.name},`,
      `Thank you for thinking of ${opts.hotel ?? "Aurel"} for your group. Our groups and events team will come back to you within one working day with availability and a proposal.`,
      "If you can share your preferred dates, an approximate room count per night and any meeting-room needs, it will help us reply accurately first time.",
      "Warm regards,\nAurel Reservations",
    ].join("\n\n"),

  off_topic_decline: (opts: { name: string; channel: Channel }) =>
    [
      opts.channel === "whatsapp" ? `Hi ${opts.name},` : `Dear ${opts.name},`,
      "Thank you for your message. This inbox can only help with stays at Aurel Hotels: bookings, prices, changes, requests and questions about our hotels. If there is anything about a stay we can help with, please reply and a member of our team will be happy to assist.",
      opts.channel === "whatsapp" ? "Aurel Reservations" : "Warm regards,\nAurel Reservations",
    ].join("\n\n"),

  // A policy question with no hotel in it. Contains no fact and no promise, so it may go alone.
  ask_hotel: (opts: { name: string; channel: Channel }) =>
    [
      opts.channel === "whatsapp" ? `Hi ${opts.name},` : `Dear ${opts.name},`,
      "Happy to help. Which of our hotels are you asking about? We have Aurel Lisboa, Madrid, Roma, Athens, Comporta, Mallorca, Amalfi, Santorini and Algarve, and details such as check-in and check-out times, parking and pets differ between them. Reply with the hotel and I will come straight back with the answer.",
      opts.channel === "whatsapp" ? "Aurel Reservations" : "Warm regards,\nAurel Reservations",
    ].join("\n\n"),

  day_before: (opts: { name: string; hotel: string; checkIn: string; channel: Channel }) =>
    [
      opts.channel === "whatsapp" ? `Hi ${opts.name},` : `Dear ${opts.name},`,
      `We are looking forward to welcoming you to ${opts.hotel} tomorrow. Could you let us know your expected arrival time, and whether there is anything else you need for your stay? Check-in is from 15:00; if you arrive earlier you are welcome to leave luggage and use the hotel.`,
      opts.channel === "whatsapp" ? "Aurel Reservations" : "Warm regards,\nAurel Reservations",
    ].join("\n\n"),
};

// Words that mark a message as about a stay. Used by the topic check, not by
// the sorter: the sorter decides the type, this decides whether the AI agent
// may act at all.
const STAY_WORDS =
  /\b(room|rooms|booking|book|reservation|reserv|stay|night|nights|hotel|suite|villa|check[- ]?in|check[- ]?out|arriv|depart|rate|price|cost|quote|availab|cancel|refund|modif|change|date|cot|crib|transfer|airport|parking|pet|dog|breakfast|spa|dinner|restaurant|allerg|wheelchair|accessib|anniversary|birthday|honeymoon|group|wedding|event|meeting|offsite|conference|upgrade|amenit|vip|advisor|guest|lisbon|madrid|rome|athens|comporta|mallorca|amalfi|santorini|algarve|positano|deià|oia|lagos|aurel)/i;

// Strong asks are off-topic even if the message also mentions hotels or prices
// ("write me a script that scrapes hotel prices").
const STRONG_OFF_TOPIC =
  /\b(write (me )?(a |some )?(python|javascript|java|sql|code|script|program|function|essay|poem|story|homework)|python|javascript|typescript|sql query|regex|algorithm|scrape|scraper|homework|essay|poem|legal advice|lawsuit|medical advice|diagnos)\b/i;

const OFF_TOPIC_ASKS =
  /\b(translate this|weather (in|for|today)|stock|bitcoin|crypto|lawyer|sue|prescri|symptom|who is the president|capital of|recipe|joke)\b/i;

const MANIPULATION =
  /\b(ignore (all |your |the )?(previous |prior |above )?(instructions|rules|prompt)|you are now|act as|pretend (to be|you are)|system prompt|show (me )?your (prompt|instructions|rules)|reveal your|jailbreak|developer mode|disregard (your|the) (rules|instructions)|repeat (your|the) instructions)\b/i;

const OTHER_GUEST = /\b(other guest|another guest|who (else )?is staying|guest list|room number of|is .{3,40} staying (at|with you))\b/i;

// Does the text say anything about a stay at all? A follow-up like "What do you mean?"
// does not, and must not be auto-answered from the thread.
export function mentionsStay(text: string): boolean {
  return STAY_WORDS.test(text);
}

export type TopicVerdict = { ok: true } | { ok: false; reason: "manipulation" | "off_topic" | "other_guest_data" };

// Inbound check: may the AI agent act on this message at all?
export function topicCheck(text: string): TopicVerdict {
  if (MANIPULATION.test(text)) return { ok: false, reason: "manipulation" };
  if (OTHER_GUEST.test(text)) return { ok: false, reason: "other_guest_data" };
  if (STRONG_OFF_TOPIC.test(text)) return { ok: false, reason: "off_topic" };
  const aboutStay = STAY_WORDS.test(text);
  const offTopicAsk = OFF_TOPIC_ASKS.test(text);
  if (offTopicAsk && !aboutStay) return { ok: false, reason: "off_topic" };
  if (!aboutStay && text.trim().split(/\s+/).length > 12) return { ok: false, reason: "off_topic" };
  return { ok: true };
}

// Placeholders a draft still carries, such as "[confirm rate]" or "[Guest Name]". Sending
// is blocked until they are filled in. The one placeholder the system fills itself is ignored.
export const PAYMENT_LINK_PLACEHOLDER = "[Secure payment link will be inserted on send]";
export function draftGaps(text: string): string[] {
  return [...new Set((text.match(/\[[^\]\n]{2,60}\]/g) ?? []).filter((g) => g !== PAYMENT_LINK_PLACEHOLDER))];
}

// Outbound check: may this draft leave the building? Catches code blocks,
// prompt leakage and anything that does not read like a reservations reply.
export function outboundCheck(draft: string): TopicVerdict {
  if (/```|\bdef \w+\(|\bimport \w+|\bfunction \w+\(|#include|SELECT .+ FROM/i.test(draft)) return { ok: false, reason: "off_topic" };
  if (/system prompt|my instructions|as an ai|language model/i.test(draft)) return { ok: false, reason: "manipulation" };
  return { ok: true };
}
