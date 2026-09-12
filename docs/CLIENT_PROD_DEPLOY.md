# Actualizaciones del cliente en PROD

El proyecto Pages `cobblemon-server-site` usa **Direct Upload**, sin Git Provider.
Un push a `cobblecraft-web/main` NO publica la web. No cambiar este metodo ni
desplegar el Worker para actualizar el cliente.

Desde la carpeta `Servidor Cobblemon`, con Node y las dependencias web instaladas:

```powershell
node web/scripts/deploy-client-prod.mjs --release dist/client-update/0.11.6 --check-only
node web/scripts/deploy-client-prod.mjs --release dist/client-update/0.11.6
```

Para la siguiente actualizacion, cambiar solo el directorio `--release`.
Debe contener `web/launcher/pack-manifest.json` y los archivos nuevos bajo
`web/launcher/files/`. Las descargas del CDN Modrinth no se realojan.

El script valida PROD, servidor sin cambios, rutas, IDs, hashes y tamanos;
comprueba todos los archivos del build anterior contra su URL inmutable;
copia a un directorio aislado ese build y superpone solo la actualizacion.
Conserva las reglas actuales de cache/redirects, tienda, paginas, imagenes y
launcher-manifest. No compila fuentes web sucias ni toca Minecraft.

Solo hace stage/commit de los archivos de la actualizacion. Rechaza un index
previamente ocupado, cambios locales distintos en esos archivos, commits ajenos
sin publicar, otra rama/remote, divergencias o cambios simultaneos de produccion.
No usa `git add .`, force-push, reset, borrados ni rollback automatico.
Despues del push hace Direct Upload con Wrangler a PROD/main, espera hasta cinco
minutos y verifica el manifest canonico, todos sus binarios por SHA256/tamano y
el resto del sitio byte a byte. Repetir una version ya publicada solo verifica;
no crea commits vacios ni despliegues duplicados.

Requiere la autenticacion Git existente y `wrangler login` (o un
`CLOUDFLARE_API_TOKEN` ya configurado). Nunca almacena ni imprime credenciales.
No se requiere autenticacion nueva si la sesion actual sigue siendo valida.

Informes, base anterior y builds aislados: `web/.wrangler/client-prod/` (ignorados
por Git). `last-success.json` permite reutilizar la ultima base en la siguiente
actualizacion. Si hubo un despliegue web independiente, el script vuelve a
`web/site/dist`; se puede indicar `--baseline ruta/al/build/publicado`.
La base siempre debe coincidir con la produccion actual; si cambia, se bloquea.
Si cambian legitimamente `_headers` o `_redirects`, revisar sus hashes fijados
en el script antes de usar la nueva base. No se admiten Pages Functions.

Pruebas y verificacion publica sin publicar:

```powershell
node --test web/scripts/deploy-client-prod.test.mjs
node web/scripts/deploy-client-prod.mjs --release dist/client-update/0.11.6 --verify-only
```

El launcher 1.1.0 sigue leyendo el mismo endpoint de pack-manifest. Esta entrega
no necesita reconstruir su ejecutable ni reiniciar el servidor.
