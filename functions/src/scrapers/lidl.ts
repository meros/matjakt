import { ScrapedProduct, Scraper } from "./types.js";

/**
 * Lidl-skrapare för lidl.se.
 *
 * STATUS: Lidl Sverige har INGEN e-handel för matvaror (2025/2026).
 * Lidl driver enbart fysiska butiker i Sverige och har valt att inte
 * satsa på online-mathandel. Deras webbplats (lidl.se) visar sortiment
 * och erbjudanden men saknar ett API för produktkatalog med priser.
 *
 * Möjliga framtida strategier:
 *   1. Bevaka om Lidl lanserar e-handel i Sverige
 *   2. Lidl Plus-appen har ett API men det kräver autentisering via
 *      mobilapp och ger främst kvitton/kuponger, inte sortiment
 *   3. Veckoerbjudanden ("Veckans klipp") kan eventuellt skrapas
 *      via HTML-parsing av lidl.se/erbjudanden
 *
 * TODO: Implementera skrapning av erbjudanden via Playwright eller
 * HTML-parsing om det bedöms värdefullt. Kräver dock att sidans
 * JavaScript renderas (SSR/SPA).
 */
export class LidlScraper implements Scraper {
  readonly chainId = "lidl";

  async scrape(): Promise<ScrapedProduct[]> {
    console.warn(
      "[lidl] Lidl Sverige saknar e-handel för matvaror. " +
        "Ingen produktdata kan hämtas via API. " +
        "Se kommentar i lidl.ts för detaljer."
    );
    return [];
  }
}
