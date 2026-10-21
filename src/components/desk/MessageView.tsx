"use client";

import type { InboxItem } from "@/lib/store";
import { Badge, CHANNEL_LABEL, ChannelIcon, timeAgo } from "@/components/ui";
import { redactCards } from "@/lib/agent/rules";
import { getBooking, getGuest, getHotel, nightsBetween } from "@/lib/pms";
import { fmtDate } from "@/components/ui";

export function MessageView({ item }: { item: InboxItem }) {
  const m = item.message;
  const body = redactCards(m.body);
  const redacted = body !== m.body;
  const bookingId = item.analysis?.proposal.bookingMatch.bookingId ?? m.bookingRef ?? null;
  const booking = bookingId ? getBooking(bookingId) : undefined;
  const hotel = booking ? getHotel(booking.hotelId) : undefined;
  const guest = booking ? getGuest(booking.guestId) : undefined;
  const updated = item.result?.bookingUpdates.find((b) => b.id === bookingId);

  return (
    <div className="space-y-4">
      <article className="rounded-lg border border-stone-200 bg-white">
        <header className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
          <ChannelIcon channel={m.channel} />
          <div className="min-w-0">
            <div className="font-medium text-sm">{m.fromName}</div>
            <div className="text-xs text-stone-500 truncate">
              {CHANNEL_LABEL[m.channel]} · {m.from} · {timeAgo(item.receivedAt)} ago
            </div>
          </div>
          {redacted ? (
            <Badge tone="rose" title="Card number and CVV were removed before storage or display.">
              Card details redacted
            </Badge>
          ) : null}
        </header>
        <div className="px-4 py-3">
          {m.subject ? <div className="text-sm font-medium mb-2">{m.subject}</div> : null}
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-stone-800">{body}</p>
        </div>
      </article>

      {booking && hotel ? (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">PMS booking</span>
            <span className="font-mono text-xs">{booking.id}</span>
            {updated ? <Badge tone="green">Modified</Badge> : <Badge>{booking.status}</Badge>}
            {guest?.vip ? <Badge tone="brand">VIP · {guest.stays} stays</Badge> : null}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-stone-700">
            <div>
              <div className="text-stone-400">Hotel</div>
              {hotel.name}
            </div>
            <div>
              <div className="text-stone-400">Dates</div>
              {fmtDate(updated?.checkIn ?? booking.checkIn)} → {fmtDate(updated?.checkOut ?? booking.checkOut)} ({nightsBetween(updated?.checkIn ?? booking.checkIn, updated?.checkOut ?? booking.checkOut)}n)
            </div>
            <div>
              <div className="text-stone-400">Room · guests</div>
              {hotel.roomTypes.find((r) => r.code === (updated?.roomType ?? booking.roomType))?.name} · {booking.adults + booking.children}
            </div>
            <div>
              <div className="text-stone-400">Rate</div>
              {booking.ratePlan} · EUR {updated?.nightlyRate ?? booking.nightlyRate}/night · {booking.channel.replace("_", " ")}
            </div>
          </div>
          {guest?.preferences.length ? <div className="mt-2 text-xs text-stone-500">Preferences: {guest.preferences.join(", ")}</div> : null}
        </div>
      ) : null}

      {item.result?.sentReply ? (
        <article className="rounded-lg border border-emerald-200 bg-emerald-50/50">
          <header className="px-4 py-2 border-b border-emerald-100 text-xs text-emerald-900 flex items-center gap-2">
            <span className="font-semibold">Sent reply</span>
            <span>· {CHANNEL_LABEL[item.result.sentReply.channel as keyof typeof CHANNEL_LABEL]} · {timeAgo(item.result.sentReply.sentAt)} ago</span>
          </header>
          <p className="px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed text-stone-800">{item.result.sentReply.body}</p>
        </article>
      ) : null}
    </div>
  );
}
