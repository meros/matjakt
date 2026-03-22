import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { IcaScraper } from "./scrapers/ica.js";
import { WillysScraper } from "./scrapers/willys.js";
import { HemkopScraper } from "./scrapers/hemkop.js";
import { CoopScraper } from "./scrapers/coop.js";
import { CityGrossScraper } from "./scrapers/citygross.js";
import { LidlScraper } from "./scrapers/lidl.js";
import { Scraper } from "./scrapers/types.js";
import { upsertRetailerProduct, recordPrice, matchProduct } from "./firestore.js";

initializeApp();

const SCRAPERS: Record<string, () => Scraper> = {
  ica: () => new IcaScraper(),
  willys: () => new WillysScraper(),
  hemkop: () => new HemkopScraper(),
  coop: () => new CoopScraper(),
  citygross: () => new CityGrossScraper(),
  lidl: () => new LidlScraper(),
};

async function runScraper(scraper: Scraper): Promise<number> {
  logger.info(`Startar skrapning för ${scraper.chainId}`);

  const products = await scraper.scrape();
  logger.info(`Hämtade ${products.length} produkter från ${scraper.chainId}`);

  let saved = 0;
  for (const product of products) {
    try {
      const retailerProductId = await upsertRetailerProduct(
        scraper.chainId,
        product
      );
      await recordPrice(retailerProductId, product.price, product.ordinaryPrice);
      await matchProduct(retailerProductId, product);
      saved++;
    } catch (err) {
      logger.warn(`Kunde inte spara produkt ${product.externalId} från ${scraper.chainId}:`, err);
    }
  }

  logger.info(`Klar med ${scraper.chainId}: ${saved}/${products.length} produkter sparade`);
  return saved;
}

// Schemalagda skrapningar
export const scrapeIca = onSchedule(
  { schedule: "every 4 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => { await runScraper(new IcaScraper()); }
);

export const scrapeWillys = onSchedule(
  { schedule: "every 6 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => { await runScraper(new WillysScraper()); }
);

export const scrapeHemkop = onSchedule(
  { schedule: "every 6 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => { await runScraper(new HemkopScraper()); }
);

export const scrapeCoop = onSchedule(
  { schedule: "every 6 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => { await runScraper(new CoopScraper()); }
);

export const scrapeCitygross = onSchedule(
  { schedule: "every 12 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => { await runScraper(new CityGrossScraper()); }
);

// Manuell skrapning via HTTP
export const manualScrape = onRequest(
  { region: "europe-west1", timeoutSeconds: 540 },
  async (req, res) => {
    const chain = req.query.chain as string | undefined;

    const scraperIds = chain ? [chain] : Object.keys(SCRAPERS);
    const unknown = scraperIds.filter((id) => !SCRAPERS[id]);

    if (unknown.length > 0) {
      res.status(400).json({ error: `Okända butikskedjor: ${unknown.join(", ")}` });
      return;
    }

    const results: Record<string, number> = {};
    for (const id of scraperIds) {
      try {
        results[id] = await runScraper(SCRAPERS[id]!());
      } catch (err) {
        logger.error(`Skrapning misslyckades för ${id}:`, err);
        results[id] = -1;
      }
    }

    res.json({ results });
  }
);
