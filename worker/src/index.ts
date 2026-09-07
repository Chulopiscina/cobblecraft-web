import type { Env } from "./types";
import { corsHeaders, securityHeaders, errorResponse } from "./lib/security";
import { handleCreateOrder, handleGetOrder } from "./routes/orders";
import { handleWebhook } from "./routes/webhook";
import { handleSimulateMockPayment } from "./routes/payments-mock";
import { handleListPending, handleClaim, handleAck } from "./routes/delivery";
import { handleStartLink, handleLinkStatus, handleConfirmLink } from "./routes/link";
import { handleLauncherLatest } from "./routes/launcher";
import { handleServerStatus } from "./routes/server-status";
import { handleHealth } from "./routes/health";
import { handleVoteStatus, handleVoteSubmit, handleVoteRewardPending, handleVoteRewardClaim, handleVoteRewardAck } from "./routes/vote";

/**
 * Web Oficial V1 - router principal del Worker. Deliberadamente simple (sin framework de
 * enrutado adicional, "no 40 dependencias") - un switch sobre método+ruta es suficiente para la
 * superficie real de esta API.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const siteBaseUrl = env.CORS_ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders(env, request), ...securityHeaders() } });
    }

    try {
      if (path === "/api/orders" && request.method === "POST") return await handleCreateOrder(request, env, siteBaseUrl);

      const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (orderMatch && request.method === "GET") return await handleGetOrder(request, env, orderMatch[1]);

      if (path === "/api/webhook/mock" && request.method === "POST" && env.PAYMENT_PROVIDER === "mock") {
        return await handleWebhook(request, env, siteBaseUrl);
      }
      if (path === "/api/webhook/stripe" && request.method === "POST") return await handleWebhook(request, env, siteBaseUrl);
      if (path === "/api/webhook/tebex" && request.method === "POST") return await handleWebhook(request, env, siteBaseUrl);

      if (path === "/api/payments/mock/simulate" && request.method === "POST") return await handleSimulateMockPayment(request, env, siteBaseUrl);

      if (path === "/api/delivery/pending" && request.method === "GET") return await handleListPending(request, env);
      if (path === "/api/delivery/claim" && request.method === "POST") return await handleClaim(request, env);
      if (path === "/api/delivery/ack" && request.method === "POST") return await handleAck(request, env);

      if (path === "/api/link/start" && request.method === "POST") return await handleStartLink(request, env);
      const linkStatusMatch = path.match(/^\/api\/link\/status\/([^/]+)$/);
      if (linkStatusMatch && request.method === "GET") return await handleLinkStatus(request, env, linkStatusMatch[1]);
      if (path === "/api/link/confirm" && request.method === "POST") return await handleConfirmLink(request, env);

      if (path === "/api/launcher/latest" && request.method === "GET") return await handleLauncherLatest(request, env);
      if (path === "/api/server/status" && request.method === "GET") return await handleServerStatus(request, env);

      if (path === "/api/vote/status" && request.method === "GET") return await handleVoteStatus(request, env);
      if (path === "/api/vote/submit" && request.method === "POST") return await handleVoteSubmit(request, env);
      if (path === "/api/vote/reward/pending" && request.method === "GET") return await handleVoteRewardPending(request, env);
      if (path === "/api/vote/reward/claim" && request.method === "POST") return await handleVoteRewardClaim(request, env);
      if (path === "/api/vote/reward/ack" && request.method === "POST") return await handleVoteRewardAck(request, env);

      if (path === "/api/health" && request.method === "GET") return await handleHealth(request, env);

      return errorResponse(env, request, 404, "Not found.");
    } catch (err) {
      // Nunca filtrar detalles internos (secrets/stack) al cliente - ver web/docs/SECURITY.md.
      console.error("Unhandled error:", err);
      return errorResponse(env, request, 500, "Error interno del servidor.");
    }
  },
};
