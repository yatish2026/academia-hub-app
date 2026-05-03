import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/app/notices")({
  head: () => ({ meta: [{ title: "Notices — AcademiaHub" }] }),
  component: NoticesPage,
});

type Notice = { id: string; title: string; content: string; created_by: string; created_at: string };

function NoticesPage() {
  const { primaryRole, userId } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const canPost = primaryRole === "admin" || primaryRole === "hod" || primaryRole === "faculty" || primaryRole === "super_admin";

  const load = async () => {
    const { data } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
    setNotices(data ?? []);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const submit = async () => {
    if (!title.trim() || !content.trim() || !userId) return;
    const { error } = await supabase.from("notices").insert({ title: title.trim(), content: content.trim(), created_by: userId });
    if (error) toast.error(error.message);
    else { toast.success("Notice posted"); setTitle(""); setContent(""); setShowForm(false); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Deleted");
  };

  return (
    <div>
      <PageHeader
        title="Notices"
        description="Latest announcements (live updates)"
        action={canPost && (
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="mr-1 h-4 w-4" /> New notice
          </Button>
        )}
      />

      {showForm && canPost && (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-soft space-y-3">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notice title" /></div>
          <div className="space-y-1.5"><Label>Content</Label><Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your message…" /></div>
          <div className="flex gap-2">
            <Button onClick={submit}>Post</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {notices.length === 0 && <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No notices yet.</p>}
        {notices.map((n) => (
          <article key={n.id} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-medium">{n.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{n.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{format(new Date(n.created_at), "PPP p")}</p>
                </div>
              </div>
              {(n.created_by === userId || primaryRole === "admin" || primaryRole === "super_admin") && (
                <button onClick={() => remove(n.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
