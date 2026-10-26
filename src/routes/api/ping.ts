import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/api/ping")({
  server: {
    handlers: {
      GET: async () => {
        const start = Date.now();
        let dbStatus = "ok";
        let dbLatencyMs = 0;
        let dbError: string | null = null;

        try {
          const dbStart = Date.now();
          // Lightweight ping query to keep Supabase PostgreSQL active and prevent inactivity sleep
          const { error } = await supabase.from("members").select("id").limit(1);
          dbLatencyMs = Date.now() - dbStart;

          if (error) {
            dbStatus = "error";
            dbError = error.message;
          }
        } catch (err: unknown) {
          dbStatus = "error";
          dbError = err instanceof Error ? err.message : String(err);
        }

        const totalLatencyMs = Date.now() - start;

        return Response.json(
          {
            status: "active",
            uptime_check: "ok",
            timestamp: new Date().toISOString(),
            total_latency_ms: totalLatencyMs,
            database: {
              status: dbStatus,
              latency_ms: dbLatencyMs,
              ...(dbError ? { error: dbError } : {}),
            },
            server: "vercel",
            service: "kuakata-multimedia-finance",
          },
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
              Pragma: "no-cache",
            },
          },
        );
      },
      HEAD: async () => {
        return new Response(null, {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      },
    },
  },
});
