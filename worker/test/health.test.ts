import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import type { Env } from "../src/types";
import { handleHealth } from "../src/routes/health";

function makeEnv(db: FakeD1Database): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
  };
}

describe("GET /api/health", () => {
  let db: FakeD1Database;
  let env: Env;

  beforeEach(() => {
    db = new FakeD1Database();
    applyRealMigrations(db);
    env = makeEnv(db);
  });
  afterEach(() => db.close());

  it("reports ok:true and dbReachable:true when D1 responds, never leaks secrets", async () => {
    const res = await handleHealth(new Request("http://worker.local/api/health"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.dbReachable).toBe(true);
    expect(body.environment).toBe("development");
    expect(JSON.stringify(body)).not.toMatch(/token|secret|password/i);
  });

  it("reports ok:false with HTTP 503 when D1 is unreachable", async () => {
    // D1 caída/inaccesible - stub que lanza en vez de cerrar la instancia real compartida (evita
    // interferir con el afterEach, que también cierra `db`).
    const brokenDb = {
      prepare: () => {
        throw new Error("simulated D1 outage");
      },
    } as unknown as D1Database;
    const brokenEnv: Env = { ...env, DB: brokenDb };
    const res = await handleHealth(new Request("http://worker.local/api/health"), brokenEnv);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.dbReachable).toBe(false);
  });
});
