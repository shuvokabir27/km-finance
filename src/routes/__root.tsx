// build: trigger cloudflare redeploy after adding env vars
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/splash-screen";
import { supabase } from "@/integrations/supabase/client";

const KNOWN_ROUTES = [
  "/", "/auth", "/dashboard", "/members", "/attendance", "/payments",
  "/shootings", "/account-check", "/sms", "/directory", "/reports", "/congrats",
];

function NotFoundComponent() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const isKnown = KNOWN_ROUTES.includes(path) || path.startsWith("/p/");
    const flag = `__reloaded_404:${path}`;
    if (isKnown && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, "1");
      window.location.reload();
    }
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-foreground">৪০৪</h1>
        <p className="mt-3 text-muted-foreground">পেজটি খুঁজে পাওয়া যায়নি</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">হোমে ফিরে যান</Link>
      </div>
    </div>
  );
}


function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">সমস্যা হয়েছে</h1>
        <p className="mt-2 text-sm text-muted-foreground">পেজটি লোড করা যায়নি।</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >আবার চেষ্টা করুন</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Kuakata Multimedia Finance" },
      { name: "description", content: "টিম ম্যানেজার — হাজিরা, প্রফাইল ও বেতন ব্যবস্থাপনা" },
      { name: "theme-color", content: "#16a34a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Kuakata Multimedia" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "Kuakata Multimedia Finance" },
      { name: "twitter:title", content: "Kuakata Multimedia Finance" },
      { property: "og:description", content: "টিম ম্যানেজার — হাজিরা, প্রফাইল ও বেতন ব্যবস্থাপনা" },
      { name: "twitter:description", content: "টিম ম্যানেজার — হাজিরা, প্রফাইল ও বেতন ব্যবস্থাপনা" },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Tiro+Bangla:ital@0;1&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent as never,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    import("@/lib/theme").then(({ applyTheme, getStoredTheme }) => applyTheme(getStoredTheme()));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen />
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
