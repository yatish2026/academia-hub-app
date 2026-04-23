import { useAuth } from "@/stores/auth-store";
import type { AppRole } from "@/lib/types";

export function RoleGuard({ allow, children }: { allow: AppRole[]; children: React.ReactNode }) {
  const { primaryRole, initialized } = useAuth();
  if (!initialized) return null;
  if (!primaryRole || !allow.includes(primaryRole)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Access denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
