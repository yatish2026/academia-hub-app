import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_LABEL, type AppRole } from "@/lib/types";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users — AcademiaHub" }] }),
  component: UsersPage,
});

type Row = { id: string; full_name: string; email: string; department_id: string | null };

function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, AppRole[]>>({});
  const [depts, setDepts] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: profiles }, { data: roles }, { data: dpts }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department_id"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("departments").select("id, name"),
      ]);
      setRows(profiles ?? []);
      const map: Record<string, AppRole[]> = {};
      for (const r of roles ?? []) (map[r.user_id] ??= []).push(r.role as AppRole);
      setRoleMap(map);
      const d: Record<string, string> = {};
      for (const x of dpts ?? []) d[x.id] = x.name;
      setDepts(d);
    })();
  }, []);

  return (
    <RoleGuard allow={["admin"]}>
      <PageHeader title="Users" description="All users in the system" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-3">
                  {(roleMap[r.id] ?? []).map((role) => (
                    <span key={role} className="mr-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[role]}</span>
                  ))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.department_id ? depts[r.department_id] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RoleGuard>
  );
}
