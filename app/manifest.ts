import type { MetadataRoute } from "next";

/** Lets phones install the app on the home screen, opening full screen (R27). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Anwesenheit – MVZ El-Sharafi",
    short_name: "Anwesenheit",
    description: "Urlaub und Abwesenheiten im MVZ El-Sharafi",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8f7",
    theme_color: "#f6f8f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
