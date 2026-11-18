import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "@/lib/app-url";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("uses the production domain when APP_URL is not set", () => {
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("https://plan.mvz-elsharafi.de");
  });

  it("drops a path or trailing slash from APP_URL", () => {
    vi.stubEnv("APP_URL", "https://plan.mvz-elsharafi.de/login/");
    expect(appUrl()).toBe("https://plan.mvz-elsharafi.de");
  });

  it("keeps a local port", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it("falls back when APP_URL is not a URL", () => {
    vi.stubEnv("APP_URL", "plan.mvz-elsharafi.de");
    expect(appUrl()).toBe("https://plan.mvz-elsharafi.de");
  });
});
