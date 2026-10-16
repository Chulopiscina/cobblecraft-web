/**
 * Dinero del juego en euros (misma regla que el servidor `economy.Money` y el cliente `HudFormat.money`):
 * entero, punto de miles y el símbolo DESPUÉS con un espacio ("93.197 €"). Se agrupa a mano porque
 * `toLocaleString("es-ES")` deja "2000" sin punto (regla CLDR de mínimo 2 dígitos).
 */
export function euros(amount: number): string {
  const n = Math.trunc(amount);
  const digits = Math.abs(n).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return `${n < 0 ? "-" : ""}${out} €`;
}
