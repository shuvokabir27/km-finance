import { createFileRoute } from "@tanstack/react-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const memberId = url.searchParams.get("memberId") ?? "";
        const startUrl = UUID_RE.test(memberId) ? `/p/${memberId}` : "/";
        const manifest = {
          name: "KM সদস্য প্রফাইল",
          short_name: "KM প্রফাইল",
          description: "নিজের প্রফাইল, হাজিরা ও বেতনের হিসাব",
          start_url: startUrl,
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#f0fdf4",
          theme_color: "#16a34a",
          lang: "bn",
          icons: [
            { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any maskable" },
            { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
          ],
        };
        return Response.json(manifest, {
          headers: {
            "Content-Type": "application/manifest+json",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
