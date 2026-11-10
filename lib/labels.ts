/** User-facing German text that is shared between pages. */
export const labels = {
  appName: "Anwesenheit",
  practice: "MVZ El-Sharafi",
  login: {
    title: "Anmelden",
    username: "Benutzername",
    password: "Passwort",
    submit: "Anmelden",
    pending: "Anmelden …",
    failed: "Benutzername oder Passwort stimmt nicht. Prüfen Sie beide Angaben.",
    missing: "Bitte geben Sie Benutzername und Passwort ein.",
    blocked: "Ihr Konto ist deaktiviert. Bitte wenden Sie sich an die Praxisleitung.",
  },
  logout: "Abmelden",
  forgotLink: "Passwort vergessen?",
  invite: {
    titleInvite: "Passwort festlegen",
    titleReset: "Neues Passwort festlegen",
    greeting: (name: string) =>
      `Guten Tag, ${name}. Legen Sie ein Passwort mit mindestens 10 Zeichen fest.`,
    password: "Neues Passwort",
    repeat: "Passwort wiederholen",
    submit: "Passwort speichern",
    pending: "Speichern …",
    tooShort: "Das Passwort braucht mindestens 10 Zeichen.",
    mismatch: "Die beiden Passwörter sind nicht gleich. Geben Sie es zweimal gleich ein.",
    failed: "Das Passwort konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.",
    unknown: "Dieser Link ist ungültig. Prüfen Sie, ob Sie ihn vollständig geöffnet haben.",
    used: "Dieser Link wurde schon benutzt. Bitten Sie die Praxisleitung um einen neuen Link.",
    expired: "Dieser Link ist abgelaufen. Bitten Sie die Praxisleitung um einen neuen Link.",
    inactive: "Ihr Konto ist deaktiviert. Bitte wenden Sie sich an die Praxisleitung.",
    toLogin: "Zur Anmeldung",
  },
  forgot: {
    title: "Passwort vergessen",
    intro:
      "Geben Sie Ihren Benutzernamen ein. Wir schicken Ihnen einen Link, mit dem Sie ein neues Passwort festlegen.",
    username: "Benutzername",
    submit: "Link anfordern",
    pending: "Senden …",
    done: "Wenn zu diesem Benutzernamen eine E-Mail-Adresse hinterlegt ist, haben wir Ihnen einen Link geschickt. Er gilt 7 Tage. Ohne E-Mail-Adresse wenden Sie sich bitte an die Praxisleitung.",
    mailSubject: "Neues Passwort für Anwesenheit – MVZ El-Sharafi",
    mailText: (name: string, url: string) =>
      `Guten Tag ${name},\n\nüber diesen Link legen Sie ein neues Passwort fest:\n${url}\n\nDer Link gilt 7 Tage und nur einmal. Wenn Sie kein neues Passwort angefordert haben, können Sie diese E-Mail ignorieren.\n\nMVZ El-Sharafi`,
  },
} as const;
