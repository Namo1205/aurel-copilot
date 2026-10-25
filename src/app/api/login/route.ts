import { NextResponse } from "next/server";
import { ROSTER } from "@/lib/desk/roster";
import { checkPassword, getSession, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Who am I, according to the cookie.
export async function GET() {
  const s = await getSession();
  return NextResponse.json({ session: s });
}

// Sign in as a desk member. The password is needed once per browser; a browser
// that already holds a valid session may switch person without it (the roles
// are views of one shared prototype desk, see README "Sign in").
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { staffId?: string; password?: string };
  const staff = ROSTER.find((s) => s.id === body.staffId);
  if (!staff) return NextResponse.json({ error: "Unknown staff member." }, { status: 400 });
  const existing = await getSession();
  if (!existing && !checkPassword(body.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  await setSessionCookie(staff.id);
  return NextResponse.json({ session: { staffId: staff.id, role: staff.role, name: staff.name } });
}
