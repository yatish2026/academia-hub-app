import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { DAYS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/timetable")({
  head: () => ({ meta: [{ title: "Timetable — AcademiaHub" }] }),
  component: TimetablePage,
});

type Row = { id: string; day_of_week: number; time_slot: string; subject: string; section: string; faculty_id: string | null; approved: boolean };

function TimetablePage() {
  const { primaryRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data } = await supabase.from("timetable").select("id, day_of_week, time_slot, subject, section, faculty_id, approved").order("day_of_week").order("time_slot");
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const slots = Array.from(new Set(rows.map((r) => r.time_slot))).sort();
  const canApprove = primaryRole === "hod" || primaryRole === "admin";
  const pending = rows.filter((r) => !r.approved);

  const approveAll = async () => {
    const ids = pending.map((p) => p.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("timetable").update({ approved: true }).in("id", ids);
    if (error) toast.error(error.message); else { toast.success(`Approved ${ids.length} entries`); load(); }
  };

  const toggleApprove = async (id: string, approved: boolean) => {
    const { error } = await supabase.from("timetable").update({ approved: !approved }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <div>
      <PageHeader
        title="Timetable"
        description={canApprove && pending.length > 0 ? `${pending.length} entries pending approval` : "Weekly schedule"}
        action={canApprove && pending.length > 0 && (
          <Button onClick={approveAll}><CheckCircle2 className="mr-1 h-4 w-4" /> Approve all</Button>
        )}
      />
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</th>
              {[1, 2, 3, 4, 5, 6].map((d) => (
                <th key={d} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{DAYS[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No timetable entries yet.</td></tr>
            )}
            {slots.map((slot) => (
              <tr key={slot} className="border-t">
                <td className="px-3 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{slot}</td>
                {[1, 2, 3, 4, 5, 6].map((d) => {
                  const cell = rows.find((r) => r.day_of_week === d && r.time_slot === slot);
                  return (
                    <td key={d} className="px-3 py-3 align-top">
                      {cell ? (
                        <button
                          disabled={!canApprove}
                          onClick={() => canApprove && toggleApprove(cell.id, cell.approved)}
                          className={`w-full rounded-md border-l-4 bg-muted/40 p-2 text-left text-xs transition-colors ${cell.approved ? "border-success" : "border-warning"} ${canApprove ? "hover:bg-muted" : ""}`}
                        >
                          <div className="font-medium text-foreground">{cell.subject}</div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span>Sec {cell.section}</span>
                            {!cell.approved && <Clock className="h-3 w-3 text-warning" />}
                          </div>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

