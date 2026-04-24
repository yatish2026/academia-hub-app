import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { DAYS, fmtTime, todayDow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/timetable")({
  head: () => ({ meta: [{ title: "Timetable — AcademiaHub" }] }),
  component: TimetablePage,
});

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

type FacultyOpt = { id: string; full_name: string };

function TimetablePage() {
  const { primaryRole, profile, userId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [faculty, setFaculty] = useState<Record<string, string>>({});
  const [facultyList, setFacultyList] = useState<FacultyOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    day_of_week: "1",
    start_time: "09:00",
    end_time: "09:50",
    subject: "",
    section: "A",
    year: "1",
    faculty_id: "",
  });

  const canEdit = primaryRole === "hod" || primaryRole === "faculty" || primaryRole === "admin";
  const canApprove = primaryRole === "hod" || primaryRole === "admin";

  const load = async () => {
    const { data } = await supabase
      .from("timetable")
      .select("id, day_of_week, start_time, end_time, subject, section, year, faculty_id, department_id, approved")
      .order("day_of_week")
      .order("start_time");
    setRows((data as Row[]) ?? []);
    // resolve faculty names
    const ids = Array.from(new Set((data ?? []).map((r) => r.faculty_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of profs ?? []) map[p.id] = p.full_name;
      setFaculty(map);
    }
  };

  const loadFacultyList = async () => {
    if (!profile?.department_id) return;
    const { data: facs } = await supabase
      .from("faculty")
      .select("id")
      .eq("department_id", profile.department_id);
    const ids = (facs ?? []).map((f) => f.id);
    if (ids.length === 0) { setFacultyList([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    setFacultyList((profs ?? []).map((p) => ({ id: p.id, full_name: p.full_name })));
  };

  useEffect(() => {
    load();
    if (canEdit) loadFacultyList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryRole, profile?.department_id]);

  const addEntry = async () => {
    if (!form.subject.trim() || !profile?.department_id || !userId) {
      toast.error("Fill subject, and ensure you are in a department");
      return;
    }
    // faculty_id must reference an existing faculty row, or be null.
    let facultyId: string | null = form.faculty_id?.trim() ? form.faculty_id : null;
    if (!facultyId && primaryRole === "faculty") facultyId = userId;
    const insertRow = {
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      subject: form.subject.trim(),
      section: form.section,
      year: Number(form.year),
      department_id: profile.department_id,
      faculty_id: facultyId,
      approved: primaryRole === "hod" || primaryRole === "admin",
    };
    const { error } = await supabase.from("timetable").insert(insertRow);
    if (error) return toast.error(error.message);
    toast.success("Entry added");
    setOpen(false);
    setForm({ ...form, subject: "" });
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("timetable").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const toggleApprove = async (id: string, approved: boolean) => {
    const { error } = await supabase.from("timetable").update({ approved: !approved }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const pending = rows.filter((r) => !r.approved);
  const approveAll = async () => {
    if (pending.length === 0) return;
    const ids = pending.map((p) => p.id);
    const { error } = await supabase.from("timetable").update({ approved: true }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`Approved ${ids.length} entries`); load(); }
  };

  // Student view = pick any day (default today) with prev/next navigation
  if (primaryRole === "student") {
    return <StudentTimetable rows={rows} faculty={faculty} />;
  }

  // Faculty / HOD / Admin: weekly grid + add form
  // Build unique slots
  const slotKeys = Array.from(
    new Set(rows.map((r) => `${r.start_time ?? ""}|${r.end_time ?? ""}`).filter((k) => k !== "|"))
  ).sort();

  return (
    <div>
      <PageHeader
        title="Weekly timetable"
        description={
          canApprove && pending.length > 0
            ? `${pending.length} entries pending approval — repeats every week`
            : "Set once, repeats every week"
        }
        action={
          <div className="flex gap-2">
            {canApprove && pending.length > 0 && (
              <Button variant="outline" onClick={approveAll}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve all
              </Button>
            )}
            {canEdit && (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button><Plus className="mr-1 h-4 w-4" /> Add entry</Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader><SheetTitle>Add timetable entry</SheetTitle></SheetHeader>
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-1.5">
                      <Label>Subject</Label>
                      <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Operating Systems" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5">
                        <Label>Day</Label>
                        <Select value={form.day_of_week} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6].map((d) => <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Year</Label>
                        <Select value={form.year} onValueChange={(v) => setForm({ ...form, year: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5"><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Section</Label>
                      <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Faculty</Label>
                      <Select value={form.faculty_id} onValueChange={(v) => setForm({ ...form, faculty_id: v })}>
                        <SelectTrigger><SelectValue placeholder={primaryRole === "faculty" ? "Defaults to me" : "Pick faculty"} /></SelectTrigger>
                        <SelectContent>
                          {facultyList.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={addEntry}>Add entry</Button>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        }
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
            {slotKeys.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No timetable entries yet. Click "Add entry" to start.</td></tr>
            )}
            {slotKeys.map((key) => {
              const [start, end] = key.split("|");
              return (
                <tr key={key} className="border-t">
                  <td className="px-3 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {fmtTime(start)}<br /><span className="text-[10px]">{fmtTime(end)}</span>
                  </td>
                  {[1, 2, 3, 4, 5, 6].map((d) => {
                    const cells = rows.filter((r) => r.day_of_week === d && r.start_time === start && r.end_time === end);
                    return (
                      <td key={d} className="px-3 py-3 align-top">
                        {cells.length === 0 ? (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        ) : (
                          <div className="space-y-1">
                            {cells.map((cell) => (
                              <div
                                key={cell.id}
                                className={`group rounded-md border-l-4 bg-muted/40 p-2 text-xs ${cell.approved ? "border-success" : "border-warning"}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="font-medium text-foreground">{cell.subject}</div>
                                  {canEdit && (
                                    <button onClick={() => remove(cell.id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete">
                                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>Sec {cell.section} · Y{cell.year}</span>
                                </div>
                                <div className="text-muted-foreground truncate">{faculty[cell.faculty_id ?? ""] ?? "—"}</div>
                                {!cell.approved && (
                                  <button
                                    disabled={!canApprove}
                                    onClick={() => toggleApprove(cell.id, cell.approved)}
                                    className="mt-1 inline-flex items-center gap-1 text-warning hover:underline disabled:no-underline disabled:cursor-not-allowed"
                                  >
                                    <Clock className="h-3 w-3" /> Pending
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentTimetable({ rows, faculty }: { rows: Row[]; faculty: Record<string, string> }) {
  const [dow, setDow] = useState<number>(() => {
    const d = todayDow();
    return d >= 1 && d <= 6 ? d : 1;
  });
  const dayRows = rows
    .filter((r) => r.day_of_week === dow && r.approved)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string | null) => {
    if (!t) return -1;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const isToday = dow === todayDow();

  // Build display list with break/lunch markers between classes (10 min short break, 1hr lunch)
  type Item = { kind: "class"; row: Row } | { kind: "break"; label: string; start: number; end: number };
  const items: Item[] = [];
  dayRows.forEach((r, i) => {
    items.push({ kind: "class", row: r });
    const end = toMin(r.end_time);
    const next = dayRows[i + 1];
    if (next) {
      const nextStart = toMin(next.start_time);
      const gap = nextStart - end;
      if (gap >= 50) items.push({ kind: "break", label: "Lunch", start: end, end: nextStart });
      else if (gap >= 10) items.push({ kind: "break", label: "Short break", start: end, end: nextStart });
    }
  });

  const prev = () => setDow((d) => (d <= 1 ? 6 : d - 1));
  const next = () => setDow((d) => (d >= 6 ? 1 : d + 1));

  return (
    <div>
      <PageHeader
        title="My timetable"
        description={isToday ? `Today · ${DAYS[dow]}` : DAYS[dow]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prev}>← Prev</Button>
            <Select value={String(dow)} onValueChange={(v) => setDow(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((d) => <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={next}>Next →</Button>
          </div>
        }
      />
      {dayRows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No classes scheduled for {DAYS[dow]}.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => {
            if (it.kind === "break") {
              return (
                <div key={`b-${idx}`} className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  <span className="font-medium">{it.label}</span>
                  <span className="opacity-70">{Math.round(it.end - it.start)} min</span>
                </div>
              );
            }
            const r = it.row;
            const start = toMin(r.start_time);
            const end = toMin(r.end_time);
            const isCurrent = isToday && start <= nowMin && nowMin < end;
            const isUpcoming = isToday && start > nowMin;
            const isPast = isToday && end <= nowMin;
            return (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-xl border-l-4 bg-card p-4 shadow-soft transition-opacity ${
                  isCurrent ? "border-success ring-1 ring-success/20" : isUpcoming ? "border-primary" : isPast ? "border-muted opacity-60" : "border-primary/40"
                }`}
              >
                <div className="min-w-[90px] text-xs font-medium text-muted-foreground">
                  {fmtTime(r.start_time)}<br />
                  <span className="text-[10px]">to {fmtTime(r.end_time)}</span>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{r.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {faculty[r.faculty_id ?? ""] ?? "—"} · Sec {r.section} · Year {r.year}
                  </div>
                </div>
                {isCurrent && <span className="rounded-full bg-success/10 px-2 py-1 text-[11px] font-medium text-success">Now</span>}
                {isUpcoming && <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">Upcoming</span>}
                {isPast && <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Done</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
