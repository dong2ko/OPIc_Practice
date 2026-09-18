import { createClient } from "npm:@supabase/supabase-js@2";
import { createAskHandler } from "./handler.ts";

Deno.serve(createAskHandler({
  apiKey: Deno.env.get("GEMINI_API_KEY"),
  model: Deno.env.get("GEMINI_MODEL"),
  backend(authorization) {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    );
    return {
      async authenticate() {
        const { data, error } = await client.auth.getUser();
        return !error && Boolean(data.user);
      },
      async isOwner() {
        const { data, error } = await client.rpc("is_current_user_owner");
        return !error && data === true;
      },
      async search(query) {
        const { data, error } = await client.rpc("search_study_materials", { search_query: query });
        if (error) throw error;
        return data ?? [];
      },
      async consumeQuota() {
        const { data, error } = await client.rpc("consume_rag_request");
        if (error) throw error;
        return data === true;
      },
    };
  },
}));
