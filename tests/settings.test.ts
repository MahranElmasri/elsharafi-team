import { describe, expect, it } from "vitest";
import { codeFromLabel } from "@/lib/settings";

describe("codeFromLabel", () => {
  it("makes a valid code and never reuses an existing one", () => {
    expect(codeFromLabel("Kur (Reha)", [])).toBe("kur_reha");
    expect(codeFromLabel("Überstunden-Ausgleich", [])).toBe("ueberstunden_ausgleich");
    expect(codeFromLabel("Urlaub", ["urlaub"])).toBe("urlaub_b");
    expect(codeFromLabel("Urlaub", ["urlaub", "urlaub_b"])).toBe("urlaub_c");
    expect(codeFromLabel("A", [])).toBe("a_art");
    expect(codeFromLabel("123", [])).toBe("art");
    for (const label of ["Kur (Reha)", "A", "123", "x".repeat(80)]) {
      expect(codeFromLabel(label, [])).toMatch(/^[a-z_]{2,32}$/);
    }
  });
});
