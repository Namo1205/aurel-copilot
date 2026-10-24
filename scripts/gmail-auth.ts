// One-time sign-in for the live Gmail link. Prints a Google URL; you open it, sign in
// as the desk mailbox, click Allow, and the refresh token is written to .env.local.
//
//   npx tsx --env-file=.env.local scripts/gmail-auth.ts
//
// Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from a "Desktop app" OAuth client
// in Google Cloud (APIs & Services → Credentials), with the Gmail API enabled and
// the mailbox added as a test user on the OAuth consent screen.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;
const scope = "https://www.googleapis.com/auth/gmail.modify";
const url =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope, access_type: "offline", prompt: "consent" }).toString();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (u.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "content-type": "text/plain" }).end(`No code. Google said: ${u.searchParams.get("error") ?? "unknown"}`);
    return;
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    });
    const j = (await r.json()) as { refresh_token?: string; error?: string; error_description?: string };
    if (!j.refresh_token) throw new Error(`${j.error ?? r.status}: ${j.error_description ?? "no refresh token returned"}`);
    const envPath = path.resolve(process.cwd(), ".env.local");
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    env = /^GMAIL_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, `GMAIL_REFRESH_TOKEN=${j.refresh_token}`) : env.replace(/\s*$/, "\n") + `GMAIL_REFRESH_TOKEN=${j.refresh_token}\n`;
    fs.writeFileSync(envPath, env);
    const who = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { authorization: `Bearer ${(await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: j.refresh_token, grant_type: "refresh_token" }) })).json()).access_token}` },
    }).then((x) => x.json() as Promise<{ emailAddress?: string }>);
    res.writeHead(200, { "content-type": "text/plain" }).end(`Connected ${who.emailAddress ?? "the mailbox"}. You can close this tab and restart the dev server.`);
    console.log(`\nConnected ${who.emailAddress ?? "the mailbox"}. GMAIL_REFRESH_TOKEN saved to .env.local. Restart the dev server.`);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
    console.error(e);
  } finally {
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 300);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL in your browser, sign in as the desk mailbox, and click Allow:\n");
  console.log(url + "\n");
  console.log(`Waiting for Google to redirect to ${redirect} …`);
});
