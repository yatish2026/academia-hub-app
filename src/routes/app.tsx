import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/stores/auth-store";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const { init } = useAuth();
  useEffect(() => { init(); }, [init]);
  return <AppLayout />;
}
