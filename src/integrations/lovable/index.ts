import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions
    ) => {
      const redirectTo =
        opts?.redirect_uri ??
        (typeof window !== "undefined" ? window.location.origin : undefined);

      const targetProvider = provider === "lovable" ? "google" : provider;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: targetProvider as "google" | "apple",
        options: {
          redirectTo,
          queryParams: opts?.extraParams,
        },
      });

      if (error) {
        return { error, redirected: false };
      }

      return { data, error: null, redirected: true };
    },
  },
};

