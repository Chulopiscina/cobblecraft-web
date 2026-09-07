import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Env } from "../src/types";
import { handleLauncherLatest } from "../src/routes/launcher";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: "development",
    PAYMENT_PROVIDER: "mock",
    CORS_ALLOWED_ORIGIN: "http://localhost:4321",
    CLAIM_TIMEOUT_SECONDS: "120",
    ...overrides,
  };
}

// Exactamente 64 caracteres hex (formato real de SHA-256) - "ab" x 32.
const REAL_SHA256 = "ab".repeat(32);

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("GET /api/launcher/latest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports not_configured when GITHUB_LAUNCHER_REPO is unset - never fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv());
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports not_published on a real 404 (no release exists yet)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("not_published");
  });

  it("reports rate_limited on a 403 with X-RateLimit-Remaining: 0, never a broken URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 403, { "X-RateLimit-Remaining": "0" })));
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("rate_limited");
  });

  it("reports fetch_error when the network call throws, never crashes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("fetch_error");
  });

  it("resolves the real manifest and cross-references the download URL against the actual asset list", async () => {
    const manifest = {
      launcherVersion: "1.0.0",
      packVersion: "1.0.0",
      filename: "CobblemonServerLauncher-1.0.0-win64.zip",
      sha256: REAL_SHA256,
      size: 81547124,
      publishedAt: "2026-08-26T00:00:00Z",
      platform: "windows-x64",
      minSupportedVersion: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) {
          return jsonResponse({
            tag_name: "launcher-v1.0.0",
            assets: [
              { name: "launcher-manifest.json", browser_download_url: "https://github.com/assets/manifest" },
              { name: "CobblemonServerLauncher-1.0.0-win64.zip", browser_download_url: "https://github.com/assets/zip-real" },
            ],
          });
        }
        if (url === "https://github.com/assets/manifest") return jsonResponse(manifest);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.available).toBe(true);
    expect(body.manifestPresent).toBe(true);
    expect(body.version).toBe("1.0.0");
    expect(body.packVersion).toBe("1.0.0");
    expect(body.sha256).toBe(REAL_SHA256);
    // La URL real viene del asset de GitHub, nunca de un campo declarado dentro del propio manifest.
    expect(body.url).toBe("https://github.com/assets/zip-real");
  });

  it("rejects a release whose manifest references a filename that isn't actually an asset", async () => {
    const manifest = {
      launcherVersion: "1.0.0",
      packVersion: "1.0.0",
      filename: "does-not-exist.zip",
      sha256: REAL_SHA256,
      size: 1000,
      publishedAt: "2026-08-26T00:00:00Z",
      platform: "windows-x64",
      minSupportedVersion: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) {
          return jsonResponse({
            tag_name: "launcher-v1.0.0",
            assets: [{ name: "launcher-manifest.json", browser_download_url: "https://github.com/assets/manifest" }],
          });
        }
        if (url === "https://github.com/assets/manifest") return jsonResponse(manifest);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("invalid_release");
  });

  it("falls back to a direct .zip asset (manifestPresent:false) when the manifest is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) {
          return jsonResponse({
            tag_name: "launcher-v1.0.0",
            assets: [
              { name: "launcher-manifest.json", browser_download_url: "https://github.com/assets/manifest" },
              { name: "CobblemonServerLauncher-1.0.0-win64.zip", browser_download_url: "https://github.com/assets/zip-real" },
            ],
          });
        }
        if (url === "https://github.com/assets/manifest") return jsonResponse({ garbage: true }); // sin los campos requeridos
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.available).toBe(true);
    expect(body.manifestPresent).toBe(false);
    expect(body.url).toBe("https://github.com/assets/zip-real");
  });

  it("falls back to a direct asset when there is no manifest at all (legacy release)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) {
          return jsonResponse({
            tag_name: "v0.9.0",
            assets: [{ name: "CobblemonServerLauncher.exe", browser_download_url: "https://github.com/assets/legacy-exe" }],
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.available).toBe(true);
    expect(body.manifestPresent).toBe(false);
    expect(body.version).toBe("0.9.0");
    expect(body.url).toBe("https://github.com/assets/legacy-exe");
  });

  it("reports no_asset when a release exists but has no usable file at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) {
          return jsonResponse({ tag_name: "launcher-v1.0.0", assets: [{ name: "README.md", browser_download_url: "https://github.com/assets/readme" }] });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await handleLauncherLatest(new Request("http://worker.local/api/launcher/latest"), makeEnv({ GITHUB_LAUNCHER_REPO: "owner/repo" }));
    const body = (await res.json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_asset");
  });
});
