import { ScrapedProduct, Scraper } from "./types.js";
import { scrapeAxfood } from "./willys.js";

/**
 * Hemköp-skrapare som använder samma Axfood-API som Willys.
 *
 * Hemköp och Willys drivs båda av Axfood och har identiska API-strukturer:
 *   GET https://www.hemkop.se/search?q={term}&size={size}&page={page}
 */
export class HemkopScraper implements Scraper {
  readonly chainId = "hemkop";

  async scrape(): Promise<ScrapedProduct[]> {
    return scrapeAxfood(this.chainId, "https://www.hemkop.se");
  }
}
