import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, School } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/colleges")({
  head: () => ({ meta: [{ title: "Colleges — AcademiaHub" }] }),
  component: CollegesPage,
});

type College = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

function CollegesPage() {
  const { userId } = useAuth();
  const [colleges, setColleges] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });

  const load = async () => {
    const { data } = await supabase.from("colleges").select("*").order("created_at", { ascending: false });
    setColleges(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Name and code required");
    
    setSubmitting(true);
    const { error } = await supabase.from("colleges").insert({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      created_by: userId
    });
    
    setSubmitting(false);
    if (error) return toast.error(error.message);
    
    toast.success("College created");
    setOpen(false);
    setForm({ name: "", code: "" });
    load();
  };

  return (
    <RoleGuard allow={["super_admin"]}>
      <PageHeader
        title="Colleges"
        description="Manage institutions using AcademiaHub"
        action={
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New college</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Register college</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="name">College Name</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. S.V. College of Engineering" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="code">College Code (Unique)</Label>
                  <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SVCET123" />
                  <p className="text-[11px] text-muted-foreground">Users will use this code to log in.</p>
                </div>
                <Button className="w-full" onClick={submit} disabled={submitting}>
                  {submitting ? "Registering…" : "Register college"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {colleges.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">No colleges registered yet.</div>
        )}
        {colleges.map((c) => (
          <div key={c.id} className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-card transition-all hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <School className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{c.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">CODE: {c.code}</span>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              Registered on {new Date(c.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </RoleGuard>
  );
}
