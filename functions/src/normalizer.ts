interface ParsedQuantity {
  quantity: number;
  unit: "g" | "kg" | "ml" | "l" | "st";
}

/**
 * Tolkar svenska kvantitetssträngar till numerisk kvantitet och enhet.
 *
 * Hanterar mönster som:
 *   "500 g", "1,5 l", "330 ml", "1.2 kg"
 *   "6-pack 330 ml", "4 x 125 g"
 *   "ca 400g", "ca. 1,2 kg"
 */
export function parseQuantity(input: string): ParsedQuantity | null {
  const normalized = input.trim().toLowerCase();

  // Multipelmönster: "6-pack 330 ml", "4 x 125 g"
  const multiMatch = normalized.match(
    /(\d+)\s*(?:-pack|x)\s+(\d+[.,]?\d*)\s*(g|kg|ml|l)\b/
  );
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const perUnit = parseSwedishNumber(multiMatch[2]);
    const unit = normalizeUnit(multiMatch[3]);
    if (unit) {
      return { quantity: count * perUnit, unit };
    }
  }

  // Enkelt mönster: "500 g", "ca 400g", "1,5 l"
  const simpleMatch = normalized.match(
    /(?:ca\.?\s+)?(\d+[.,]?\d*)\s*(g|kg|ml|l|st)\b/
  );
  if (simpleMatch) {
    const quantity = parseSwedishNumber(simpleMatch[1]);
    const unit = normalizeUnit(simpleMatch[2]);
    if (unit) {
      return { quantity, unit };
    }
  }

  return null;
}

/**
 * Beräknar jämförpris: kr/100g för viktvaror, kr/l för volymer, kr/st för styckvaror.
 */
export function calculateUnitPrice(
  price: number,
  quantityString: string
): { unitPrice: number; unitLabel: string } | null {
  const parsed = parseQuantity(quantityString);
  if (!parsed) return null;

  const { quantity, unit } = parsed;
  if (quantity <= 0) return null;

  switch (unit) {
    case "g":
      return { unitPrice: (price / quantity) * 100, unitLabel: "kr/100g" };
    case "kg":
      return {
        unitPrice: (price / (quantity * 1000)) * 100,
        unitLabel: "kr/100g",
      };
    case "ml":
      return { unitPrice: (price / quantity) * 1000, unitLabel: "kr/l" };
    case "l":
      return { unitPrice: price / quantity, unitLabel: "kr/l" };
    case "st":
      return { unitPrice: price / quantity, unitLabel: "kr/st" };
  }
}

function parseSwedishNumber(str: string): number {
  return parseFloat(str.replace(",", "."));
}

function normalizeUnit(raw: string): ParsedQuantity["unit"] | null {
  switch (raw) {
    case "g":
      return "g";
    case "kg":
      return "kg";
    case "ml":
      return "ml";
    case "l":
      return "l";
    case "st":
      return "st";
    default:
      return null;
  }
}
