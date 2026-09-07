-- Web + Store Production Hardening V1 (Fase B - claim lease). Un token unico por cada intento de
-- claim real ("generacion" del claim) - permite a `ackDelivered` distinguir un ACK que corresponde
-- al claim VIGENTE de un ACK tardio que corresponde a un claim YA SUPERADO (reclamado de nuevo tras
-- expirar su timeout). Ver web/docs/DELIVERY_FAILURE_RECOVERY.md para el protocolo completo y por
-- que esto es defensa en profundidad (la protección real contra duplicados ya la da
-- `processed_ops` en progression_core - este token añade DETECCIÓN explícita de la anomalía, nunca
-- reemplaza esa capa).
ALTER TABLE orders ADD COLUMN claim_token TEXT;
