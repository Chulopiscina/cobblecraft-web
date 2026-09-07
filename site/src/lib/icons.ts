/**
 * Rediseño visual V2 - librería de iconos ORIGINALES propia (line-icons, viewBox 24x24, trazo
 * `currentColor`) para sustituir los emojis usados en V1. Nunca copia iconografía oficial de
 * Minecraft/Pokémon - formas genéricas del universo "aventura/colección/progresión" (espada,
 * pico, caña, cristal, portal, escudo...). Un único diccionario central para que `Icon.astro`
 * pueda renderizarlos inline sin peticiones de red adicionales (cero impacto en rendimiento).
 */
export const ICONS: Record<string, string> = {
  // --- Skills ---
  pesca: '<path d="M12 3v9m0 0-3-2m3 2 3-2" /><circle cx="12" cy="16" r="4.5" /><path d="M9.5 18.5 6 22" />',
  mineria: '<path d="M5 13 15 3l2 2L7 15z" /><path d="M4 20l3-3M16 8l3-3a2.5 2.5 0 0 0-3.5-3.5L12 5" /><path d="M6 14l4 4" />',
  agricultura: '<path d="M12 21V9" /><path d="M12 9c-4-1-5-5-5-7 4 0 6 3 5 7Z" /><path d="M12 13c4-1 5-4.5 5-6.5-3.5 0-5.5 2.5-5 6.5Z" /><path d="M8 21h8" />',
  recoleccion: '<path d="M17 3 7 13" /><path d="M17 3a3 3 0 0 1 3 3l-6 6" /><path d="M5 15l4 4M4 20l3-3" /><path d="M7 13l-2 2 4 4 2-2" />',
  combate: '<path d="M6.5 20 4 17.5 15 6.5 17.5 9Z" /><path d="M17.5 9 20 6.5 17.5 4 15 6.5" /><path d="M9 13l2 2" /><path d="M4.5 19.5l1-1" />',
  captura: '<circle cx="12" cy="12" r="9" /><path d="M3 12h6m6 0h6" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3v3.4M12 17.6V21" />',
  cria: '<path d="M12 21c-4 0-6.5-3.2-6.5-6.8C5.5 9.8 8.4 4 12 4s6.5 5.8 6.5 10.2C18.5 17.8 16 21 12 21Z" /><circle cx="9.6" cy="13.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="14.4" cy="13.5" r="0.9" fill="currentColor" stroke="none" />',
  slayer: '<path d="M5 19 12 5l2 1-7 14Z" /><path d="M19 19 12 5l-2 1 7 14Z" /><path d="M12 5V3" />',

  // --- Mundo ---
  hub: '<path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-6h6v6" /><path d="M4 10h16" />',
  survival: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />',
  portal: '<ellipse cx="12" cy="12" rx="6" ry="9" /><ellipse cx="12" cy="12" rx="2.4" ry="6" />',
  jefe: '<path d="M4 10 8 4l4 4 4-4 4 6-2 8H6Z" /><path d="M9 14h6" /><circle cx="9.5" cy="11" r="0.8" fill="currentColor" stroke="none" /><circle cx="14.5" cy="11" r="0.8" fill="currentColor" stroke="none" />',

  // --- Economía ---
  moneda: '<circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.3 9.3c0-1.4 1.2-2.1 2.7-2.1s2.7.9 2.7 2c0 3-5.4 1.6-5.4 4.4 0 1.2 1.2 2.1 2.7 2.1s2.7-.7 2.7-2" />',
  tienda: '<path d="M4 10 5 4h14l1 6" /><path d="M4 10v10h16V10" /><path d="M4 10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M10 20v-5h4v5" />',
  mercado: '<path d="M4 8h11l-3-3M20 16H9l3 3" /><path d="M4 8v-.5A1.5 1.5 0 0 1 5.5 6M20 16v.5a1.5 1.5 0 0 1-1.5 1.5" />',
  coleccion: '<rect x="4" y="5" width="9" height="13" rx="1.5" /><rect x="11" y="8" width="9" height="13" rx="1.5" /><circle cx="8.5" cy="11.5" r="1.6" />',

  // --- Equipo / progresión ---
  escudo: '<path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6Z" /><path d="M9 12l2 2 4-4" />',
  libro: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19" /><path d="M9 7h6M9 10h6" />',
  medalla: '<circle cx="12" cy="9" r="5.5" /><path d="M9.2 13.6 7 21l5-2.4 5 2.4-2.2-7.4" /><path d="M12 6.5v5M9.8 9h4.4" />',
  cristal: '<path d="M12 3 6 9l6 12 6-12Z" /><path d="M6 9h12M9.5 9 12 15l2.5-6" />',
  altar: '<path d="M6 21V11l6-6 6 6v10" /><path d="M9 21v-7h6v7" /><path d="M10 8h4" />',
  material: '<rect x="5" y="5" width="14" height="14" rx="2" transform="rotate(45 12 12)" /><rect x="9" y="9" width="6" height="6" transform="rotate(45 12 12)" />',
  paleta: '<path d="M12 3a9 8 0 1 0 0 16c1.4 0 2-1 2-2s-.6-1.6-.6-2.4c0-1.1.9-1.6 2-1.6H17a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z" /><circle cx="8.2" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="11" cy="8.2" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none" />',
  cofre: '<rect x="4" y="10.5" width="16" height="9" rx="1.5" /><path d="M4 10.5a8 5.5 0 0 1 16 0" /><path d="M4 14.5h16" /><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none" />',
  accesorio: '<path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" /><path d="M5.5 8h13l1 11.5a2 2 0 0 1-2 2.2H6.5a2 2 0 0 1-2-2.2Z" /><circle cx="12" cy="13.5" r="2.3" />',
  cosmetico: '<path d="M12 3.5 13.6 9l5.4 1.5-5.4 1.5L12 17.5 10.4 12 5 10.5 10.4 9Z" /><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />',

  // --- UI ---
  descarga: '<path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />',
  check: '<path d="M4 12.5 9.5 18 20 6" />',
  usuario: '<circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />',
  candado: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />',
  reloj: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />',
  flecha: '<path d="M5 12h13m0 0-5-5m5 5-5 5" />',
};

export type IconName = keyof typeof ICONS;
