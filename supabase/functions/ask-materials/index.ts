import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const authorization = request.headers.get("authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers });
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !publishableKey) return new Response(JSON.stringify({ error: "Backend configuration is incomplete" }), { status: 503, headers });
  const client = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers });
  const { data: approved, error: ownerError } = await client.rpc("is_current_user_owner");
  if (ownerError || approved !== true) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers });
  return new Response(JSON.stringify({
    status: "not_configured",
    message: "RAG is disabled until an AI provider, model, budget, and private-data processing permission are configured.",
  }), { status: 501, headers });
});
