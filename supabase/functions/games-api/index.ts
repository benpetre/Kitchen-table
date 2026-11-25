/**
 * Supabase Edge Function: games-api
 *
 * The whole backend for Kitchen Table, the family daily-games app in games/.
 * One endpoint: POST { action, ...request } -> response JSON, or
 * { error } with a 4xx/5xx status. The request and response shapes are the
 * `Api` interface in types.ts (mirrored at games/src/types.ts).
 *
 *   join / profile        who is playing (family join code -> player + token)
 *   daily                 the day's puzzles; starts generation if there are none
 *   submit                record a finished game (first result per day sticks)
 *   board                 family standings
 *   notes                 what the puzzle writer knows about the family
 *   cron                  pre-generate today's puzzles (pg_cron only; needs x-cron-secret)
 *
 * Deployed with verify_jwt off: players authenticate with the token `join`
 * hands out. Data lives in the `games` schema (see the 20261125120000 migration).
 */
import { db } from "./db.ts";
import { makeLlm } from "./llm.ts";
import { generateDaily, recentFrom } from "./generate.ts";
import type { Api, FamilyNotes, GameId, Player, PuzzleSet } from "./types.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const GAMES: GameId[] = ["rare", "word", "cross", "groups", "blocks", "trails", "atlas"];
const MAX_PLAYERS = 12;
/** A day counts as ready when at least this many of the seven games were made. */
const MIN_GAMES = 5;
const MAX_ATTEMPTS = 4;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Max-Age": "86400",
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const bad = (message: string, status = 400) => new HttpError(status, message);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    if (req.method !== "POST") throw bad("POST only", 405);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw bad("Body must be JSON"); }
    if (!body || typeof body !== "object") throw bad("Body must be a JSON object");
    switch (body.action) {
      case "join": return json(await join(body));
      case "profile": return json(await profile(body));
      case "daily": return json(await daily(body));
      case "submit": return json(await submit(body));
      case "board": return json(await board(body));
      case "notes": return json(await notes(body));
      case "cron": return json(await cron(req, body), 202);
      default: throw bad("Unknown action");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("games-api:", e);
    return json({ error: "Something went wrong on the server" }, 500);
  }
});

// ---------------------------------------------------------------- helpers

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const utcDate = (offsetDays = 0): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function dateArg(v: unknown): string {
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw bad("date must be YYYY-MM-DD");
  return v;
}
/** A player's "today" can be a day either side of the server's UTC date. */
const nearToday = (date: string): boolean => date >= utcDate(-1) && date <= utcDate(1);

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") throw bad(`${field} is required`);
  // Strip control characters; collapse runs of whitespace.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) throw bad(`${field} is required`);
  if ([...s].length > max) throw bad(`${field} must be at most ${max} characters`);
  return s;
}
const colorArg = (v: unknown): string => {
  if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad("color must look like #AABBCC");
  return v.toUpperCase();
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface PlayerRow { id: string; family_id: string; name: string; emoji: string; color: string; organizer: boolean }
const toPlayer = (r: PlayerRow): Player => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color, ...(r.organizer ? { organizer: true } : {}) });

async function auth(body: Record<string, unknown>): Promise<PlayerRow> {
  const token = body.token;
  if (typeof token !== "string" || token.length < 32 || token.length > 128) throw bad("Not signed in", 401);
  const rows = await db()<PlayerRow[]>`
    update games.players set last_seen_at = now()
    where token_hash = ${await sha256(token)}
    returning id, family_id, name, emoji, color, organizer`;
  if (!rows.length) throw bad("Not signed in", 401);
  return rows[0];
}

const emptyNotes = (n: Partial<FamilyNotes> | null | undefined): FamilyNotes => ({
  people: typeof n?.people === "string" ? n.people : "",
  watching: typeof n?.watching === "string" ? n.watching : "",
  events: typeof n?.events === "string" ? n.events : "",
});

// ---------------------------------------------------------------- join / profile

async function join(body: Record<string, unknown>): Promise<Api["join"]["res"]> {
  const code = text(body.code, "code", 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = text(body.name, "name", 20);
  const emoji = text(body.emoji, "emoji", 8);
  const color = colorArg(body.color);
  const deviceId = text(body.deviceId, "deviceId", 80);
  if (deviceId.length < 8) throw bad("deviceId is too short");

  const sql = db();
  const fam = await sql<{ id: string; name: string }[]>`select id, name from games.families where code = ${code}`;
  if (!fam.length) throw bad("That family code was not found", 404);
  const family = fam[0];
  const token = newToken();
  const hash = await sha256(token);

  const row = await sql.begin(async (tx) => {
    // One joiner at a time per family, so exactly one person becomes the organizer.
    await tx`select pg_advisory_xact_lock(hashtext(${family.id}))`;
    const existing = await tx<PlayerRow[]>`
      update games.players set token_hash = ${hash}, name = ${name}, emoji = ${emoji}, color = ${color}, last_seen_at = now()
      where family_id = ${family.id} and device_id = ${deviceId}
      returning id, family_id, name, emoji, color, organizer`;
    if (existing.length) return existing[0];
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from games.players where family_id = ${family.id}`;
    if (n >= MAX_PLAYERS) throw bad(`This family already has ${MAX_PLAYERS} players`, 409);
    const made = await tx<PlayerRow[]>`
      insert into games.players (family_id, device_id, token_hash, name, emoji, color, organizer)
      values (${family.id}, ${deviceId}, ${hash}, ${name}, ${emoji}, ${color}, ${n === 0})
      returning id, family_id, name, emoji, color, organizer`;
    return made[0];
  });
  return { token, player: toPlayer(row), family: { id: family.id, name: family.name } };
}

async function profile(body: Record<string, unknown>): Promise<Api["profile"]["res"]> {
  const me = await auth(body);
  const name = body.name === undefined ? me.name : text(body.name, "name", 20);
  const emoji = body.emoji === undefined ? me.emoji : text(body.emoji, "emoji", 8);
  const color = body.color === undefined ? me.color : colorArg(body.color);
  const rows = await db()<PlayerRow[]>`
    update games.players set name = ${name}, emoji = ${emoji}, color = ${color} where id = ${me.id}
    returning id, family_id, name, emoji, color, organizer`;
  return { player: toPlayer(rows[0]) };
}

// ---------------------------------------------------------------- daily

interface DailyRow { status: "generating" | "ready" | "failed"; theme: string | null; puzzles: PuzzleSet | null; attempts: number }

/**
 * Claims the right to generate (family, date): true if this caller should run
 * the generator. A row can be (re)claimed when it does not exist, when a
 * 'generating' row has had no heartbeat for 4 minutes, or a minute after a
 * failure - at most MAX_ATTEMPTS times per day in total.
 */
async function claim(familyId: string, date: string): Promise<number | null> {
  const rows = await db()<{ attempts: number }[]>`
    insert into games.daily as d (family_id, date, status, attempts, started_at, updated_at)
    values (${familyId}, ${date}, 'generating', 1, now(), now())
    on conflict (family_id, date) do update
      set status = 'generating', attempts = d.attempts + 1, started_at = now(), updated_at = now()
      where d.attempts < ${MAX_ATTEMPTS} and (
        (d.status = 'generating' and d.updated_at < now() - interval '4 minutes') or
        (d.status = 'failed' and d.updated_at < now() - interval '1 minute'))
    returning attempts`;
  return rows.length ? rows[0].attempts : null;
}

async function runGeneration(familyId: string, date: string, attemptNo: number): Promise<void> {
  const sql = db();
  // Only ever write to the row while this run still owns it.
  const mine = () => sql`family_id = ${familyId} and date = ${date} and attempts = ${attemptNo} and status = 'generating'`;
  const t0 = Date.now();
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Server is missing ANTHROPIC_API_KEY");
    const [fam] = await sql<{ name: string; notes: Partial<FamilyNotes> }[]>`select name, notes from games.families where id = ${familyId}`;
    if (!fam) throw new Error("family not found");
    const past = await sql<{ theme: string | null; puzzles: PuzzleSet | null }[]>`
      select theme, puzzles from games.daily
      where family_id = ${familyId} and status = 'ready' and date < ${date} and date >= ${addDays(date, -30)}
      order by date desc`;
    const out = await generateDaily({
      date,
      familyName: fam.name,
      notes: emptyNotes(fam.notes),
      recent: recentFrom(past),
      llm: makeLlm(apiKey),
      deadline: Date.now() + 300_000,
      onProgress: async () => { await sql`update games.daily set updated_at = now() where ${mine()}`; },
    });
    const made = GAMES.filter((g) => out.puzzles[g]);
    const status = made.length >= MIN_GAMES ? "ready" : "failed";
    await sql`
      update games.daily
      set status = ${status}, theme = ${out.theme || null}, puzzles = ${sql.json(out.puzzles as never)},
          meta = ${sql.json({ ...out.meta, made, totalMs: Date.now() - t0 } as never)}, updated_at = now()
      where ${mine()}`;
    console.log(`games-api: ${date} ${status} (${made.join(", ")})`, JSON.stringify(out.meta.errors));
  } catch (e) {
    console.error("games-api: generation failed", e);
    await sql`
      update games.daily set status = 'failed', meta = ${sql.json({ error: e instanceof Error ? e.message : String(e) })}, updated_at = now()
      where ${mine()}`.catch(() => {});
  }
}

function inBackground(work: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else work.catch(() => {});
}

async function daily(body: Record<string, unknown>): Promise<Api["daily"]["res"]> {
  const me = await auth(body);
  const date = dateArg(body.date);
  const sql = db();
  const read = () => sql<DailyRow[]>`select status, theme, puzzles, attempts from games.daily where family_id = ${me.family_id} and date = ${date}`;
  let [row] = await read();
  if (row?.status !== "ready") {
    // Puzzles are only ever made for the player's today (give or take a time zone).
    if (!nearToday(date)) {
      if (!row) throw bad("There are no puzzles for that date", 404);
    } else {
      const attemptNo = await claim(me.family_id, date);
      if (attemptNo !== null) {
        inBackground(runGeneration(me.family_id, date, attemptNo));
        [row] = await read();
      }
    }
  }
  if (!row) throw bad("There are no puzzles for that date", 404);
  if (row.status === "ready") return { status: "ready", date, ...(row.theme ? { theme: row.theme } : {}), puzzles: row.puzzles ?? {} };
  return { status: row.status, date };
}

// ---------------------------------------------------------------- submit

async function submit(body: Record<string, unknown>): Promise<Api["submit"]["res"]> {
  const me = await auth(body);
  const date = dateArg(body.date);
  // Results can arrive late (a phone that was offline), but not from the future
  // and not from more than a week back.
  if (date > utcDate(1) || date < utcDate(-7)) throw bad("That date is outside the window for recording results");
  const game = body.game as GameId;
  if (!GAMES.includes(game)) throw bad("Unknown game");
  const points = body.points;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > 100) throw bad("points must be a whole number from 0 to 100");
  let detail: unknown = null;
  if (body.detail !== undefined && body.detail !== null) {
    if (typeof body.detail !== "object" || Array.isArray(body.detail)) throw bad("detail must be an object");
    if (JSON.stringify(body.detail).length > 8000) throw bad("detail is too large");
    detail = body.detail;
  }
  const sql = db();
  const inserted = await sql`
    insert into games.results (player_id, family_id, date, game, points, detail)
    values (${me.id}, ${me.family_id}, ${date}, ${game}, ${points}, ${detail === null ? null : sql.json(detail as never)})
    on conflict (player_id, date, game) do nothing
    returning points`;
  if (inserted.length) return { points, duplicate: false };
  const [kept] = await sql<{ points: number }[]>`select points from games.results where player_id = ${me.id} and date = ${date} and game = ${game}`;
  return { points: kept.points, duplicate: true };
}

// ---------------------------------------------------------------- board

async function board(body: Record<string, unknown>): Promise<Api["board"]["res"]> {
  const me = await auth(body);
  const date = dateArg(body.date);
  const sql = db();
  // Monday-start week and calendar month containing the date.
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDays(date, -dow), weekEnd = addDays(weekStart, 6);
  const monthStart = `${date.slice(0, 7)}-01`;
  const [y, m] = date.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  type Total = { playerId: string; points: number; games: number };
  const totals = (from: string | null, to: string | null) => sql<Total[]>`
    select player_id as "playerId", sum(points)::int as points, count(*)::int as games
    from games.results
    where family_id = ${me.family_id}
      and (${from}::date is null or date >= ${from}::date) and (${to}::date is null or date <= ${to}::date)
    group by player_id order by points desc, games asc`;

  const [players, today, week, month, allTime] = await Promise.all([
    sql<PlayerRow[]>`select id, family_id, name, emoji, color, organizer from games.players where family_id = ${me.family_id} order by created_at`,
    sql<{ playerId: string; game: GameId; points: number }[]>`
      select player_id as "playerId", game, points from games.results where family_id = ${me.family_id} and date = ${date} order by created_at`,
    totals(weekStart, weekEnd),
    totals(monthStart, monthEnd),
    totals(null, null),
  ]);
  return { players: players.map(toPlayer), today: [...today], week: [...week], month: [...month], allTime: [...allTime] };
}

// ---------------------------------------------------------------- notes

async function notes(body: Record<string, unknown>): Promise<Api["notes"]["res"]> {
  const me = await auth(body);
  const sql = db();
  if (body.notes !== undefined) {
    const n = body.notes as Partial<FamilyNotes> | null;
    if (!n || typeof n !== "object" || Array.isArray(n)) throw bad("notes must be an object");
    const clean = (v: unknown, field: string): string => {
      if (v === undefined || v === null || v === "") return "";
      if (typeof v !== "string") throw bad(`${field} must be text`);
      const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim();
      if (s.length > 600) throw bad(`${field} must be at most 600 characters`);
      return s;
    };
    const next: FamilyNotes = { people: clean(n.people, "people"), watching: clean(n.watching, "watching"), events: clean(n.events, "events") };
    await sql`update games.families set notes = ${sql.json(next as never)} where id = ${me.family_id}`;
  }
  const [fam] = await sql<{ name: string; code: string; notes: Partial<FamilyNotes> }[]>`select name, code, notes from games.families where id = ${me.family_id}`;
  return { notes: emptyNotes(fam.notes), familyName: fam.name, code: fam.code };
}

// ---------------------------------------------------------------- cron

/**
 * Pre-generates puzzles for every family. Only pg_cron (which reads the
 * secret from games.config) can call this. Optional body fields for manual
 * runs with the same secret: date (default: today UTC) and force (throw away
 * that date's existing puzzles first - only safe before anyone has played).
 */
async function cron(req: Request, body: Record<string, unknown>): Promise<{ started: number; date: string }> {
  const sql = db();
  const given = req.headers.get("x-cron-secret") ?? "";
  const [cfg] = await sql<{ value: string }[]>`select value from games.config where key = 'cron_secret'`;
  if (!cfg || given.length !== cfg.value.length || (await sha256(given)) !== (await sha256(cfg.value))) throw bad("Forbidden", 403);
  const date = body.date === undefined ? utcDate() : dateArg(body.date);
  if (!nearToday(date)) throw bad("date must be within a day of today (UTC)");
  const families = await sql<{ id: string }[]>`select id from games.families ${typeof body.familyId === "string" ? sql`where id = ${body.familyId}` : sql``}`;
  let started = 0;
  for (const f of families) {
    if (body.force === true) await sql`delete from games.daily where family_id = ${f.id} and date = ${date}`;
    const attemptNo = await claim(f.id, date);
    if (attemptNo === null) continue;
    started++;
    inBackground(runGeneration(f.id, date, attemptNo));
  }
  return { started, date };
}
