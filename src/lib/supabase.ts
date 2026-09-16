import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

export async function requireApprovedOwner(session: Session): Promise<boolean> {
  if (!supabase || !session.user) return false;
  const { data, error } = await supabase.rpc("is_current_user_owner");
  if (error || data !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return false;
  }
  return true;
}

export function authRedirect(path: string): string {
  const root = `${window.location.origin}${window.location.pathname}`;
  return `${root}#/${path.replace(/^\//, "")}`;
}
