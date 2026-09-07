/** Fuentes y sumideros REALES de la economía única del servidor (verificado 2026-09-05, ver EconomyService/EconomyStats). No se revelan fórmulas internas exactas. */
export const economyInfo = {
  starterMoney: 500,
  starterNote: "Bono de bienvenida, se concede UNA sola vez por jugador (nunca al reconectar/morir/reiniciar).",
  sources: [
    { name: "Pesca", description: "Dinero por cada pescada, más si la rareza es mayor." },
    { name: "Captura Pokémon", description: "Dinero por cada Pokémon salvaje capturado, más si es más raro." },
    { name: "Cacerías (Slayer)", description: "Dinero al completar una Cacería con éxito (150 a 1200 según el tier)." },
    { name: "Liga Pokémon", description: "Dinero al derrotar a un entrenador de Liga (300 a 1500 según el entrenador), repetible." },
    { name: "Cofres", description: "Algunos premios de cofre incluyen dinero." },
  ],
  sinks: [
    { name: "Encantador", description: "Comprar libros de encantamiento Tier I." },
    { name: "Claims / Topógrafo", description: "Comprar Rocas de Protección (100 a 10.000 según el tamaño)." },
    { name: "Comisión del Mercado", description: "Tasa fija + porcentual al listar, más un 5% de impuesto de venta - el dinero de la comisión se destruye, nunca va a otro jugador." },
    { name: "Vendedor de Cacerías", description: "Entrada a algunas Cacerías." },
  ],
  note: "El Mercado entre jugadores TRANSFIERE dinero de un jugador a otro (menos la comisión) - nunca crea dinero nuevo.",
};
