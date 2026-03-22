import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

/**
 * City Gross-skrapare som använder Loop54-sökmotorn via citygross.se:s interna API.
 *
 * Kända endpoints:
 *   GET https://www.citygross.se/api/v1/Loop54/search?searchQuery={q}&storeNumber={id}
 *   GET https://www.citygross.se/api/v1/Loop54/products?storeNumber={id}&pageSize={n}&pageIndex={p}
 *
 * Svarsformat (förenklat):
 *   {
 *     searchResults: {
 *       products: [{ id, gtin, name, brand, url, images, subtitle, descriptiveSize,
 *                     superCategory, category, productStoreDetails: { prices: { currentPrice, ordinaryPrice } } }],
 *       totalCount: number,
 *       pageSize: number,
 *       currentPage: number,
 *       totalPages: number
 *     }
 *   }
 *
 * Priser kräver storeNumber — vi använder butik 21 (Malmö) som standard.
 * Bildernas bas-URL: https://d1ax460061ulao.cloudfront.net/300x300/
 */
export class CityGrossScraper implements Scraper {
  readonly chainId = "citygross";

  private readonly baseUrl = "https://www.citygross.se/api/v1/Loop54";
  private readonly imageBaseUrl =
    "https://d1ax460061ulao.cloudfront.net/300x300/";
  private readonly storeNumber = 21;
  private readonly pageSize = 40;
  private readonly maxProducts = 1000;

  async scrape(): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    let pageIndex = 0;

    while (products.length < this.maxProducts) {
      const url = new URL(`${this.baseUrl}/products`);
      url.searchParams.set("storeNumber", String(this.storeNumber));
      url.searchParams.set("pageSize", String(this.pageSize));
      url.searchParams.set("pageIndex", String(pageIndex));

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Matjakt/1.0",
        },
      });

      if (!res.ok) {
        console.error(
          `[citygross] Fel vid hämtning sida ${pageIndex}: ${res.status} ${res.statusText}`
        );
        break;
      }

      const data: CityGrossProductsResponse = await res.json();
      const items = data.items ?? [];

      if (items.length === 0) break;

      for (const raw of items) {
        try {
          const mapped = this.mapProduct(raw);
          if (mapped) {
            products.push(ScrapedProductSchema.parse(mapped));
          }
        } catch (err) {
          console.warn(
            `[citygross] Kunde inte mappa produkt ${raw.id}: ${err}`
          );
        }
      }

      // Kontrollera om vi nått sista sidan
      const totalPages = data.totalPages ?? 1;
      pageIndex++;
      if (pageIndex >= totalPages) break;
    }

    console.log(`[citygross] Hämtade ${products.length} produkter`);
    return products;
  }

  private mapProduct(raw: CityGrossProduct): ScrapedProduct | null {
    const prices = raw.productStoreDetails?.prices;
    const currentPrice = prices?.currentPrice?.price;

    // Hoppa över produkter utan pris
    if (currentPrice == null) return null;

    const image = raw.images?.[0];
    const imageUrl = image?.url
      ? `${this.imageBaseUrl}${image.url}`
      : undefined;

    return {
      externalId: raw.id,
      name: raw.name,
      brand: raw.brand ?? undefined,
      ean: raw.gtin ?? undefined,
      price: currentPrice,
      ordinaryPrice: prices?.ordinaryPrice?.price ?? undefined,
      unit: this.mapUnit(prices?.currentPrice?.unit),
      quantity: raw.netContent?.value
        ? raw.netContent.value / 1000
        : undefined,
      quantityString: raw.descriptiveSize ?? raw.subtitle ?? undefined,
      imageUrl,
      url: raw.url
        ? `https://www.citygross.se${raw.url}`
        : undefined,
      category: raw.category ?? raw.superCategory ?? undefined,
    };
  }

  private mapUnit(unit?: string): string {
    switch (unit) {
      case "PCE":
        return "st";
      case "KGM":
        return "kg";
      case "LTR":
        return "l";
      default:
        return "st";
    }
  }
}

// --- Typdefinitioner för City Gross API-svar ---

interface CityGrossProductsResponse {
  items: CityGrossProduct[];
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
  totalPages?: number;
}

interface CityGrossProduct {
  id: string;
  gtin?: string;
  name: string;
  subtitle?: string;
  brand?: string;
  url?: string;
  descriptiveSize?: string;
  superCategory?: string;
  category?: string;
  images?: { url: string; alt?: string }[];
  netContent?: { unitOfMeasure: number; value: number };
  sellingUnitOfMeasure?: number;
  productStoreDetails?: {
    prices?: {
      currentPrice?: { price: number; unit?: string };
      ordinaryPrice?: { price: number; unit?: string };
    };
  };
}
