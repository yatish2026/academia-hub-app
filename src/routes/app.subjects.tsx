import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/subjects")({
  head: () => ({ meta: [{ title: "Subjects — AcademiaHub" }] }),
  component: SubjectsPage,
});

type Faculty = { id: string; employee_no: string; subjects: string[]; full_name: string };

function SubjectsPage() {
  const { profile, primaryRole } = useAuth();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = async () => {
    let q = supabase.from("faculty").select("id, employee_no, subjects, department_id");
    if (primaryRole === "hod" && profile?.department_id) {
      q = q.eq("department_id", profile.department_id);
    }
    const { data: facs } = await q;
    const ids = (facs ?? []).map((f) => f.id);
    if (ids.length === 0) { setFaculty([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const nameMap: Record<string, string> = {};
    for (const p of profs ?? []) nameMap[p.id] = p.full_name;
    setFaculty(
      (facs ?? []).map((f) => ({
        id: f.id,
        employee_no: f.employee_no,
        subjects: f.subjects ?? [],
        full_name: nameMap[f.id] ?? "—",
      }))
    );
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [primaryRole, profile?.department_id]);

  const addSubject = async (f: Faculty) => {
    const sub = (draft[f.id] ?? "").trim();
    if (!sub) return;
    if (f.subjects.includes(sub)) return toast.error("Already assigned");
    const next = [...f.subjects, sub];
    const { error } = await supabase.from("faculty").update({ subjects: next }).eq("id", f.id);
    if (error) return toast.error(error.message);
    setDraft({ ...draft, [f.id]: "" });
    load();
  };

  const removeSubject = async (f: Faculty, sub: string) => {
    const next = f.subjects.filter((s) => s !== sub);
    const { error } = await supabase.from("faculty").update({ subjects: next }).eq("id", f.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <RoleGuard allow={["admin", "hod"]}>
      <PageHeader
        title="Subjects"
        description="Assign subjects to each faculty. Faculty will see these in their attendance dropdown."
      />
      <div className="space-y-3">
        {faculty.length === 0 && (
          <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            No faculty in your department yet.
          </p>
        )}
        {faculty.map((f) => (
          <div key={f.id} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.full_name}</div>
                <div className="text-xs text-muted-foreground">{f.employee_no}</div>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {f.subjects.length === 0 && (
                <span className="text-xs text-muted-foreground">No subjects assigned yet.</span>
              )}
              {f.subjects.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {s}
                  <button
                    onClick={() => removeSubject(f, s)}
                    className="rounded-full hover:bg-primary/20"
                    aria-label={`Remove ${s}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Operating Systems"
                value={draft[f.id] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") addSubject(f); }}
              />
              <Button size="sm" onClick={() => addSubject(f)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </RoleGuard>
  );
}
