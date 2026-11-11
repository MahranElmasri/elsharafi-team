import { describe, expect, it } from "vitest";
import { renderNotification } from "@/lib/mail";

describe("renderNotification", () => {
  const row = {
    to: "anna@example.org",
    subject: "Ihr Antrag Urlaub 7.–9.12.2026 wurde genehmigt.",
    text: "Ihr Antrag „Urlaub“ für 7.–9.12.2026 wurde genehmigt.\nNachricht der Praxisleitung: Schönen Urlaub",
    link: "/me",
  };

  it("keeps recipient and subject and adds greeting, link and footer", () => {
    const mail = renderNotification(row, "https://team.mvz-elsharafi.de/");
    expect(mail.to).toBe("anna@example.org");
    expect(mail.subject).toBe(row.subject);
    expect(mail.text).toBe(
      [
        "Guten Tag,",
        "",
        "Ihr Antrag „Urlaub“ für 7.–9.12.2026 wurde genehmigt.",
        "Nachricht der Praxisleitung: Schönen Urlaub",
        "",
        "Zur App: https://team.mvz-elsharafi.de/me",
        "",
        "MVZ El-Sharafi",
        "Diese Nachricht wurde automatisch verschickt. Bitte antworten Sie nicht darauf.",
      ].join("\n"),
    );
  });

  it("leaves out the link when there is none or it isn't a path in the app", () => {
    expect(renderNotification({ ...row, link: null }, "https://x.de").text).not.toContain(
      "Zur App",
    );
    expect(
      renderNotification({ ...row, link: "https://evil.example" }, "https://x.de").text,
    ).not.toContain("evil");
  });
});
