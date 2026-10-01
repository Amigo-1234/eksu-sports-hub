import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EKSU Sports Hub",
    short_name: "EKSU Sports",
    description: "Live scores, fixtures, results and tables for Ekiti State University sport.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f2f1",
    theme_color: "#ffffff",
    icons: [
      { src: "/brand/eksu-crest-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
