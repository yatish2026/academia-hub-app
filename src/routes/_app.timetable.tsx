import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DAYS } from "@/lib/types";

export const Route = createFileRoute("/_app/timetable")({
  head: () => ({ meta: [{ title: "Timetable — AcademiaHub" }] }),
  component: TimetablePage,
});

type Row = { id: string; day_of_week: number; time_slot: string; subject: string; section: string; faculty_id: string | null; approved: boolean };

function TimetablePage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("timetable").select("id, day_of_week, time_slot, subject, section, faculty_id, approved").order("day_of_week").order("time_slot");
      setRows(data ?? []);
    })();
  }, []);

  const slots = Array.from(new Set(rows.map((r) => r.time_slot))).sort();

  return (
    <div>
      <PageHeader title="Timetable" description="Weekly schedule" />
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
                        <div className={`rounded-md border-l-4 bg-muted/40 p-2 text-xs ${cell.approved ? "border-success" : "border-warning"}`}>
                          <div className="font-medium text-foreground">{cell.subject}</div>
                          <div className="text-muted-foreground">Sec {cell.section}</div>
                        </div>
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
