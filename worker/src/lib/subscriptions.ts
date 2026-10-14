import type { Env } from "../types";
import type { SubscriptionEvent, WebhookEvent } from "./payment/PaymentProvider";
import { getOrderByPublicId } from "./orders";
import { allVisibleProducts, getProviderPackageId } from "./catalog";

export interface SubscriptionRow { reference: string; playerUuid: string; tier: string; startsAt: number; expiresAt: number; revision: number }
export function reduceSubscription(events: {seq:number;payload:string}[]): SubscriptionRow {
  const all=events.map(e=>({...JSON.parse(e.payload) as SubscriptionEvent & {tier:string},seq:e.seq}));
  const paid=all.filter(e=>e.kind==="paid").sort((a,b)=>b.startsAt-a.startsAt||b.at-a.at||b.seq-a.seq)[0];
  const identity=paid??all[0]!;
  const end=all.filter(e=>e.kind==="ended" || (e.kind==="refund"&&e.transactionId===paid?.transactionId)).reduce((n,e)=>Math.min(n,e.at),Number.MAX_SAFE_INTEGER);
  const rankId=identity.tier;
  return {reference:identity.reference,playerUuid:identity.playerUuid,tier:rankId,
    startsAt:paid?.startsAt??0,expiresAt:paid ? Math.min(paid.expiresAt,end) : 0,revision:Math.max(...events.map(e=>e.seq))};
}
export async function recordSubscription(env: Env, event: WebhookEvent): Promise<void> {
  const s=event.subscription!;
  const order=await getOrderByPublicId(env,s.orderPublicId);
  const product=allVisibleProducts(env).find(p=>getProviderPackageId(p.productId)===s.packageId && p.metadata.billing==="monthly");
  const compact=(v:string)=>v.replace(/-/g,"").toLowerCase();
  if(!order||order.payment_provider!=="tebex"||!product||compact(order.player_uuid)!==compact(s.playerUuid)||
      s.priceCents!==product.priceCents||s.currency!==product.currency ||
      (/^[a-f0-9]{32}$/i.test(compact(s.recipientId??"")) ? compact(s.recipientId!)!==compact(order.player_uuid) : order.player_name.toLowerCase()!==s.playerName.toLowerCase()))
    throw new Error("Suscripcion: pedido, precio, paquete o destinatario no verificados.");
  const uuid=compact(s.playerUuid).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
  if(!/^[a-f0-9-]{36}$/.test(uuid))throw new Error("Suscripcion: UUID invalido.");
  const existing=await env.DB.prepare("SELECT player_uuid FROM subscription_events WHERE reference=? LIMIT 1").bind(s.reference).first<{player_uuid:string}>();
  if(existing&&existing.player_uuid!==uuid)throw new Error("Suscripcion: no puede cambiar el destinatario.");
  const reversal=await env.DB.prepare("SELECT 1 FROM payment_reversals WHERE provider='tebex' AND transaction_id=?").bind(s.transactionId).first();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO subscription_events(event_id,reference,player_uuid,payload) VALUES(?,?,?,?)")
      .bind(event.eventId,s.reference,uuid,JSON.stringify({...s,playerUuid:uuid,tier:product.delivery.rankId,kind:reversal?"refund":s.kind})),
    env.DB.prepare("INSERT OR IGNORE INTO processed_webhooks(provider,event_id,received_at) VALUES('tebex',?,?)").bind(event.eventId,Date.now()),
  ]);
}
export async function subscriptionsSince(env: Env, since: number): Promise<SubscriptionRow[]> {
  // Bound every read to one watermark. A concurrent renewal must not advance the
  // cursor past another reference that was not in the original selection.
  const watermark=await env.DB.prepare("SELECT COALESCE(MAX(seq),0) AS revision FROM subscription_events").first<{revision:number}>();
  const ceiling=watermark?.revision??0;
  const refs=await env.DB.prepare("SELECT reference,MAX(seq) AS revision FROM subscription_events WHERE seq<=? GROUP BY reference HAVING MAX(seq)>? ORDER BY MAX(seq) LIMIT 500").bind(ceiling,since).all<{reference:string;revision:number}>();
  const out:SubscriptionRow[]=[];
  for(const ref of refs.results) {
    const events=await env.DB.prepare("SELECT seq,payload FROM subscription_events WHERE reference=? AND seq<=? ORDER BY seq").bind(ref.reference,ceiling).all<{seq:number;payload:string}>();
    out.push(reduceSubscription(events.results));
  }
  return out;
}
