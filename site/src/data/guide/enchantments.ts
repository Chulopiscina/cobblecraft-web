/** EnchantModels/EnchantVendorConfig/HarvestFortune, audited 2026-10-16. */
export interface EnchantFamilyInfo {
  id: string;
  name: string;
  effect: string;
  tier1Price: number;
  itemSlug: string | null;
  appliesTo?: string;
  tiers?: string[];
}

export const enchantFamilies: EnchantFamilyInfo[] = [
  { id: "fishing_luck", name: "Suerte de Pesca", effect: "Mejora la Suerte de Pesca al equipar la caña/armadura de Pesca correspondiente.", tier1Price: 150, itemSlug: "libro-suerte-de-pesca" },
  { id: "capture_luck", name: "Suerte de Captura", effect: "Mejora la probabilidad de captura de Pokémon salvajes.", tier1Price: 200, itemSlug: "libro-suerte-de-captura" },
  { id: "mining_fortune", name: "Fortuna de Minería", effect: "Mejora el rendimiento al minar.", tier1Price: 150, itemSlug: "libro-fortuna-de-mineria" },
  { id: "farming_fortune", name: "Fortuna de Agricultura", effect: "Mejora el rendimiento al cultivar.", tier1Price: 150, itemSlug: "libro-fortuna-de-agricultura" },
  { id: "foraging_fortune", name: "Fortuna de Recolección", effect: "Mejora el rendimiento al talar/recolectar.", tier1Price: 150, itemSlug: "libro-fortuna-de-recoleccion" },
  { id: "crit_chance", name: "Probabilidad Crítica", effect: "Mejora la probabilidad de golpe crítico en combate Pokémon.", tier1Price: 250, itemSlug: "libro-probabilidad-critica" },
  { id: "crit_damage", name: "Daño Crítico", effect: "Mejora el daño de los golpes críticos en combate Pokémon.", tier1Price: 250, itemSlug: "libro-dano-critico" },
  { id: "slayer_power", name: "Poder de Cacería", effect: "Mejora el daño contra Jefes Slayer (solo en armadura de Slayer Combat).", tier1Price: 300, itemSlug: "libro-poder-de-caceria" },
  { id: "slayer_resistance", name: "Resistencia de Cacería", effect: "Mejora la resistencia al daño de Jefes Slayer (solo en armadura de Slayer Combat).", tier1Price: 300, itemSlug: "libro-resistencia-de-caceria" },
];

const effects:Record<string,{appliesTo:string;tiers:string[];effect:string}>={
  fishing_luck:{appliesTo:"Cañas propias y armadura de Pesca",tiers:["+8","+16","+28","+45","+70","+100"],effect:"Suma puntos de Suerte de Pesca: mejora el reparto de rarezas; no equivale a una probabilidad fija de objeto raro ni a Fortuna de recursos."},
  capture_luck:{appliesTo:"Armadura de Captura",tiers:["+10 %","+20 %","+35 %","+60 %","+100 %","+175 %"],effect:"Suma al bonus del equipo y multiplica la tasa de captura por 1 + bonus. La probabilidad final sigue dependiendo de especie, Ball, PS y estado."},
  mining_fortune:{appliesTo:"Picos propios y armadura de Minería",tiers:["+12,5 %","+25 %","+40 %","+55 %","+75 %","+100 %"],effect:"Suma Fortuna custom al drop base de las menas soportadas, naturales o recolocadas. Sin límite del 100 % y sin duplicar la mena de Toque de Seda."},
  farming_fortune:{appliesTo:"Azadas propias y armadura de Agricultura",tiers:["+25 %","+50 %","+80 %","+110 %","+150 %","+200 %"],effect:"Más cosecha en las recolecciones válidas soportadas. El total se convierte en extras garantizados más una tirada fraccionaria."},
  foraging_fortune:{appliesTo:"Hachas propias y armadura de Recolección",tiers:["+25 %","+50 %","+80 %","+110 %","+150 %","+200 %"],effect:"Suma extras al recolectar recursos de Tala compatibles; se mantiene la protección contra colocar/romper artificialmente para ganar progreso."},
  crit_chance:{appliesTo:"Armadura de Maestría I, II o III",tiers:["+2 %","+4 %","+6 %","+9 %","+12 %","+16 %"],effect:"Aporta probabilidad crítica en combate Pokémon. No se aplica a espadas ni al combate vanilla; usa las restricciones de Maestría."},
  crit_damage:{appliesTo:"Armadura de Maestría I, II o III",tiers:["×1,60","×1,70","×1,80","×1,95","×2,10","×2,30"],effect:"Define la escala de daño crítico Pokémon del libro. No añade drops ni utiliza la fórmula de Fortuna."},
  slayer_power:{appliesTo:"Armadura de Cacería",tiers:["+5 %","+10 %","+16 %","+24 %","+34 %","+46 %"],effect:"Aumenta el daño solo contra un jefe Slayer real. Mantiene los límites defensivos y de combate del sistema, no la fórmula de drops."},
  slayer_resistance:{appliesTo:"Armadura de Cacería",tiers:["−3 %","−6 %","−10 %","−15 %","−21 %","−28 %"],effect:"Reduce el daño recibido de jefes Slayer; no da inmunidad ni se convierte en extras al superar el 100 %."},
};
for(const family of enchantFamilies) Object.assign(family,effects[family.id]);
for(const [id,name] of [["pokemon_attack","Ataque Pokémon"],["pokemon_defense","Defensa Pokémon"],["pokemon_special_attack","Ataque Especial Pokémon"],["pokemon_special_defense","Defensa Especial Pokémon"],["pokemon_speed","Velocidad Pokémon"]]) {
  enchantFamilies.push({id,name,effect:"Suma puntos de esta estadística al bonus de Maestría al comenzar el combate; no modifica IVs, EVs ni datos permanentes. El motor actual limita el total efectivo a +64 por estadística.",appliesTo:"Armadura de Maestría I, II o III",tiers:["+3","+6","+10","+15","+21","+30"],tier1Price:250,itemSlug:`libro-${id.replaceAll("_","-")}`});
}
