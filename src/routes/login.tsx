import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth-store";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — AcademiaHub" },
      { name: "description", content: "Sign in to your AcademiaHub account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, init, userId, initialized, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    if (initialized && userId) navigate({ to: "/dashboard" });
  }, [initialized, userId, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await signIn(email, password);
    if (res.error) setError(res.error);
    else navigate({ to: "/dashboard" });
  };

  const fillDemo = (role: string) => {
    setEmail(`${role}@academia.test`);
    setPassword("Password123!");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AcademiaHub</h1>
          <p className="mt-1 text-sm text-muted-foreground">College Management ERP</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-card space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <div className="pt-2">
            <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">Demo accounts</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["admin", "hod", "faculty", "student"].map((r) => (
                <button key={r} type="button" onClick={() => fillDemo(r)} className="rounded-md border bg-background px-3 py-2 text-xs font-medium capitalize hover:bg-accent">
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Password: Password123!</p>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">← Back home</Link>
        </p>
      </div>
    </div>
  );
}
