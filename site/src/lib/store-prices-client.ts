import { StorePricesSchema, formatStorePrice, billingLabel } from "@shared/store-prices";

let started=false;
export function startPriceSync() {
  if (started) return; started=true;
  const nodes=[...document.querySelectorAll<HTMLElement>("[data-live-price]")];
  if (!nodes.length) return;
  const form=document.querySelector<HTMLFormElement>("#purchase-form");
  let refreshTimer:number,expiryTimer:number,expiresAt=0,busy=false;
  const invalidate=()=>{
    for (const node of nodes) {node.textContent="Precio no disponible";node.dataset.priceState="unavailable";}
    if (form) {form.dataset.priceVerified="false";delete form.dataset.displayedPriceCents;delete form.dataset.displayedCurrency;}
    document.dispatchEvent(new Event("store-prices-updated"));
  };
  const refresh=async()=>{
    if (busy || document.hidden) return;
    busy=true;clearTimeout(refreshTimer);const began=Date.now();
    try {
      const response=await fetch(`${nodes[0].dataset.apiBase}/api/store/prices`,{cache:"no-store",signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error("Unavailable");
      const snapshot=StorePricesSchema.parse(await response.json());
      let lifetime=120000;
      invalidate();
      for (const node of nodes) {
        const quote=snapshot.prices.find(p=>p.productId===node.dataset.livePrice);
        const remaining=quote ? quote.expiresAt-snapshot.serverTime-(Date.now()-began) : 0;
        if (!quote?.available || remaining<=0) continue;
        lifetime=Math.min(lifetime,remaining);
        node.textContent=formatStorePrice(quote);node.dataset.priceState="verified";
        node.title="Precio base verificado en Tebex. Los impuestos aplicables se detallan en su checkout.";
        const scope=node.closest("[data-price-product]");
        scope?.querySelectorAll<HTMLElement>("[data-live-billing]").forEach(n=>n.textContent=billingLabel(quote));
        if (form?.dataset.productId===quote.productId) {
          form.dataset.priceVerified=String(quote.disabled!==true);
          form.dataset.displayedPriceCents=String(quote.priceCents);form.dataset.displayedCurrency=quote.currency!;
          const button=form.querySelector<HTMLButtonElement>("#purchase-submit");
          if(button) button.dataset.label=`Comprar por ${formatStorePrice(quote)}`;
        }
      }
      expiresAt=Date.now()+lifetime;clearTimeout(expiryTimer);
      expiryTimer=window.setTimeout(invalidate,Math.max(1,lifetime));
      document.dispatchEvent(new Event("store-prices-updated"));
    } catch {invalidate();}
    finally {busy=false;refreshTimer=window.setTimeout(refresh,60000);}
  };
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){if(Date.now()>=expiresAt)invalidate();void refresh();}});
  window.addEventListener("online",()=>void refresh());
  window.addEventListener("pageshow",()=>{if(Date.now()>=expiresAt)invalidate();void refresh();});
  void refresh();
}
