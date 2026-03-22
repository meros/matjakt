import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, QueryDocumentSnapshot } from "firebase-admin/firestore";
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
import { upsertRetailerProduct, recordPrice, matchProduct, buildSearchTokens } from "./firestore.js";

initializeApp();

const db = () => getFirestore();

const SCRAPERS: Record<string, () => Scraper> = {
  ica: () => new IcaScraper(),
  willys: () => new WillysScraper(),
  hemkop: () => new HemkopScraper(),
  coop: () => new CoopScraper(),
  citygross: () => new CityGrossScraper(),
  lidl: () => new LidlScraper(),
};

// Minimikrav per kedja — under detta räknas det som misslyckat
const MIN_PRODUCTS: Record<string, number> = {
  willys: 100,
  hemkop: 100,
  coop: 50,
  citygross: 50,
  ica: 0, // WAF-begränsad, 0 ok för nu
  lidl: 0, // Ingen API
};

interface ScrapeResult {
  chainId: string;
  fetched: number;
  saved: number;
  errors: number;
  durationMs: number;
  status: "ok" | "degraded" | "failed";
  errorMessage?: string;
}

/**
 * Loggar skrapningsresultat till Firestore för dashboarding och alerting.
 */
async function logScrapeResult(result: ScrapeResult): Promise<void> {
  await db().collection("scrapeRuns").add({
    ...result,
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function runScraper(scraper: Scraper): Promise<ScrapeResult> {
  const start = Date.now();
  const result: ScrapeResult = {
    chainId: scraper.chainId,
    fetched: 0,
    saved: 0,
    errors: 0,
    durationMs: 0,
    status: "ok",
  };

  try {
    const products = await scraper.scrape();
    result.fetched = products.length;
    logger.info(`Hämtade ${products.length} produkter från ${scraper.chainId}`);

    for (const product of products) {
      try {
        const retailerProductId = await upsertRetailerProduct(
          scraper.chainId,
          product
        );
        await recordPrice(retailerProductId, product.price, product.ordinaryPrice);
        await matchProduct(retailerProductId, product);
        result.saved++;
      } catch (err) {
        result.errors++;
        if (result.errors <= 5) {
          logger.warn(
            `Kunde inte spara ${product.externalId} från ${scraper.chainId}:`,
            err
          );
        }
      }
    }

    // Kontrollera om resultatet är godtagbart
    const minRequired = MIN_PRODUCTS[scraper.chainId] ?? 0;
    if (result.saved < minRequired) {
      result.status = "degraded";
      logger.error(
        `VARNING: ${scraper.chainId} returnerade bara ${result.saved} produkter (minimum: ${minRequired})`
      );
    }

    if (result.errors > result.fetched * 0.2) {
      result.status = "degraded";
      logger.error(
        `VARNING: ${scraper.chainId} hade ${result.errors}/${result.fetched} fel (>20%)`
      );
    }
  } catch (err) {
    result.status = "failed";
    result.errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`KRITISKT: Skrapning av ${scraper.chainId} kraschade:`, err);
  }

  result.durationMs = Date.now() - start;
  logger.info(
    `${scraper.chainId}: ${result.status} — ${result.saved}/${result.fetched} sparade, ${result.errors} fel, ${result.durationMs}ms`
  );

  // Spara resultat för monitoring
  try {
    await logScrapeResult(result);
  } catch (err) {
    logger.error("Kunde inte logga skrapningsresultat:", err);
  }

  return result;
}

// Schemalagda skrapningar med retry-logik
const SCHEDULE_OPTIONS = {
  region: "europe-west1" as const,
  timeoutSeconds: 540,
  memory: "512MiB" as const,
  retryCount: 2,
};

export const scrapeIca = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: "every 4 hours" },
  async () => { await runScraper(new IcaScraper()); }
);

export const scrapeWillys = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: "every 6 hours" },
  async () => { await runScraper(new WillysScraper()); }
);

export const scrapeHemkop = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: "every 6 hours" },
  async () => { await runScraper(new HemkopScraper()); }
);

export const scrapeCoop = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: "every 6 hours" },
  async () => { await runScraper(new CoopScraper()); }
);

export const scrapeCitygross = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: "every 12 hours" },
  async () => { await runScraper(new CityGrossScraper()); }
);

// Manuell skrapning via HTTP
export const manualScrape = onRequest(
  { region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    const chain = req.query.chain as string | undefined;

    const scraperIds = chain ? [chain] : Object.keys(SCRAPERS);
    const unknown = scraperIds.filter((id) => !SCRAPERS[id]);

    if (unknown.length > 0) {
      res.status(400).json({ error: `Okända butikskedjor: ${unknown.join(", ")}` });
      return;
    }

    const results: Record<string, ScrapeResult> = {};
    for (const id of scraperIds) {
      results[id] = await runScraper(SCRAPERS[id]!());
    }

    const hasFailures = Object.values(results).some(
      (r) => r.status === "failed" || r.status === "degraded"
    );
    res.status(hasFailures ? 207 : 200).json({ results });
  }
);

// Engångsbackfill — lägger till nameLower + searchTokens på alla retailerProducts
export const backfillSearchTokens = onRequest(
  { region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" },
  async (_req, res) => {
    const batchSize = 500;
    let processed = 0;
    let lastDoc: QueryDocumentSnapshot | undefined;

    while (true) {
      let q = db()
        .collection("retailerProducts")
        .orderBy("__name__")
        .limit(batchSize);

      if (lastDoc) {
        q = q.startAfter(lastDoc);
      }

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db().batch();
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const name: string = data.name ?? "";
        const brand: string = data.brand ?? "";
        batch.update(docSnap.ref, {
          nameLower: name.toLowerCase(),
          searchTokens: buildSearchTokens(name, brand),
        });
      }
      await batch.commit();

      processed += snap.docs.length;
      lastDoc = snap.docs[snap.docs.length - 1];
      logger.info(`Backfill: ${processed} dokument uppdaterade`);
    }

    logger.info(`Backfill klar: ${processed} dokument totalt`);
    res.status(200).json({ processed });
  }
);

// Health-check endpoint — visar senaste skrapningsstatus per kedja
export const scrapeHealth = onRequest(
  { region: "europe-west1" },
  async (_req, res) => {
    const health: Record<string, unknown> = {};

    for (const chainId of Object.keys(SCRAPERS)) {
      const snap = await db()
        .collection("scrapeRuns")
        .where("chainId", "==", chainId)
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (snap.empty) {
        health[chainId] = { status: "never_run" };
      } else {
        const data = snap.docs[0]!.data();
        health[chainId] = {
          status: data.status,
          saved: data.saved,
          fetched: data.fetched,
          errors: data.errors,
          durationMs: data.durationMs,
          lastRun: data.timestamp?.toDate()?.toISOString(),
        };
      }
    }

    const allOk = Object.values(health).every(
      (h) => (h as Record<string, unknown>).status === "ok"
    );
    res.status(allOk ? 200 : 503).json({ health });
  }
);
