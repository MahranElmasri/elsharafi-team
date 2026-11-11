import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { admin } from "./accounts";

// One file per run (setup and teardown share the process), so two runs never mix them up.
export const SAVED_SETTINGS = join(tmpdir(), `mvz-e2e-settings-${process.pid}.json`);

export default async function globalTeardown() {
  const text = await readFile(SAVED_SETTINGS, "utf8").catch(() => null);
  if (!text) {
    console.warn("[e2e] No saved settings found; the switches stay as they are.");
    return;
  }
  const { error } = await admin.from("app_settings").update(JSON.parse(text)).eq("id", true);
  if (error) throw error;
  await rm(SAVED_SETTINGS);
}
