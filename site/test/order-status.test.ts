import { expect, it } from "vitest";
import { orderPresentation } from "../src/lib/order-status";
it.each(["PAID", "CLAIMED"])("%s is pending delivery, never delivered", status => {
  expect(orderPresentation(status, false).label).toBe("Pendiente de entrega");
});
it("cancel URL does not override a confirmed payment or delivery", () => {
  expect(orderPresentation("DELIVERED", false, true).label).toBe("Entregado");
  expect(orderPresentation("PAID", false, true).label).toBe("Pendiente de entrega");
  expect(orderPresentation("PENDING_PAYMENT", false, true).heading).toBe("Pago cancelado");
});
it("review takes precedence; unknown states never imply success", () => {
  expect(orderPresentation("DELIVERED", true).label).toBe("Requiere revisión");
  expect(orderPresentation("unknown", false).label).toBe("Pago no confirmado");
});
