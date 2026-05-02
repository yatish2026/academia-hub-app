import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fmtTime } from "@/lib/types";

type Row = {
  id: string;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  subject: string;
  section: string;
  year: number;
  faculty_id: string | null;
  department_id: string;
  approved: boolean;
};

type Student = { id: string; roll_no: string; section: string; year: number; full_name: string };

export function MarkAttendanceSheet({ cell, onClose, facultyId }: { cell: Row; onClose: () => void; facultyId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, "present" | "absent" | undefined>>({});
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: studs } = await supabase
        .from("students")
        .select("id, roll_no, section, year")
        .eq("department_id", cell.department_id)
        .eq("section", cell.section)
        .eq("year", cell.year)
        .order("roll_no");
      
      const ids = (studs ?? []).map((s) => s.id);
      const nameMap: Record<string, string> = {};
      
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profs ?? []) nameMap[p.id] = p.full_name;
      }
      
      const list: Student[] = (studs ?? []).map((s) => ({
        id: s.id,
        roll_no: s.roll_no,
        section: s.section,
        year: s.year,
        full_name: nameMap[s.id] ?? "—",
      }));
      
      setStudents(list);
      
      const def: Record<string, "present" | "absent" | undefined> = {};
      const { data: existing } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("subject", cell.subject)
        .eq("date", date);
      
      for (const e of existing ?? []) def[e.student_id] = e.status as "present" | "absent";
      setMarks(def);
      setLoading(false);
    })();
  }, [cell.id, date, cell.subject, cell.department_id, cell.section, cell.year]);

  const cycle = (id: string) =>
    setMarks((m) => {
      const cur = m[id];
      const next = cur === undefined ? "present" : cur === "present" ? "absent" : undefined;
      return { ...m, [id]: next };
    });

  const submit = async () => {
    const rows = students.map((s) => ({
      student_id: s.id,
      faculty_id: facultyId,
      subject: cell.subject,
      date,
      status: (marks[s.id] ?? "absent") as "present" | "absent",
    }));
    
    setSaving(true);
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,subject,date" });
    setSaving(true); // Keep spinner while closing
    
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    
    const present = rows.filter((r) => r.status === "present").length;
    toast.success(`Saved · ${present}/${rows.length} present`);
    onClose();
  };

  const presentCount = students.filter((s) => marks[s.id] === "present").length;
  const absentCount = students.filter((s) => marks[s.id] === "absent").length;
  const unmarkedCount = students.length - presentCount - absentCount;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{cell.subject}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Sec {cell.section} · Year {cell.year} · {fmtTime(cell.start_time)} – {fmtTime(cell.end_time)}
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium text-success">{presentCount} present</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium text-destructive">{absentCount} absent</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{unmarkedCount} unmarked</span>
            <div className="mt-1 text-[11px] text-muted-foreground">Tap to mark present (green), tap again for absent (red). Unmarked become absent on submit.</div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading students…</p>
          ) : students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students found in {cell.section} · Year {cell.year}.
            </p>
          ) : (
            <div className="rounded-lg border divide-y">
              {students.map((s) => {
                const status = marks[s.id];
                const cls =
                  status === "present"
                    ? "bg-success/15 hover:bg-success/25"
                    : status === "absent"
                    ? "bg-destructive/15 hover:bg-destructive/25"
                    : "bg-card hover:bg-muted/50";
                return (
                  <button
                    key={s.id}
                    onClick={() => cycle(s.id)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${cls}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.roll_no} · {s.full_name}</div>
                    </div>
                    {status === "present" && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                    {status === "absent" && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                    {!status && <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          )}

          <Button className="w-full" onClick={submit} disabled={saving || loading || students.length === 0}>
            {saving ? "Saving…" : "Submit attendance"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
