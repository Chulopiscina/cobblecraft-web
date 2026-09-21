import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac, createHash } from "node:crypto";
import type { Env } from "../src/types";
import { FakeD1Database, applyRealMigrations } from "./d1-fake";
import { createOrder, getOrderByPublicId, claimOrder, ackDelivered, ackFailed, listDeliverable } from "../src/lib/orders";
import { handleWebhook } from "../src/routes/webhook";
import { handleOperations } from "../src/routes/operations";
import { handleGetOrder } from "../src/routes/orders";
import { requireServerAuth } from "../src/routes/delivery";
import { handleServerStatus, handleServerStatusHeartbeat } from "../src/routes/server-status";

let db: FakeD1Database, env: Env, dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cobblecraft-operations-test-')); db = new FakeD1Database(join(dir, 'test.sqlite')); applyRealMigrations(db);
  env = { DB: db as unknown as D1Database, ENVIRONMENT: "production", PAYMENT_PROVIDER: "tebex", CORS_ALLOWED_ORIGIN: "https://site.test", CLAIM_TIMEOUT_SECONDS: "120",
    TEBEX_WEBHOOK_SECRET: "test-signature-only", OPERATIONS_TOKEN: "test-ops-only", STORE_SERVER_TOKEN: "test-delivery-only", SERVER_STATUS_TOKEN: "test-heartbeat-only" };
});
afterEach(() => { db.close(); unlinkSync(join(dir, 'test.sqlite')); rmdirSync(dir); });
async function order() { return createOrder(env, { playerUuid: '123456781234123412341234567890ab', playerName: 'Jugador', productId: 'rank_explorer', priceCents: 1499, currency: 'EUR', paymentProvider: 'tebex' }); }
async function webhook(id: string, orderId: string, type = 'payment.completed') {
  const body = JSON.stringify({ id, type, subject: { transaction_id: 'tbx-integration',
    custom: { orderPublicId: orderId, playerUuid: '123456781234123412341234567890ab' },
    products: [{ id: 7664019, quantity: 1, username: { id: '123456781234123412341234567890ab', username: 'Jugador' }, base_price: { amount: 14.99, currency: 'EUR' } }] } });
  const signature = createHmac('sha256', env.TEBEX_WEBHOOK_SECRET!).update(createHash('sha256').update(body).digest('hex')).digest('hex');
  return handleWebhook(new Request('https://worker.test/api/webhook/tebex', { method: 'POST', headers: { 'X-Signature': signature }, body }), env, 'https://site.test', 'tebex');
}
it('five signed webhook duplicates, offline wait, SQLite reopen and lease retry produce one delivered order', async () => {
  const o = await order();
  for (let i=0;i<5;i++) expect((await webhook('same-event', o.public_id)).status).toBe(200);
  expect((await listDeliverable(env)).length).toBe(1);
  expect((await getOrderByPublicId(env,o.public_id))?.status).toBe('PAID');
  db.close(); db = new FakeD1Database(join(dir,'test.sqlite')); env = {...env, DB: db as unknown as D1Database};
  const first = await claimOrder(env,o.public_id); if(first.status!=='CLAIMED') throw Error('claim');
  expect(await ackFailed(env,o.public_id,first.claimToken)).toBe('RETRY');
  expect(await ackFailed(env,o.public_id,first.claimToken)).toBe('RETRY');
  db.raw.prepare("UPDATE orders SET claimed_at = 0 WHERE public_id = ?").run(o.public_id);
  const second = await claimOrder(env,o.public_id); if(second.status!=='CLAIMED') throw Error('claim');
  expect(await ackDelivered(env,o.public_id,first.claimToken)).toBe('STALE_CLAIM');
  expect(await ackDelivered(env,o.public_id,second.claimToken)).toBe('DELIVERED');
  expect(await ackDelivered(env,o.public_id,second.claimToken)).toBe('ALREADY_DELIVERED');
  expect(await ackDelivered(env,o.public_id,'wrong')).toBe('STALE_CLAIM');
  expect(await listDeliverable(env)).toHaveLength(0);
  expect(db.raw.prepare("SELECT COUNT(*) AS n FROM order_events WHERE event_type='DELIVERED'").get()).toMatchObject({n:1});
  expect(db.raw.prepare("SELECT COUNT(*) AS n FROM order_events WHERE event_type='DELIVERY_FAILED_RETRY'").get()).toMatchObject({n:1});
  expect((await getOrderByPublicId(env,o.public_id))?.delivery_attempts).toBe(2);
});
it('ACK audit failure rolls back delivery; retry succeeds once', async () => {
  const o=await order();await webhook('pay',o.public_id);const c=await claimOrder(env,o.public_id);if(c.status!=='CLAIMED')throw Error('claim');
  db.raw.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON order_events WHEN NEW.event_type='DELIVERED' BEGIN SELECT RAISE(ABORT,'simulated crash'); END;");
  await expect(ackDelivered(env,o.public_id,c.claimToken)).rejects.toThrow();expect((await getOrderByPublicId(env,o.public_id))?.status).toBe('CLAIMED');
  db.raw.exec('DROP TRIGGER fail_audit');expect(await ackDelivered(env,o.public_id,c.claimToken)).toBe('DELIVERED');
});
it.each(['payment.refunded','payment.dispute.opened','payment.dispute.lost'])('out-of-order %s prevents delivery even when payment arrives later', async type => {
  const o=await order();await webhook('reversal',o.public_id,type);await webhook('pay',o.public_id);
  expect((await getOrderByPublicId(env,o.public_id))?.status).toBe('REFUNDED');expect(await listDeliverable(env)).toHaveLength(0);
});
it.each([false,true])('reversal during/after delivery is review-required (already delivered=%s)', async delivered => {
  const o=await order();await webhook('pay',o.public_id);const c=await claimOrder(env,o.public_id);if(c.status!=='CLAIMED')throw Error('claim');
  if(delivered)await ackDelivered(env,o.public_id,c.claimToken);
  for(let i=0;i<5;i++)await webhook('refund',o.public_id,'payment.refunded');
  expect((await getOrderByPublicId(env,o.public_id))?.review_required).toBe(1);
  expect(await ackDelivered(env,o.public_id,c.claimToken)).toBe('STALE_CLAIM');expect(await listDeliverable(env)).toHaveLength(0);
  expect(db.raw.prepare("SELECT COUNT(*) AS n FROM order_events WHERE event_type='PAYMENT_REVERSED'").get()).toMatchObject({n:1});
});
it('unclaimed order cannot be ACKed as delivered or failed',async()=>{
  const o=await order();expect(await ackDelivered(env,o.public_id,'fake')).toBe('STALE_CLAIM');expect(await ackFailed(env,o.public_id,'fake')).toBe('STALE_CLAIM');
});
it('diagnostics are private; heartbeat/delivery tokens do not grant ops access or vice versa',async()=>{
  for(const token of ['',env.SERVER_STATUS_TOKEN,env.STORE_SERVER_TOKEN])expect((await handleOperations(new Request('https://worker.test/api/admin/diagnostics',{headers:{Authorization:`Bearer ${token}`}}),env)).status).toBe(401);
  const request=new Request('https://worker.test/api/admin/diagnostics',{headers:{Authorization:`Bearer ${env.OPERATIONS_TOKEN}`}});
  const response=await handleOperations(request,env);expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
  const text=await response.text();expect(text).not.toContain('test-ops-only');expect(text).not.toContain('test-signature-only');expect(requireServerAuth(request,env)?.status).toBe(401);
});
it('public order exposes only bearer-scoped display fields, never UUID/payment/lease data',async()=>{
  const o=await order();await webhook('pay',o.public_id);await claimOrder(env,o.public_id);
  const r=await handleGetOrder(new Request('https://worker.test/api/orders/'+o.public_id),env,o.public_id);const text=await r.text();
  expect(text).toContain('Jugador');expect(text).not.toContain(o.player_uuid);expect(text).not.toContain('tbx-integration');expect(text).not.toContain('claim_token');
});
it('heartbeat public output strips private diagnostics, expires metrics and does not fabricate zero players',async()=>{
  const body={state:'online',playersOnline:3,maxPlayers:20,version:'1.21.1',latencyMs:50};
  const r=await handleServerStatusHeartbeat(new Request('https://worker.test/api/server/status/heartbeat',{method:'POST',headers:{Authorization:`Bearer ${env.SERVER_STATUS_TOKEN}`},body:JSON.stringify(body)}),env);
  expect(r.status).toBe(200);expect(await(await handleServerStatus(new Request('https://worker.test/api/server/status'),env)).json()).toMatchObject({version:'1.21.1',latencyMs:50,playersOnline:3});
  db.raw.exec('UPDATE server_status_heartbeat SET updated_at=0');
  expect(await(await handleServerStatus(new Request('https://worker.test/api/server/status'),env)).json()).toMatchObject({state:'offline',playersOnline:null,version:null,latencyMs:null});
});
