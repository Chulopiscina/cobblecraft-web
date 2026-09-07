// Production Hardening V1 - Fase S: prueba de carga LOCAL controlada contra el Worker real
// corriendo en 127.0.0.1:8787 (wrangler dev --local). Nunca contra un dominio real, nunca DDoS.
// Requiere: web/worker `npm run dev` corriendo en otra terminal, con migraciones aplicadas
// (`npx wrangler d1 migrations apply cobblemon_store --local`) y .dev.vars configurado. Ver
// web/docs/LOAD_TEST_V1.md para el resultado real de la última ejecución.
const BASE = "http://127.0.0.1:8787";
const TOKEN = "dev-local-server-token-change-me";

async function timed(label, fn) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`${label}: ${ms}ms`);
  return result;
}

async function createOrder(name) {
  return fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "item_test_book_dev", playerName: name }),
  });
}

async function main() {
  const results = { pass: 0, fail: 0 };

  // 1. Rafaga de 100 GET /api/health (simula navegacion de 100 usuarios) - sin rate limit, endpoint publico de solo lectura.
  await timed("100x GET /api/health (burst)", async () => {
    const reqs = Array.from({ length: 100 }, () => fetch(`${BASE}/api/health`));
    const responses = await Promise.all(reqs);
    const okCount = responses.filter((r) => r.ok).length;
    console.log(`  -> ${okCount}/100 OK`);
    if (okCount !== 100) results.fail++; else results.pass++;
  });

  // 2. UN pedido real primero (para el test de claim concurrente de abajo) - antes de gastar la cuota del rate limiter.
  const orderRes = await createOrder("Notch");
  const order = await orderRes.json();
  if (!order.orderId) {
    console.error("No se pudo crear el pedido base para el test de claim:", order);
    process.exit(1);
  }
  await fetch(`${BASE}/api/payments/mock/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderPublicId: order.orderId, outcome: "paid" }),
  });

  // 3. Rate limiting REAL de creacion de pedidos (8/min/IP) - ya usamos 1 de la cuota arriba, quedan 7.
  //    Ráfaga de 15 para confirmar que el límite SÍ actúa (se esperan ~7 OK, el resto 429) - esto
  //    es el comportamiento CORRECTO, no un fallo del sistema.
  await timed("15x POST /api/orders concurrent (expect rate limiting to kick in, NOT a bug)", async () => {
    const names = ["Jeb_", "Dinnerbone", "Grumm", "C418", "Marc", "Jens", "Searge", "ez", "Dev", "Alex", "Steve", "Herobrine", "Notchy", "Mojang", "Grum"];
    const responses = await Promise.all(names.map((n) => createOrder(n)));
    const okCount = responses.filter((r) => r.status === 200).length;
    const limited = responses.filter((r) => r.status === 429).length;
    console.log(`  -> ${okCount} created (200), ${limited} correctly rate-limited (429) - total ${okCount + limited}/15`);
    if (okCount + limited !== 15) { results.fail++; console.error("  !! Alguna respuesta no fue ni 200 ni 429"); } else results.pass++;
  });

  // 4. 10 claims CONCURRENTES del MISMO pedido - solo UNO debe ganar (endpoint sin rate limit, es interno/autenticado).
  await timed("10x POST /api/delivery/claim CONCURRENT on the SAME order", async () => {
    const reqs = Array.from({ length: 10 }, () =>
      fetch(`${BASE}/api/delivery/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId }),
      }),
    );
    const responses = await Promise.all(reqs);
    const claimed = responses.filter((r) => r.status === 200).length;
    const conflict = responses.filter((r) => r.status === 409).length;
    console.log(`  -> claimed=${claimed} (debe ser EXACTAMENTE 1), already_claimed=${conflict} (debe ser 9)`);
    if (claimed !== 1 || conflict !== 9) {
      console.error("  !! FALLO CRITICO: la carrera atomica de claim no se comporto como se esperaba");
      results.fail++;
    } else {
      results.pass++;
    }
  });

  // 5. Rafaga de webhook duplicado (mismo pago simulado 50 veces) - endpoint sin rate limit especifico de "por pedido".
  await timed("50x POST /api/payments/mock/simulate DUPLICATE (same order, already paid)", async () => {
    const reqs = Array.from({ length: 50 }, () =>
      fetch(`${BASE}/api/payments/mock/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderPublicId: order.orderId, outcome: "paid" }),
      }),
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map((r) => r.status);
    const okCount = statuses.filter((s) => s === 200).length;
    const rateLimited = statuses.filter((s) => s === 429).length;
    console.log(`  -> ${okCount}/50 respondieron 200 (already_processed esperado dentro del body), ${rateLimited} rate-limited`);
    results.pass++;
  });

  // 6. Confirmar que el pedido sigue en un estado consistente (nunca corrupto por la carga) - debe seguir CLAIMED (no hubo ACK todavia).
  const finalRes = await fetch(`${BASE}/api/orders/${order.orderId}`);
  const final = await finalRes.json();
  console.log(`Estado final del pedido de prueba: ${final.status} (esperado: CLAIMED, ya que no se hizo ACK en este test)`);
  if (final.status !== "CLAIMED") { results.fail++; console.error("  !! Estado inesperado tras la carga"); } else results.pass++;

  // 7. 50 polls simulados de /api/delivery/pending (simula progression_core bajo carga, sin rate limit por diseño - Fase I: "no bloquear Delivery API legitima").
  await timed("50x GET /api/delivery/pending (simulated repeated polling)", async () => {
    const reqs = Array.from({ length: 50 }, () => fetch(`${BASE}/api/delivery/pending`, { headers: { Authorization: `Bearer ${TOKEN}` } }));
    const responses = await Promise.all(reqs);
    const okCount = responses.filter((r) => r.ok).length;
    console.log(`  -> ${okCount}/50 OK`);
    if (okCount !== 50) results.fail++; else results.pass++;
  });

  console.log(`\n=== RESUMEN: ${results.pass} bloques OK, ${results.fail} bloques con fallo ===`);
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Load test crashed:", err);
  process.exit(1);
});
