# Configuración del dominio (PENDIENTE - requiere comprar el dominio)

Nada de esto se ha ejecutado - es la guía a seguir el día que se compre un dominio real. El
dominio es el ÚNICO coste fijo aceptado en toda esta arquitectura.

## 1. Comprar el dominio

Cualquier registrador sirve (Cloudflare Registrar es cómodo porque evita mover el DNS después,
pero no es obligatorio). Precio orientativo: 8-15€/año para un `.com`/`.net`/`.gg` genérico -
verificar precio real en el momento de la compra, nunca asumir un número de este documento como
vigente.

## 2. Añadir el dominio a Cloudflare

Si no se compró directamente con Cloudflare Registrar: Cloudflare dashboard → Add a site → sigue
el asistente → actualiza los nameservers en el registrador al par que te da Cloudflare.

## 3. Conectar Cloudflare Pages al dominio

Pages → tu proyecto → Custom domains → Add a custom domain → introduce el dominio (o un
subdominio, ej. `www.tudominio.com` o el propio apex). Cloudflare emite el certificado HTTPS
automáticamente (Universal SSL) - no requiere ninguna acción manual de certificados.

## 4. (Opcional) Subdominio dedicado para la API

Recomendado para claridad: `api.tudominio.com` apuntando al Worker (Workers → tu Worker →
Triggers → Custom domains → Add).

## 5. Actualizar configuración de la web con las URLs reales

- `web/site/astro.config.mjs`: cambiar `site: "https://example.invalid"` por la URL real.
- Cloudflare Pages → Environment variables → `PUBLIC_API_BASE_URL` = `https://api.tudominio.com`
  (o la URL del Worker que hayas elegido).
- `web/worker/wrangler.toml` → `[env.production].vars.CORS_ALLOWED_ORIGIN` = URL real del
  frontend (ej. `https://tudominio.com`, sin barra final).

## 6. Verificación

- `https://tudominio.com` sirve la web con HTTPS válido (candado verde, sin avisos).
- `https://api.tudominio.com/api/health` responde `{"ok":true}`.
- Un pedido de prueba desde el dominio real no da error de CORS (confirma que
  `CORS_ALLOWED_ORIGIN` quedó bien configurado).

## Nota sobre el nombre del servidor

`siteConfig.serverName` (`web/shared/site.config.ts`) sigue siendo el provisional "Servidor
Cobblemon" - si se elige un nombre definitivo distinto al comprar el dominio, cambiarlo en ESE
único archivo actualiza toda la web (título de pestaña, cabecera, pie de página, textos legales)
sin tener que buscar y reemplazar en 15 páginas.
