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
import { CheckCircle2, Clock, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScopeFilters, ALL_SCOPE, type Scope } from "@/components/ScopeFilters";

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
type Student = { id: string; roll_no: string; section: string; year: number; full_name: string };

function TimetablePage() {
  const { primaryRole, profile, userId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [faculty, setFaculty] = useState<Record<string, string>>({});
  const [facultyList, setFacultyList] = useState<FacultyOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [markCell, setMarkCell] = useState<Row | null>(null);
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
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
    // Realtime: refresh when timetable changes
    const ch = supabase
      .channel("timetable-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "timetable" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryRole, profile?.department_id]);

  const addEntry = async () => {
    if (!form.subject.trim() || !profile?.department_id || !userId) {
      toast.error("Fill subject, and ensure you are in a department");
      return;
    }
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
    if (!window.confirm("Delete this class?")) return;
    const { error } = await supabase.from("timetable").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
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

  if (primaryRole === "student") {
    return <StudentTimetable rows={rows} faculty={faculty} userId={userId!} />;
  }

  // Faculty / HOD / Admin: weekly grid
  // Faculty sees ONLY their own classes; HOD/Admin see whole department
  let visibleRows = primaryRole === "faculty"
    ? rows.filter((r) => r.faculty_id === userId)
    : rows;
  if (scope.department_id !== "all") visibleRows = visibleRows.filter((r) => r.department_id === scope.department_id);
  if (scope.year !== "all") visibleRows = visibleRows.filter((r) => r.year === Number(scope.year));
  if (scope.section !== "all") visibleRows = visibleRows.filter((r) => r.section === scope.section);

  const slotKeys = Array.from(
    new Set(visibleRows.map((r) => `${r.start_time ?? ""}|${r.end_time ?? ""}`).filter((k) => k !== "|"))
  ).sort();

  const canMarkAttendance = primaryRole === "faculty";

  return (
    <div>
      <PageHeader
        title="Weekly timetable"
        description={
          canApprove && pending.length > 0
            ? `${pending.length} entries pending approval`
            : canMarkAttendance
            ? "Tap a class to mark attendance"
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

      <div className="mb-3 rounded-xl border bg-card p-3">
        <ScopeFilters scope={scope} onChange={setScope} />
      </div>

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
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No timetable entries yet.</td></tr>
            )}
            {slotKeys.map((key) => {
              const [start, end] = key.split("|");
              return (
                <tr key={key} className="border-t">
                  <td className="px-3 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {fmtTime(start)}<br /><span className="text-[10px]">{fmtTime(end)}</span>
                  </td>
                  {[1, 2, 3, 4, 5, 6].map((d) => {
                    const cells = visibleRows.filter((r) => r.day_of_week === d && r.start_time === start && r.end_time === end);
                    return (
                      <td key={d} className="px-3 py-3 align-top">
                        {cells.length === 0 ? (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        ) : (
                          <div className="space-y-1">
                            {cells.map((cell) => {
                              const isMine = cell.faculty_id === userId;
                              const clickable = canMarkAttendance && isMine;
                              return (
                                <div
                                  key={cell.id}
                                  className={`group rounded-md border-l-4 bg-muted/40 p-2 text-xs ${cell.approved ? "border-success" : "border-warning"} ${clickable ? "cursor-pointer hover:bg-primary/10 transition-colors" : ""}`}
                                  onClick={() => clickable && setMarkCell(cell)}
                                  role={clickable ? "button" : undefined}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="font-medium text-foreground">{cell.subject}</div>
                                    {canEdit && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); remove(cell.id); }}
                                        className="text-muted-foreground hover:text-destructive"
                                        aria-label="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
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
                                      onClick={(e) => { e.stopPropagation(); toggleApprove(cell.id, cell.approved); }}
                                      className="mt-1 inline-flex items-center gap-1 text-warning hover:underline disabled:no-underline disabled:cursor-not-allowed"
                                    >
                                      <Clock className="h-3 w-3" /> Pending
                                    </button>
                                  )}
                                  {clickable && cell.approved && (
                                    <div className="mt-1 text-[10px] text-primary">Tap to mark attendance →</div>
                                  )}
                                </div>
                              );
                            })}
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

      {markCell && (
        <MarkAttendanceSheet
          cell={markCell}
          onClose={() => setMarkCell(null)}
          facultyId={userId!}
        />
      )}
    </div>
  );
}

function MarkAttendanceSheet({ cell, onClose, facultyId }: { cell: Row; onClose: () => void; facultyId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  // undefined = not marked, "present" = green, "absent" = red
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
      // Start with NO marks; tap to set present, tap again toggles absent, again clears.
      const def: Record<string, "present" | "absent" | undefined> = {};
      // Load existing marks if any
      const { data: existing } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("subject", cell.subject)
        .eq("date", date);
      for (const e of existing ?? []) def[e.student_id] = e.status as "present" | "absent";
      setMarks(def);
      setLoading(false);
    })();
  }, [cell.id, date]);

  // Click cycles: undefined → present → absent → undefined
  const cycle = (id: string) =>
    setMarks((m) => {
      const cur = m[id];
      const next = cur === undefined ? "present" : cur === "present" ? "absent" : undefined;
      return { ...m, [id]: next };
    });

  const submit = async () => {
    // Unmarked students are auto-marked absent on submit
    const rows = students.map((s) => ({
      student_id: s.id,
      faculty_id: facultyId,
      subject: cell.subject,
      date,
      status: (marks[s.id] ?? "absent") as "present" | "absent",
    }));
    setSaving(true);
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,subject,date" });
    setSaving(false);
    if (error) return toast.error(error.message);
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

function StudentTimetable({ rows, faculty, userId }: { rows: Row[]; faculty: Record<string, string>; userId: string }) {
  const { profile } = useAuth();
  const [me, setMe] = useState<{ year: number; section: string } | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("year, section")
        .eq("id", userId)
        .maybeSingle();
      if (data) setMe({ year: data.year, section: data.section });
    })();
  }, [userId]);
  const [dow, setDow] = useState<number>(() => {
    const d = todayDow();
    return d >= 1 && d <= 6 ? d : 1;
  });
  const dayRows = rows
    .filter((r) => r.day_of_week === dow)
    .filter((r) => !profile?.department_id || r.department_id === profile.department_id)
    .filter((r) => !me || (r.year === me.year && r.section === me.section))
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string | null) => {
    if (!t) return -1;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const isToday = dow === todayDow();

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
                {!r.approved && <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">Tentative</span>}
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
