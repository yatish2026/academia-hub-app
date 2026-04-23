import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_app/departments")({
  head: () => ({ meta: [{ title: "Departments — AcademiaHub" }] }),
  component: DepartmentsPage,
});

type Row = { id: string; name: string; code: string; hod_id: string | null };

function DepartmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, { s: number; f: number }>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("departments").select("*");
      setRows(data ?? []);
      const c: Record<string, { s: number; f: number }> = {};
      for (const d of data ?? []) {
        const [s, f] = await Promise.all([
          supabase.from("students").select("*", { count: "exact", head: true }).eq("department_id", d.id),
          supabase.from("faculty").select("*", { count: "exact", head: true }).eq("department_id", d.id),
        ]);
        c[d.id] = { s: s.count ?? 0, f: f.count ?? 0 };
      }
      setCounts(c);
    })();
  }, []);

  return (
    <RoleGuard allow={["admin"]}>
      <PageHeader title="Departments" description="Manage academic departments" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.code}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-muted/50 py-2">
                <div className="text-lg font-semibold">{counts[d.id]?.s ?? 0}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Students</div>
              </div>
              <div className="rounded-md bg-muted/50 py-2">
                <div className="text-lg font-semibold">{counts[d.id]?.f ?? 0}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faculty</div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No departments yet.</p>}
      </div>
    </RoleGuard>
  );
}
