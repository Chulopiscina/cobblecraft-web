-- /vote V2 (2026-09-11) - "UN VOTO POR DIA DE COBBLECRAFT", ventana GLOBAL diaria (NUNCA rolling
-- "ultimo voto + N horas"). vote_period_id es un string estable "YYYY-MM-DD" calculado por
-- lib/vote-period.ts (timezone + hora de reset configurables, default Europe/Madrid 00:00).
--
-- El indice UNICO (player_uuid, vote_period_id) es la autoridad REAL de "1 voto por periodo" a
-- nivel de base de datos - nunca solo una comprobacion a nivel de aplicacion (defensa en
-- profundidad ante una condicion de carrera real, ademas del nonce atomico ya existente en
-- vote_sessions). Un INSERT que violase esta restriccion debe tratarse como "ya voto este
-- periodo", nunca como un error fatal - ver insertVote/hasVotedInPeriod en lib/votes.ts.
ALTER TABLE votes ADD COLUMN vote_period_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_votes_uuid_period ON votes(player_uuid, vote_period_id);
