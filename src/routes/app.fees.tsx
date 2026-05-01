import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RoleGuard } from "@/components/RoleGuard";
import { ScopeFilters, ALL_SCOPE, type Scope } from "@/components/ScopeFilters";

export const Route = createFileRoute("/app/fees")({
  head: () => ({ meta: [{ title: "Fees — AcademiaHub" }] }),
  component: FeesPage,
});

type FeeRow = {
  id: string;
  student_id: string;
  total_fee: number;
  paid_amount: number;
  due_amount: number;
  semester: string;
  students?: { roll_no: string; section: string; year: number; department_id: string; profiles: { full_name: string } | null } | null;
};

function FeesPage() {
  const { primaryRole, userId } = useAuth();
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [edit, setEdit] = useState<Record<string, { total: string; paid: string }>>({});
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);

  const load = async () => {
    if (primaryRole === "student" && userId) {
      const { data } = await supabase.from("fees").select("*").eq("student_id", userId);
      setRows((data as FeeRow[]) ?? []);
    } else {
      const { data } = await supabase.from("fees").select("*, students(roll_no, section, year, department_id, profiles(full_name))").order("updated_at", { ascending: false });
      setRows((data as unknown as FeeRow[]) ?? []);
    }
  };
  useEffect(() => { load(); }, [primaryRole, userId]);

  const filteredRows = primaryRole === "student" ? rows : rows.filter((r) => {
    const s = r.students;
    if (!s) return scope.department_id === "all" && scope.year === "all" && scope.section === "all";
    if (scope.department_id !== "all" && s.department_id !== scope.department_id) return false;
    if (scope.year !== "all" && s.year !== Number(scope.year)) return false;
    if (scope.section !== "all" && s.section !== scope.section) return false;
    return true;
  });

  const totalAll = filteredRows.reduce((a, r) => a + Number(r.total_fee), 0);
  const paidAll = filteredRows.reduce((a, r) => a + Number(r.paid_amount), 0);
  const dueAll = totalAll - paidAll;

  const save = async (id: string) => {
    const e = edit[id]; if (!e) return;
    const { error } = await supabase.from("fees").update({ total_fee: Number(e.total), paid_amount: Number(e.paid), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Updated"); setEdit((s) => { const n = { ...s }; delete n[id]; return n; }); load(); }
  };

  if (primaryRole === "student") {
    return (
      <div>
        <PageHeader title="My fees" description="Your fee statement" />
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={`₹${totalAll.toLocaleString()}`} />
          <StatCard label="Paid" value={`₹${paidAll.toLocaleString()}`} accent="success" />
          <StatCard label="Due" value={`₹${dueAll.toLocaleString()}`} accent={dueAll > 0 ? "destructive" : "success"} />
        </div>
        <div className="mt-4 rounded-xl border bg-card divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">{r.semester}</div>
                <div className="text-xs text-muted-foreground">Total ₹{Number(r.total_fee).toLocaleString()} · Paid ₹{Number(r.paid_amount).toLocaleString()}</div>
              </div>
              <div className={`text-sm font-semibold ${Number(r.due_amount) > 0 ? "text-destructive" : "text-success"}`}>₹{Number(r.due_amount).toLocaleString()} due</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allow={["admin", "hod"]}>
      <PageHeader title="Fees" description={primaryRole === "admin" ? "Manage all student fees" : "View department fees"} />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total billed" value={`₹${totalAll.toLocaleString()}`} />
        <StatCard label="Collected" value={`₹${paidAll.toLocaleString()}`} accent="success" />
        <StatCard label="Outstanding" value={`₹${dueAll.toLocaleString()}`} accent="destructive" />
      </div>
      <div className="mt-4 rounded-xl border bg-card p-3">
        <ScopeFilters scope={scope} onChange={setScope} />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="divide-y">
          {filteredRows.map((r) => {
            const e = edit[r.id];
            return (
              <div key={r.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="text-sm font-medium">{r.students?.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.students?.roll_no} · {r.semester}</div>
                </div>
                <div className="flex items-center gap-2">
                  {primaryRole === "admin" && e ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Total</Label>
                        <Input type="number" value={e.total} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, total: ev.target.value } })} className="h-9 w-24" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Paid</Label>
                        <Input type="number" value={e.paid} onChange={(ev) => setEdit({ ...edit, [r.id]: { ...e, paid: ev.target.value } })} className="h-9 w-24" />
                      </div>
                      <Button size="sm" onClick={() => save(r.id)}>Save</Button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Due</div>
                        <div className={`text-sm font-semibold ${Number(r.due_amount) > 0 ? "text-destructive" : "text-success"}`}>₹{Number(r.due_amount).toLocaleString()}</div>
                      </div>
                      {primaryRole === "admin" && (
                        <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, [r.id]: { total: String(r.total_fee), paid: String(r.paid_amount) } })}>Edit</Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No fee records yet.</p>}
        </div>
      </div>
    </RoleGuard>
  );
}
