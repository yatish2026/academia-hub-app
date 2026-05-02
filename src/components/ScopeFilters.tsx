import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Scope = {
  department_id: string; // "all" or id
  year: string; // "all" or "1".."4"
  section: string; // "all" or letter
};

export const ALL_SCOPE: Scope = { department_id: "all", year: "all", section: "all" };

type Dept = { id: string; name: string };

/**
 * Filters for department / year / section.
 * - Admin: can pick any department.
 * - HOD / Faculty: department is locked to their own.
 * - Student: not rendered (caller should hide).
 */
export function ScopeFilters({
  scope,
  onChange,
  showSection = true,
  showYear = true,
}: {
  scope: Scope;
  onChange: (s: Scope) => void;
  showSection?: boolean;
  showYear?: boolean;
}) {
  const { primaryRole, profile } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      setDepts(data ?? []);
    })();
  }, []);

  // Auto-select user's department if not admin
  useEffect(() => {
    if (primaryRole !== "admin" && profile?.department_id && scope.department_id === "all") {
      onChange({ ...scope, department_id: profile.department_id });
    }
  }, [primaryRole, profile?.department_id, scope.department_id, onChange]);


  const lockDept = primaryRole !== "admin";

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Department</Label>
        <Select
          value={scope.department_id}
          onValueChange={(v) => onChange({ ...scope, department_id: v })}
          disabled={lockDept}
        >
          <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            {!lockDept && <SelectItem value="all">All departments</SelectItem>}
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {showYear && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Year</Label>
          <Select value={scope.year} onValueChange={(v) => onChange({ ...scope, year: v })}>
            <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {[1, 2, 3, 4].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {showSection && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Section</Label>
          <Select value={scope.section} onValueChange={(v) => onChange({ ...scope, section: v })}>
            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {["A", "B", "C", "D"].map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
