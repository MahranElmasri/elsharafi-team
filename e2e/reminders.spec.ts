import { expect, test } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

// 2027 keeps the run away from the other tests' people: only this account has a 2027 allowance.
const asOf = "2027-10-05";
let rita: TestAccount;

test.beforeAll(async () => {
  rita = await createAccount("rita", "employee", true);
  await admin.from("profiles").update({ start_date: "2020-01-01" }).eq("id", rita.id);
  const { error } = await admin
    .from("leave_allowances")
    .insert({ user_id: rita.id, year: 2027, days: 10, carryover: 0 });
  if (error) throw error;
});

test.afterAll(async () => {
  await deleteAccount(rita); // reminder_log and notifications cascade
});

const endpoint = "/api/cron/reminders";
const auth = () => ({ Authorization: `Bearer ${process.env.CRON_SECRET}` });

async function ritaLog() {
  const { data } = await admin
    .from("reminder_log")
    .select("kind, year, days_at_risk, channel")
    .eq("user_id", rita.id);
  return data ?? [];
}

test("a wrong or missing secret gets 401 and changes nothing", async ({ request }) => {
  expect((await request.post(endpoint, { data: { asOf } })).status()).toBe(401);
  const wrong = await request.post(endpoint, {
    headers: { Authorization: "Bearer falsch" },
    data: { asOf },
  });
  expect(wrong.status()).toBe(401);
  expect((await request.get(endpoint, { headers: auth() })).status()).toBe(405);
  expect(await ritaLog()).toEqual([]);
});

test("the secret runs the reminders once per month and logs them", async ({ request }) => {
  expect(process.env.CRON_SECRET, "CRON_SECRET must be set in .env.local").toBeTruthy();
  const bad = await request.post(endpoint, { headers: auth(), data: { asOf: "5.10.2027" } });
  expect(bad.status()).toBe(400);

  const first = await request.post(endpoint, { headers: auth(), data: { asOf } });
  expect(first.status()).toBe(200);
  const body = await first.json();
  expect(body.asOf).toBe(asOf);
  // Locally there is no SMTP: the email is not sent, so it is counted as failed and not logged.
  expect(body.emailsSent + body.emailsFailed).toBeGreaterThanOrEqual(1);

  const log = await ritaLog();
  expect(log).toContainEqual({ kind: "year_end", year: 2027, days_at_risk: 10, channel: "in_app" });
  expect(log.filter((l) => l.channel === "email")).toHaveLength(body.emailsSent > 0 ? 1 : 0);

  const { data: notes } = await admin
    .from("notifications")
    .select("message")
    .eq("user_id", rita.id);
  expect(notes?.map((n) => n.message)).toContain("Sie haben noch 10 Arbeitstage Urlaub für 2027");

  // Same month again: nothing new.
  const again = await request.post(endpoint, { headers: auth(), data: { asOf: "2027-10-20" } });
  expect(again.status()).toBe(200);
  expect(await ritaLog()).toHaveLength(log.length);
});
