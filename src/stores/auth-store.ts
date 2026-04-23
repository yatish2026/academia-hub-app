import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/types";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department_id: string | null;
};

type State = {
  initialized: boolean;
  loading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
};

type Actions = {
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const ROLE_PRIORITY: AppRole[] = ["admin", "hod", "faculty", "student"];

export const useAuth = create<State & Actions>((set, get) => ({
  initialized: false,
  loading: false,
  userId: null,
  email: null,
  profile: null,
  roles: [],
  primaryRole: null,

  init: async () => {
    if (get().initialized) return;
    // Listener first
    supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        set({ userId: null, email: null, profile: null, roles: [], primaryRole: null });
      } else {
        set({ userId: session.user.id, email: session.user.email ?? null });
        // defer DB calls to avoid deadlock
        setTimeout(() => get().refresh(), 0);
      }
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      set({ userId: session.user.id, email: session.user.email ?? null });
      await get().refresh();
    }
    set({ initialized: true });
  },

  refresh: async () => {
    const uid = get().userId;
    if (!uid) return;
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    const roles = ((rolesRes.data ?? []).map((r) => r.role) as AppRole[]) ?? [];
    const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
    set({ profile: (profileRes.data as Profile) ?? null, roles, primaryRole });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) return { error: error.message };
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ userId: null, email: null, profile: null, roles: [], primaryRole: null });
  },
}));
