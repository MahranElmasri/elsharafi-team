import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain function rather than vi.fn(): the tests make it throw on purpose.
const calls: unknown[][] = [];
let respond: () => Promise<unknown> = async () => ({ statusCode: 201 });
const sendNotification = (...args: unknown[]) => {
  calls.push(args);
  return respond();
};
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
    }
  }
  return { default: { sendNotification }, WebPushError };
});

const { sendPush, toPushPayload, vapidFromEnv } = await import("@/lib/push");
const { WebPushError } = (await import("web-push")) as unknown as {
  WebPushError: new (message: string, statusCode: number) => Error;
};

const target = { endpoint: "https://push.example/1", p256dh: "k", auth: "a" };
const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:praxis@example.org" };

describe("toPushPayload", () => {
  it("carries the message and the in-app link", () => {
    expect(toPushPayload({ message: "Ihr Antrag wurde genehmigt.", link: "/me" })).toEqual({
      title: "Anwesenheit",
      body: "Ihr Antrag wurde genehmigt.",
      url: "/me",
    });
  });

  it("opens the start page for missing or outside links", () => {
    expect(toPushPayload({ message: "x", link: null }).url).toBe("/");
    expect(toPushPayload({ message: "x", link: "https://evil.example" }).url).toBe("/");
    expect(toPushPayload({ message: "x", link: "//evil.example" }).url).toBe("/");
  });
});

describe("vapidFromEnv", () => {
  it("needs all three values", () => {
    expect(
      vapidFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s" } as never),
    ).toBe(null);
    expect(
      vapidFromEnv({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p",
        VAPID_PRIVATE_KEY: "s",
        VAPID_SUBJECT: "mailto:a@b.de",
      } as never),
    ).toEqual({ publicKey: "p", privateKey: "s", subject: "mailto:a@b.de" });
  });
});

describe("sendPush", () => {
  beforeEach(() => {
    calls.length = 0;
    respond = async () => ({ statusCode: 201 });
  });

  it("sends the payload as JSON with the VAPID details", async () => {
    const payload = toPushPayload({ message: "Hallo", link: "/me" });
    expect(await sendPush(target, payload, vapid)).toBe("sent");
    expect(calls).toEqual([
      [
        { endpoint: target.endpoint, keys: { p256dh: "k", auth: "a" } },
        JSON.stringify(payload),
        expect.objectContaining({ vapidDetails: vapid }),
      ],
    ]);
  });

  it.each([404, 410])("reports an expired device (%i) as gone", async (status) => {
    respond = async () => {
      throw new WebPushError("gone", status);
    };
    expect(await sendPush(target, toPushPayload({ message: "x", link: null }), vapid)).toBe("gone");
  });

  it("reports other errors as failed without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respond = async () => {
      throw new WebPushError("busy", 429);
    };
    expect(await sendPush(target, toPushPayload({ message: "x", link: null }), vapid)).toBe(
      "failed",
    );
    respond = async () => {
      throw new Error("offline");
    };
    expect(await sendPush(target, toPushPayload({ message: "x", link: null }), vapid)).toBe(
      "failed",
    );
  });
});
