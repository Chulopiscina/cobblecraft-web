import type { Env } from "../types";
import { requireServerAuth } from "./delivery";
import { subscriptionsSince } from "../lib/subscriptions";
import { jsonResponse,errorResponse } from "../lib/security";

export async function handleSubscriptions(request: Request,env: Env):Promise<Response> {
  const denied=requireServerAuth(request,env);if(denied)return denied;
  const since=Number(new URL(request.url).searchParams.get("since")??0);
  if(!Number.isSafeInteger(since)||since<0)return errorResponse(env,request,400,"Revision invalida.");
  return jsonResponse(env,request,await subscriptionsSince(env,since));
}
export async function handleSubscriptionAck(request:Request,env:Env):Promise<Response> {
  const denied=requireServerAuth(request,env);if(denied)return denied;
  const body=await request.json() as {revision?:number};
  if(!Number.isSafeInteger(body.revision)||body.revision!<0)return errorResponse(env,request,400,"Revision invalida.");
  await env.DB.prepare(`UPDATE orders SET status='DELIVERED',delivered_at=COALESCE(delivered_at,?)
    WHERE payment_provider='tebex' AND status='PAID' AND public_id IN
    (SELECT json_extract(payload,'$.orderPublicId') FROM subscription_events WHERE seq<=? AND json_extract(payload,'$.kind')='paid')`)
    .bind(Date.now(),body.revision).run();
  return jsonResponse(env,request,{ok:true});
}
