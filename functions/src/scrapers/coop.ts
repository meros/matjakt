import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

/**
 * Coop-skrapare som använder Coop:s personaliserings-API.
 *
 * Endpoint (POST):
 *   https://external.api.coop.se/personalization/search/entities/by-attribute
 *     ?api-version=v1&store=251300&groups=CUSTOMER_PRIVATE&device=desktop&direct=false
 *
 * Auth: Ocp-Apim-Subscription-Key (hämtas dynamiskt från window.coopSettings
 *       på coop.se, nyckel "personalizationApiSubscriptionKey").
 *
 * Request body (JSON):
 *   {
 *     attribute: { name: "categoryIds", value: "6262" },
 *     requestAlias: { name: "Subcategory", value: "mejeri-agg", details: "/mejeri-agg" },
 *     resultsOptions: { skip: 0, take: 48, sortBy: [], facets: [] }
 *   }
 *
 * Svarsformat:
 *   { results: { items: [...], count: number } }
 *
 * Produktfält (urval):
 *   id, name, ean, salesPrice, salesPriceData.b2cPrice,
 *   comparativePrice, comparativePriceData.b2cPrice,
 *   comparativePriceUnit: { text, unit }, packageSizeInformation,
 *   navCategories, url, images
 */
export class CoopScraper implements Scraper {
  readonly chainId = "coop";

  private readonly endpoint =
    "https://external.api.coop.se/personalization/search/entities/by-attribute";
  private readonly storeId = "251300";
  private readonly pageSize = 48;
  private readonly maxProducts = 1000;

  /** Kategori-slug → kategori-ID (från coop.se) */
  private readonly categories: Record<string, string> = {
    "/apotek-halsa-tillskott": "30793",
    "/barn": "27107",
    "/brod-bageri": "18121",
    "/delikatesser": "48200",
    "/djurmat-tillbehor": "32045",
    "/dryck": "22410",
    "/fardigmat-mellanmal": "5377683",
    "/fisk-skaldjur": "14754",
    "/fritid": "324532",
    "/frukt-gronsaker": "16534",
    "/frys": "25854",
    "/godis-glass-snacks": "24425",
    "/hem-inredning": "29662",
    "/hushall": "29659",
    "/kiosk-tidningar": "3839",
    "/kott-fagel-chark": "11777",
    "/kryddor-smaksattare": "24420",
    "/mejeri-agg": "6262",
    "/ost": "6327",
    "/skafferi": "21330",
    "/skonhet-hygien": "28395",
    "/vegetariskt": "39033900",
  };

  // Hårdkodad nyckel (från window.coopSettings.personalizationApiSubscriptionKey).
  // Om den slutar fungera, hämta dynamiskt från coop.se HTML.
  private readonly subscriptionKey = "3becf0ce306f41a1ae94077c16798187";

  async scrape(): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    for (const [slug, categoryId] of Object.entries(this.categories)) {
      if (products.length >= this.maxProducts) break;

      let skip = 0;
      let totalCount = Infinity;

      while (skip < totalCount && products.length < this.maxProducts) {
        try {
          const data = await this.fetchCategory(slug, categoryId, skip);
          const results = data?.results ?? {};
          const items: CoopProduct[] =
            results.items ?? results.results ?? [];
          totalCount = results.count ?? 0;

          if (items.length === 0) break;

          for (const raw of items) {
            try {
              const mapped = this.mapProduct(raw, slug);
              if (mapped) {
                products.push(ScrapedProductSchema.parse(mapped));
              }
            } catch (err) {
              console.warn(
                `[coop] Kunde inte mappa produkt ${raw.id}: ${err}`
              );
            }
          }

          skip += this.pageSize;
        } catch (err) {
          console.error(
            `[coop] Fel vid hämtning av kategori ${slug} (skip=${skip}): ${err}`
          );
          break;
        }
      }
    }

    console.log(`[coop] Hämtade ${products.length} produkter`);
    return products;
  }

  private async fetchCategory(
    slug: string,
    categoryId: string,
    skip: number
  ): Promise<CoopApiResponse> {
    const url =
      `${this.endpoint}?api-version=v1` +
      `&store=${this.storeId}` +
      `&groups=CUSTOMER_PRIVATE` +
      `&device=desktop` +
      `&direct=false`;

    const slugPart = slug.split("/").pop() ?? slug;
    const body = {
      attribute: { name: "categoryIds", value: categoryId },
      requestAlias: {
        name: "Subcategory",
        value: slugPart,
        details: slug,
      },
      resultsOptions: {
        skip,
        take: this.pageSize,
        sortBy: [],
        facets: [],
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.subscriptionKey,
        "Origin": "https://www.coop.se",
        "Referer": "https://www.coop.se/",
        "User-Agent": "Matjakt/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<CoopApiResponse>;
  }

  private mapProduct(raw: CoopProduct, slug: string): ScrapedProduct | null {
    // Pris kan vara ett enkelt tal eller nästlat under salesPriceData
    let price = raw.salesPrice;
    if (price == null) {
      const salesData = raw.salesPriceData ?? raw.piecePriceData;
      price = salesData?.b2cPrice;
    }
    if (price == null) return null;

    // Jämförelsepris (enhetsbaserat)
    let unitPrice = raw.comparativePrice;
    if (unitPrice == null) {
      unitPrice = raw.comparativePriceData?.b2cPrice;
    }

    const compUnit = raw.comparativePriceUnit;
    const unit = compUnit?.unit ?? "st";

    // Bygg produkt-URL
    const productUrl = this.buildProductUrl(raw, slug);

    // Kategori från navCategories
    const navCat = raw.navCategories?.[0];
    const superCat = navCat?.superCategories?.[0];
    const category = superCat?.name ?? navCat?.name ?? undefined;

    return {
      externalId: raw.id,
      name: raw.name,
      ean: raw.ean ?? undefined,
      price,
      ordinaryPrice: unitPrice ?? undefined,
      unit,
      quantityString: raw.packageSizeInformation ?? undefined,
      imageUrl: raw.image ?? undefined,
      url: productUrl,
      category,
    };
  }

  private buildProductUrl(raw: CoopProduct, slug: string): string | undefined {
    if (raw.url) return raw.url;
    if (raw.productUrl) return raw.productUrl;
    if (!raw.id || !raw.name) return undefined;

    const sanitizedName = raw.name.toLowerCase().split(/\s+/).join("-");
    return `https://www.coop.se/handla/varor${slug}/${sanitizedName}-${raw.id}`;
  }
}

// --- Typdefinitioner för Coop Personalization API ---

interface CoopApiResponse {
  results?: {
    items?: CoopProduct[];
    results?: CoopProduct[];
    count?: number;
  };
}

interface CoopProduct {
  id: string;
  name: string;
  ean?: string;
  salesPrice?: number;
  salesPriceData?: { b2cPrice?: number };
  piecePriceData?: { b2cPrice?: number };
  comparativePrice?: number;
  comparativePriceData?: { b2cPrice?: number };
  comparativePriceUnit?: { text?: string; unit?: string };
  packageSizeInformation?: string;
  navCategories?: {
    code?: string;
    name?: string;
    superCategories?: { code?: string; name?: string }[];
  }[];
  url?: string;
  productUrl?: string;
  image?: string;
  availableOnline?: boolean;
  onlinePromotions?: unknown[];
}
