/** Direct Postgres access to the `games` schema (which PostgREST does not expose). */
import postgres from "npm:postgres@3.4.5";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new Error("Server is missing SUPABASE_DB_URL");
  // prepare:false keeps this working through Supabase's transaction pooler too.
  client ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  return client;
}
