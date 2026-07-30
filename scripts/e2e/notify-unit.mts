// Unit tests for the pure notification routing (events.ts has no runtime imports).
import { resolveChannels, isQuietNow } from "../../src/lib/notify/events.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`); }
};

const noon = new Date("2026-07-25T12:00:00Z");   // not quiet
const night = new Date("2026-07-25T23:00:00Z");  // inside 22:00–07:00 window

console.log("— resolveChannels defaults —");
eq("client_signed default", resolveChannels(undefined, "client_signed", noon), { push: true, email: true, sms: false });
eq("sub_bid default", resolveChannels(undefined, "sub_bid", noon), { push: true, email: true, sms: false });

console.log("\n— per-event overrides —");
eq("sms turned on", resolveChannels({ events: { client_signed: { sms: true } } }, "client_signed", noon), { push: true, email: true, sms: true });
eq("push turned off", resolveChannels({ events: { client_signed: { push: false } } }, "client_signed", noon), { push: false, email: true, sms: false });

console.log("\n— quiet hours —");
const quiet = { quiet_hours: { enabled: true, start: "22:00", end: "07:00", tz: "UTC" }, events: { client_signed: { sms: true } } };
eq("is quiet at 23:00Z", isQuietNow(quiet, night), true);
eq("not quiet at 12:00Z", isQuietNow(quiet, noon), false);
eq("quiet mutes push+sms, keeps email", resolveChannels(quiet, "client_signed", night), { push: false, email: true, sms: false });
eq("outside quiet: normal routing", resolveChannels(quiet, "client_signed", noon), { push: true, email: true, sms: true });
eq("quiet disabled → no effect", isQuietNow({ quiet_hours: { enabled: false, start: "22:00", end: "07:00", tz: "UTC" } }, night), false);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
