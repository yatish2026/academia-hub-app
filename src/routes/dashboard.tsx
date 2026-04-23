import { createFileRoute } from "@tanstack/react-router";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/stores/auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { init } = useAuth();
  useEffect(() => { init(); }, [init]);
  return <AppLayout />;
}
