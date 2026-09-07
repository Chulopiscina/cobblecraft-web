/** Datos reales de `market.properties` (verificado 2026-09-05). */
export const marketInfo = {
  listingDurationHours: 72,
  listingFeeFlat: 2,
  listingFeePercent: 1.0,
  salesTaxPercent: 5.0,
  pokemonSalesTaxPercent: 5.0,
  maxActiveListingsBySkillLevel: [
    { skillsAtLeast: 0, level: 0, maxListings: 3 },
    { skillsAtLeast: 1, level: 15, maxListings: 5 },
    { skillsAtLeast: 2, level: 30, maxListings: 8 },
    { skillsAtLeast: 3, level: 50, maxListings: 10 },
  ],
  pokemonMaxActiveListingsBySkillLevel: [
    { level: 1, maxListings: 1 },
    { level: 20, maxListings: 2 },
    { level: 50, maxListings: 3 },
    { level: 90, maxListings: 5 },
  ],
};
