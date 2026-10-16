import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname,'../..');
const name = 'progression_core-0.18.11.85.jar';
const source = resolve(root,'.hotfix-src/progression_core-0.18.11.31/build/libs',name);
const bundle = resolve(root,'dist/hosting-update/0.18.11.85-skin-store');
const bytes = await readFile(source); assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
await mkdir(resolve(bundle,'server-mods'),{recursive:true});
await copyFile(source,resolve(bundle,'server-mods',name));
const text = `CobbleCraft 0.18.11.85 - tienda de skins directas. Acumulativo sobre .84.
PebbleHost NO se ha modificado ni reiniciado. No se han tocado mundos ni SQLite de produccion.

Con el servidor parado y backup seguro:
BORRAR solo /home/container/mods/progression_core-0.18.11.84.jar (version activa anterior).
LOCAL: ${resolve(bundle,'server-mods',name)}
REMOTO: /home/container/mods/${name}
Arrancar. No instalar dos JAR de progression_core simultaneamente.
No subir mas archivos, ni borrar configs, SQLite, mundos, playerdata o backups.

Cliente 0.1.91 / pack 1.8.85-beta.1-rp1.4.22 / RP 1.4.22 SIN CAMBIOS.
No es necesario cambiar server.properties.

Entregas whitelist existentes ampliadas SOLO para estos tres productos:
skin_armor_mewtwo -> desbloqueo de cuenta armor_overlay_mewtwo
skin_armor_gyarados -> desbloqueo de cuenta armor_overlay_gyarados
skin_pokemon_charizard_draconico -> 1 progression:cosmetics/skin_charizard_draconico
Armaduras: Menu del Servidor > Cosmeticos > Skins de armadura, equipar/quitar.
Charizard: objeto, clic derecho, Pokemon compatible, preview y confirmar. Aplicacion permanente.

PAGOS BLOQUEADOS hasta instalar este JAR, crear paquetes Tebex REALES de compra unica
(4,99 EUR / 4,99 EUR / 3,99 EUR), configurar sus packageId, verificar entrega y anadir
TEBEX_PRIVATE_KEY al Worker. Ya existen TEBEX_PUBLIC_TOKEN y TEBEX_WEBHOOK_SECRET remotos.
No configurar ademas comandos de entrega Tebex (duplicarian la cola de entrega existente).
Ver web/docs/SKIN_STORE.md para activar el flujo sin saltar las protecciones.
`;
await writeFile(resolve(bundle,'LEEME.txt'),text);
const hash = b=>createHash('sha256').update(b).digest('hex');
await writeFile(resolve(bundle,'SHA256SUMS.txt'),`${hash(bytes)}  server-mods/${name}\n${hash(Buffer.from(text))}  LEEME.txt\n`);
console.log(JSON.stringify({bundle,jar:name,sha256:hash(bytes)},null,2));
