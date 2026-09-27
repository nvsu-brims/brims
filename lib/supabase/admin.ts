// Real path: lib/supabase/admin.ts
//
// Service-role Supabase client — SERVER ONLY. Used for Storage writes (item
// pictures). It bypasses Row Level Security, so it must never be imported by
// a client component and SUPABASE_SERVICE_ROLE_KEY must never be prefixed
// with NEXT_PUBLIC_. The cookie-bound client in lib/supabase/server.ts uses
// the publishable key and cannot write to Storage, so it is not used here.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}