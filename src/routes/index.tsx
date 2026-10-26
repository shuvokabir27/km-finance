import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" />;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-accent/30 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Wallet className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">Kuakata Multimedia Finance</h1>
        <p className="mt-2 text-muted-foreground">টিম ম্যানেজার — হাজিরা ও বেতন ব্যবস্থাপনা</p>
      </div>
      <Navigate to="/auth" />
    </div>
  );
}
