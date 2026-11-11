import { writeFile } from "node:fs/promises";
import { admin } from "./accounts";
import { SAVED_SETTINGS } from "./global-teardown";

// The switches can be changed in the app (R24). The tests assume all on, so the run starts
// from that and global-teardown.ts puts the practice's own choice back afterwards.
export default async function globalSetup() {
  const { data, error } = await admin.from("app_settings").select("*").single();
  if (error) throw error;
  await writeFile(SAVED_SETTINGS, JSON.stringify(data));
  const on = await admin
    .from("app_settings")
    .update({ team_calendar: true, half_days: true, substitutes: true, au_tracking: true })
    .eq("id", true);
  if (on.error) throw on.error;
}
