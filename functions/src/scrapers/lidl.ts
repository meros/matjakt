import { ScrapedProduct, Scraper } from "./types.js";

/**
 * Lidl-skrapare för lidl.se.
 *
 * STATUS: Lidl Sverige har INGEN e-handel för matvaror (2025/2026).
 * Lidl driver enbart fysiska butiker i Sverige och har aktivt valt att
 * inte satsa på online-mathandel (källa: ehandel.se, fri-kopenskap.se).
 *
 * Undersökta alternativ:
 *   - lidl.se renderar allt via klient-JS (SPA), ingen produktdata i HTML
 *   - Inget publikt API hittades (vare sig REST eller GraphQL)
 *   - RapidAPI:s Lidl-API stödjer DE/BE/CZ/FR/NL/PL/SK — INTE SE
 *   - Lidl Plus-appen har ett API (kvitton/kuponger) men kräver
 *     mobilautentisering och innehåller inte sortiment/priser
 *   - Reklambladssidan (lidl.se/c/reklamblad/s10018018) laddar data
 *     dynamiskt via leaflets.schwarz-infrastruktur, ej tillgängligt utan
 *     full webbläsarrendering
 *
 * TODO: Om Lidl-data bedöms värdefullt, krävs Playwright för att:
 *   1. Rendera lidl.se/c/vara-varor/s10017042 (sortimentssida)
 *   2. Intercepta nätverksanrop för att hitta den faktiska API-URL:en
 *   3. Alternativt skrapa veckoerbjudanden via reklamblad
 */
export class LidlScraper implements Scraper {
  readonly chainId = "lidl";

  async scrape(): Promise<ScrapedProduct[]> {
    console.warn(
      "[lidl] Lidl Sverige saknar e-handel för matvaror. " +
        "Ingen produktdata kan hämtas via API. " +
        "Kräver Playwright för att intercepta klient-sidans API-anrop. " +
        "Se kommentar i lidl.ts för detaljer."
    );
    return [];
  }
}
