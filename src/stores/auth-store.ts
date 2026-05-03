import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/types";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department_id: string | null;
  college_id: string | null;
  must_reset_password: boolean;
};

type College = {
  id: string;
  name: string;
  code: string;
};

type State = {
  initialized: boolean;
  loading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  college: College | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  mustReset: boolean;
};

type Actions = {
  init: () => Promise<void>;
  signIn: (email: string, password: string, collegeCode: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  completePasswordReset: () => Promise<void>;
};

const ROLE_PRIORITY: AppRole[] = ["super_admin", "admin", "hod", "faculty", "student"];

export const useAuth = create<State & Actions>((set, get) => ({
  initialized: false,
  loading: false,
  userId: null,
  email: null,
  profile: null,
  college: null,
  roles: [],
  primaryRole: null,
  mustReset: false,

  init: async () => {
    if (get().initialized) return;
    supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        set({ userId: null, email: null, profile: null, college: null, roles: [], primaryRole: null, mustReset: false });
      } else {
        set({ userId: session.user.id, email: session.user.email ?? null });
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
      supabase.from("profiles").select("*, college:colleges(*)").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);

    const roles = ((rolesRes.data ?? []).map((r) => r.role) as AppRole[]) ?? [];
    const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
    
    const profileData = profileRes.data as any;
    const profile = profileData ? {
      ...profileData,
      college: undefined
    } : null;
    
    const college = profileData?.college ?? null;

    set({ 
      profile, 
      college, 
      roles, 
      primaryRole, 
      mustReset: primaryRole === 'super_admin' ? false : (profile?.must_reset_password ?? false)
    });
  },

  signIn: async (email, password, collegeCode) => {
    set({ loading: true });
    const cleanCode = (collegeCode || "").trim().toUpperCase();
    
    // 1. Sign in with Supabase Auth first
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    
    if (authError) {
      set({ loading: false });
      return { error: authError.message };
    }

    // 2. Check roles - Super Admins bypass all college checks
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);
    
    const isSuperAdmin = (roles ?? []).some(r => r.role === 'super_admin');

    if (isSuperAdmin) {
      set({ loading: false });
      return {}; // Success! Global Admin bypasses college checks.
    }

    // 3. For regular users, verify college exists and matches
    const { data: college } = cleanCode 
      ? await supabase
          .from("colleges")
          .select("id, code")
          .eq("code", cleanCode)
          .maybeSingle()
      : { data: null };

    if (!college) {
      await supabase.auth.signOut();
      set({ loading: false });
      return { error: "Invalid college code" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("college_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile || profile.college_id !== college.id) {
      await supabase.auth.signOut();
      set({ loading: false });
      return { error: "You do not belong to this college" };
    }

    set({ loading: false });
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ userId: null, email: null, profile: null, college: null, roles: [], primaryRole: null, mustReset: false });
  },

  completePasswordReset: async () => {
    await supabase.rpc("complete_password_reset");
    await get().refresh();
  },
}));
