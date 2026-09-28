import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EKSU Sports Hub",
    short_name: "EKSU Sports",
    description: "Live scores, fixtures, results and tables for Ekiti State University sport.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2f1",
    theme_color: "#5c1025",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
