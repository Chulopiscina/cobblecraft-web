import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import { signTestToken } from "./vote-helpers";
import type { Env } from "../src/types";
import { handleVoteStatus, handleVoteSubmit, handleVoteRewardPending, handleVoteRewardClaim, handleVoteRewardAck } from "../src/routes/vote";

const SECRET = "test-vote-secret";
const UUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5";

function makeEnv(db: FakeD1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    VOTE_TIMEZONE: "Europe/Madrid",
    VOTE_RESET_HOUR: "0",
    VOTE_RESET_MINUTE: "0",
    STORE_SERVER_TOKEN: "test-server-token",
    VOTE_SIGNING_SECRET: SECRET,
    ...overrides,
  };
}

function freshPayload(overrides: Partial<{ uuid: string; playerName: string; issuedAt: number; expiresAt: number; nonce: string }> = {}) {
  const now = Date.now();
  return { uuid: UUID, playerName: "Notch", issuedAt: now, expiresAt: now + 10 * 60_000, nonce: crypto.randomUUID(), ...overrides };
}

// IP unica por caso de test - `rateLimit()` (lib/security.ts) usa un bucket EN MEMORIA a nivel de
// modulo, compartido por todo el proceso de vitest; sin esto, las decenas de submits de todos los
// tests de este archivo competirian por el mismo bucket "unknown" y activarian un 429 real a
// mitad de la suite (no es un fallo de produccion, es solo aislamiento necesario en el test).
let clientIp = "";

async function statusReq(token: string) {
  return new Request(`http://worker.local/api/vote/status?token=${encodeURIComponent(token)}`, { headers: { "CF-Connecting-IP": clientIp } });
}
function submitReq(token: string) {
  return new Request("http://worker.local/api/vote/submit", { method: "POST", headers: { "CF-Connecting-IP": clientIp }, body: JSON.stringify({ token }) });
}

describe("/api/vote/status + /api/vote/submit", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
    clientIp = crypto.randomUUID();
  });
  afterEach(() => db.close());

  it("a fresh valid token is reported as ready to vote", async () => {
    const token = await signTestToken(SECRET, freshPayload());
    const res = await handleVoteStatus(await statusReq(token), env);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("ready");
  });

  it("an expired token is reported as expired, never as ready", async () => {
    const now = Date.now();
    const token = await signTestToken(SECRET, freshPayload({ issuedAt: now - 20 * 60_000, expiresAt: now - 1000 }));
    const res = await handleVoteStatus(await statusReq(token), env);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("expired");
  });

  it("a tampered/forged token is reported as invalid", async () => {
    const token = await signTestToken("wrong-secret", freshPayload());
    const res = await handleVoteStatus(await statusReq(token), env);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("invalid");
  });

  it("submitting a valid token registers the vote and returns success", async () => {
    const token = await signTestToken(SECRET, freshPayload());
    const res = await handleVoteSubmit(submitReq(token), env);
    const body = (await res.json()) as { state: string; playerName: string };
    expect(body.state).toBe("success");
    expect(body.playerName).toBe("Notch");
  });

  it("submitting the SAME token twice never votes twice (nonce replay protection - idempotent)", async () => {
    const token = await signTestToken(SECRET, freshPayload());
    const first = await handleVoteSubmit(submitReq(token), env);
    expect(((await first.json()) as { state: string }).state).toBe("success");

    const second = await handleVoteSubmit(submitReq(token), env);
    const secondBody = (await second.json()) as { state: string };
    expect(secondBody.state).toBe("used");

    const totalVotes = await db.raw.prepare("SELECT COUNT(*) as n FROM votes WHERE player_uuid = ?").get(UUID) as { n: number };
    expect(totalVotes.n).toBe(1);
  });

  it("two concurrent submits of the same token only register ONE vote (race on the same nonce)", async () => {
    const token = await signTestToken(SECRET, freshPayload());
    const [a, b] = await Promise.all([handleVoteSubmit(submitReq(token), env), handleVoteSubmit(submitReq(token), env)]);
    const states = [((await a.json()) as { state: string }).state, ((await b.json()) as { state: string }).state].sort();
    expect(states).toEqual(["success", "used"]);

    const totalVotes = await db.raw.prepare("SELECT COUNT(*) as n FROM votes WHERE player_uuid = ?").get(UUID) as { n: number };
    expect(totalVotes.n).toBe(1);
  });

  it("a second vote from the SAME player with a NEW token, same day, is blocked as already_voted", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.UTC(2026, 5, 15, 10, 0, 0)); // 2026-06-15 12:00 CEST
      const firstToken = await signTestToken(SECRET, freshPayload());
      await handleVoteSubmit(submitReq(firstToken), env);

      vi.setSystemTime(Date.UTC(2026, 5, 15, 20, 0, 0)); // same local day, 22:00 CEST
      const secondToken = await signTestToken(SECRET, freshPayload({ nonce: crypto.randomUUID() }));
      const res = await handleVoteSubmit(submitReq(secondToken), env);
      const body = (await res.json()) as { state: string; nextResetAt: number };
      expect(body.state).toBe("already_voted");
      expect(body.nextResetAt).toBeGreaterThan(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });

  it("once the vote_period_id changes (next CobbleCraft day), a new token can vote again - never rolling 24h", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.UTC(2026, 5, 15, 21, 55, 0)); // 2026-06-15 23:55 CEST - close to midnight
      const firstToken = await signTestToken(SECRET, freshPayload());
      const firstRes = await handleVoteSubmit(submitReq(firstToken), env);
      expect(((await firstRes.json()) as { state: string }).state).toBe("success");

      // Solo 10 minutos despues (NUNCA 20-24h "rolling") pero ya es el dia siguiente en Europe/Madrid.
      vi.setSystemTime(Date.UTC(2026, 5, 15, 22, 5, 0)); // 2026-06-16 00:05 CEST
      const secondToken = await signTestToken(SECRET, freshPayload({ nonce: crypto.randomUUID() }));
      const res = await handleVoteSubmit(submitReq(secondToken), env);
      const body = (await res.json()) as { state: string };
      expect(body.state).toBe("success");
    } finally {
      vi.useRealTimers();
    }
  });

  it("submitting a malformed token never creates a vote row", async () => {
    const res = await handleVoteSubmit(submitReq("not-a-real-token"), env);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("invalid");
    const totalVotes = await db.raw.prepare("SELECT COUNT(*) as n FROM votes").get() as { n: number };
    expect(totalVotes.n).toBe(0);
  });

  it("the UNIQUE(player_uuid, vote_period_id) DB constraint independently blocks a duplicate insert - defense in depth beyond the app-level check", async () => {
    // Bypassea deliberadamente `hasVotedInPeriod` (llama a insertVote() dos veces directo) para
    // confirmar que la restricción de la migración 0004 por sí sola ya impide el duplicado, sin
    // depender de que la capa de aplicación lo comprobara antes - sección M/W: "Unique: UUID +
    // vote_period_id".
    const { insertVote } = await import("../src/lib/votes");
    const first = await insertVote(env, { playerUuid: UUID, playerName: "Notch", nonce: crypto.randomUUID(), votePeriodId: "2026-06-15" });
    expect(first.status).toBe("INSERTED");
    const second = await insertVote(env, { playerUuid: UUID, playerName: "Notch", nonce: crypto.randomUUID(), votePeriodId: "2026-06-15" });
    expect(second.status).toBe("ALREADY_VOTED_THIS_PERIOD");

    const totalVotes = await db.raw.prepare("SELECT COUNT(*) as n FROM votes WHERE player_uuid = ? AND vote_period_id = ?").get(UUID, "2026-06-15") as { n: number };
    expect(totalVotes.n).toBe(1);
  });

  it("a NEW vote_period_id is always allowed even for the same player - never a global one-vote-ever limit", async () => {
    const { insertVote } = await import("../src/lib/votes");
    const day1 = await insertVote(env, { playerUuid: UUID, playerName: "Notch", nonce: crypto.randomUUID(), votePeriodId: "2026-06-15" });
    const day2 = await insertVote(env, { playerUuid: UUID, playerName: "Notch", nonce: crypto.randomUUID(), votePeriodId: "2026-06-16" });
    expect(day1.status).toBe("INSERTED");
    expect(day2.status).toBe("INSERTED");
  });
});

describe("/api/vote/reward/* (Minecraft polling, Bearer-auth)", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
    clientIp = crypto.randomUUID();
  });
  afterEach(() => db.close());

  async function castOneVote(): Promise<void> {
    const token = await signTestToken(SECRET, freshPayload());
    const res = await handleVoteSubmit(submitReq(token), env);
    expect(((await res.json()) as { state: string }).state).toBe("success");
  }

  it("pending requires server auth", async () => {
    const res = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending"), env);
    expect(res.status).toBe(401);
  });

  it("a fresh vote appears in pending, with playerUuid/playerName but no secret data", async () => {
    await castOneVote();
    const res = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].playerUuid).toBe(UUID);
    expect(body[0].playerName).toBe("Notch");
  });

  it("claim -> ack marks the reward delivered exactly once, and a stale claimToken is rejected", async () => {
    await castOneVote();
    const pending = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    const [{ voteId }] = (await pending.json()) as Array<{ voteId: number }>;

    const claim1 = await handleVoteRewardClaim(
      new Request("http://worker.local/api/vote/reward/claim", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId }) }),
      env,
    );
    expect(claim1.status).toBe(200);
    const { claimToken } = (await claim1.json()) as { claimToken: string };

    const claim2 = await handleVoteRewardClaim(
      new Request("http://worker.local/api/vote/reward/claim", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId }) }),
      env,
    );
    expect(claim2.status).toBe(409);

    const wrongAck = await handleVoteRewardAck(
      new Request("http://worker.local/api/vote/reward/ack", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId, result: "delivered", claimToken: "wrong" }) }),
      env,
    );
    expect(wrongAck.status).toBe(409);

    const ack1 = await handleVoteRewardAck(
      new Request("http://worker.local/api/vote/reward/ack", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId, result: "delivered", claimToken }) }),
      env,
    );
    expect(ack1.status).toBe(200);

    const ack2 = await handleVoteRewardAck(
      new Request("http://worker.local/api/vote/reward/ack", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId, result: "delivered", claimToken }) }),
      env,
    );
    const ack2Body = (await ack2.json()) as { alreadyDelivered: boolean };
    expect(ack2Body.alreadyDelivered).toBe(true);

    const pendingAfter = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    expect(((await pendingAfter.json()) as unknown[]).length).toBe(0);
  });

  it("a failed delivery (e.g. player offline, no mailbox) releases the claim so it is retried, without needing the full timeout", async () => {
    await castOneVote();
    const pending = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    const [{ voteId }] = (await pending.json()) as Array<{ voteId: number }>;

    const claim = await handleVoteRewardClaim(
      new Request("http://worker.local/api/vote/reward/claim", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId }) }),
      env,
    );
    const { claimToken } = (await claim.json()) as { claimToken: string };

    await handleVoteRewardAck(
      new Request("http://worker.local/api/vote/reward/ack", { method: "POST", headers: { Authorization: "Bearer test-server-token" }, body: JSON.stringify({ voteId, result: "failed", claimToken }) }),
      env,
    );

    const pendingAfter = await handleVoteRewardPending(new Request("http://worker.local/api/vote/reward/pending", { headers: { Authorization: "Bearer test-server-token" } }), env);
    expect(((await pendingAfter.json()) as unknown[]).length).toBe(1);
  });
});
