// Web Oficial V1 - Parte N: capturas automáticas de la web local para que el usuario pueda ver el
// resultado incluso después de parar el servidor de preview. Requiere que `astro dev` (o
// `astro preview`) esté corriendo ya en BASE_URL - este script NUNCA arranca el servidor él mismo.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.PREVIEW_BASE_URL ?? "http://localhost:4321";
const outDir = fileURLToPath(new URL("../docs/previews", import.meta.url));
mkdirSync(outDir, { recursive: true });

const pages = [
  { name: "01-home-desktop", path: "/", viewport: { width: 1440, height: 900 } },
  { name: "02-home-mobile", path: "/", viewport: { width: 390, height: 844 } },
  { name: "03-jugar", path: "/jugar", viewport: { width: 1440, height: 900 } },
  { name: "04-servidor", path: "/servidor", viewport: { width: 1440, height: 900 } },
  { name: "05-tienda", path: "/tienda", viewport: { width: 1440, height: 900 } },
  { name: "06-guia-investigaciones", path: "/guia/investigaciones", viewport: { width: 1440, height: 900 } },
  { name: "07-ayuda", path: "/ayuda", viewport: { width: 1440, height: 900 } },
  { name: "08-legal-terminos", path: "/legal/terminos", viewport: { width: 1440, height: 900 } },
  { name: "09-404", path: "/pagina-que-no-existe", viewport: { width: 1440, height: 900 }, expectedStatus: 404 },
  { name: "10-gracias", path: "/tienda/gracias", viewport: { width: 1440, height: 900 } },
  { name: "11-mock-checkout", path: "/tienda/mock-checkout", viewport: { width: 1440, height: 900 } },
  { name: "12-legal-privacidad", path: "/legal/privacidad", viewport: { width: 1440, height: 900 } },
  { name: "13-legal-reembolsos", path: "/legal/reembolsos", viewport: { width: 1440, height: 900 } },
];

const consoleErrorsByPage = {};

const browser = await chromium.launch();
try {
  for (const p of pages) {
    const page = await browser.newPage({ viewport: p.viewport });
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (p.expectedStatus === 404 && text.includes("404")) return;
        errors.push(text);
      }
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    const res = await page.goto(`${BASE_URL}${p.path}`, { waitUntil: "networkidle" });
    const expectedStatus = p.expectedStatus ?? 200;
    if (!res || res.status() !== expectedStatus) {
      console.error(`✗ ${p.path} -> HTTP ${res ? res.status() : "sin respuesta"}`);
    }

    // Comprobación básica anti-overflow horizontal (Parte N: "sin overflow").
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (hasHorizontalOverflow) {
      errors.push("OVERFLOW HORIZONTAL detectado (scrollWidth > clientWidth)");
    }

    // Fuerza la carga de imágenes lazy antes de comprobarlas.
    await page.evaluate(async () => {
      const step = Math.max(window.innerHeight * 0.8, 400);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");

    // Comprobación básica de imágenes rotas a nivel HTTP. Algunas imágenes lazy pueden no quedar
    // decodificadas en Chromium durante capturas fullPage, aunque el asset exista y responda 200.
    const imageUrls = await page.evaluate(() =>
      Array.from(document.images)
        .map((img) => img.currentSrc || img.src)
        .filter((src) => src.length > 0),
    );
    const brokenImages = [];
    for (const src of imageUrls) {
      const imgRes = await page.request.get(src);
      if (!imgRes.ok()) brokenImages.push(src);
    }
    if (brokenImages.length > 0) {
      errors.push(`Imágenes rotas: ${brokenImages.join(", ")}`);
    }

    // Rediseño visual V2: el header usa `position: sticky` + `backdrop-filter: blur()` (mejora
    // real de UX) - la combinación puede "fantasmear" contenido de más abajo de la página (ej. el
    // footer) en la parte superior de una captura fullPage de Playwright/Chromium, porque
    // backdrop-filter muestrea el layout tras redimensionar el viewport a la altura completa del
    // documento antes de disparar una única captura (artefacto conocido de Chromium, NUNCA visible
    // para un usuario real desplazándose por la página). Se neutraliza temporalmente solo para
    // esta herramienta de diagnóstico, nunca en el sitio real.
    await page.addStyleTag({ content: "[class*='site-header']{position:static !important; backdrop-filter:none !important; background:#f6fbf1 !important;}" });
    const filePath = path.join(outDir, `${p.name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`✓ ${p.path} -> ${filePath}`);

    consoleErrorsByPage[p.name] = errors;
    await page.close();
  }
} finally {
  await browser.close();
}

const anyErrors = Object.values(consoleErrorsByPage).some((e) => e.length > 0);
console.log("\n--- Resumen QA visual automática ---");
for (const [name, errors] of Object.entries(consoleErrorsByPage)) {
  console.log(`${name}: ${errors.length === 0 ? "OK" : `${errors.length} problema(s)`}`);
  for (const e of errors) console.log(`  - ${e}`);
}
console.log("\nQA VISUAL HUMANA PENDIENTE - esta comprobación automática es un smoke test (overflow, imágenes rotas, errores de consola), no una revisión visual real.");

if (anyErrors) process.exitCode = 1;
