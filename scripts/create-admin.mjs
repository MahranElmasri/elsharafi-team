#!/usr/bin/env node
// Creates the first admin account with a password (bootstrap only; later accounts use invites).
// Usage: node --env-file=.env.local scripts/create-admin.mjs <username> "<Full Name>" <password> [email]
import { createClient } from "@supabase/supabase-js";

const [username, fullName, password, email] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!username || !fullName || !password) {
  fail(
    'Aufruf: node --env-file=.env.local scripts/create-admin.mjs <benutzername> "<Name>" <passwort> [email]',
  );
}
if (!url || !key)
  fail("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.");
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
  fail(
    "Benutzername: 3–32 Zeichen, Kleinbuchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.",
  );
}
if (password.length < 10) fail("Das Passwort muss mindestens 10 Zeichen haben.");

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.auth.admin.createUser({
  email: email || `${username}@users.mvz-elsharafi.invalid`,
  password,
  email_confirm: true,
  app_metadata: { role: "admin" },
  user_metadata: { username, full_name: fullName, team: "verwaltung" },
});
if (error) fail(`Konto konnte nicht angelegt werden: ${error.message}`);
console.log(`Admin „${fullName}“ (${username}) angelegt: ${data.user.id}`);
