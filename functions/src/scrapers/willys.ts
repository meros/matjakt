import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

/**
 * Gemensam bas för Axfood-skrapare (Willys, Hemköp).
 *
 * Använder det publika sök-API:et på respektive sajt:
 *   GET https://{host}/search?q={term}&size={size}&page={page}
 *
 * Svarsformat (JSON):
 *   {
 *     results: [{ code, name, priceValue, comparePrice, manufacturer, image, displayVolume, … }],
 *     pagination: { totalNumberOfResults, numberOfPages, currentPage, pageSize }
 *   }
 *
 * Strategi: söker på en lista vanliga livsmedelsord, paginerar igenom resultaten
 * och deduplicerar på produktkod. Ger ~1000+ unika produkter utan autentisering.
 */

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 10;

/** Breda sökord som täcker de flesta kategorier */
const SEARCH_TERMS = [
  "mjölk",
  "bröd",
  "kött",
  "frukt",
  "grönsaker",
  "ost",
  "juice",
  "kaffe",
  "pasta",
  "ris",
  "fisk",
  "kyckling",
  "korv",
  "smör",
  "ägg",
  "socker",
  "chips",
  "godis",
  "öl",
  "vatten",
  "schampo",
  "tvål",
  "tvätt",
  "disk",
  "toalettpapper",
  "blöjor",
  "glass",
  "sylt",
  "müsli",
  "yoghurt",
  "soppa",
  "sås",
  "grädde",
  "bacon",
  "skinka",
  "lax",
  "räkor",
  "potatis",
  "lök",
  "tomat",
];

interface AxfoodProduct {
  code?: string;
  name?: string;
  manufacturer?: string;
  priceValue?: number;
  price?: string;
  comparePrice?: string;
  comparePriceUnit?: string;
  displayVolume?: string;
  productLine2?: string;
  image?: { url?: string };
  thumbnail?: { url?: string };
  savingsAmount?: number;
  priceUnit?: string;
  googleAnalyticsCategory?: string;
  potentialPromotions?: Array<{
    price?: { value?: number };
  }>;
}

interface AxfoodSearchResponse {
  results?: AxfoodProduct[];
  pagination?: {
    totalNumberOfResults?: number;
    numberOfPages?: number;
    currentPage?: number;
    pageSize?: number;
  };
}

async function fetchAxfoodPage(
  baseUrl: string,
  query: string,
  page: number,
): Promise<AxfoodSearchResponse> {
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&size=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`${baseUrl} search ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as AxfoodSearchResponse;
}

function mapAxfoodProduct(
  raw: AxfoodProduct,
  baseUrl: string,
): ScrapedProduct | null {
  const code = raw.code;
  if (!code || !raw.name || raw.priceValue == null) return null;

  // EAN kan ibland extraheras från produktkoden (format: EAN_ENHET)
  const eanMatch = code.match(/^(\d{8,14})_/);
  const ean = eanMatch ? eanMatch[1] : undefined;

  // Ordinarie pris: om det finns en kampanj med savingsAmount, är ordinariepris = pris + besparing
  const ordinaryPrice =
    raw.savingsAmount && raw.savingsAmount > 0
      ? raw.priceValue + raw.savingsAmount
      : undefined;

  // Enhet från priceUnit (t.ex. "kr/st", "kr/kg")
  const unitMatch = raw.priceUnit?.match(/kr\/(.+)/);
  const unit = unitMatch ? unitMatch[1] : "st";

  // Kvantitet och kvantitetstext från displayVolume
  const quantityMatch = raw.displayVolume?.match(
    /^([\d,.]+)\s*(g|kg|ml|l|cl|dl|st|m)\b/i,
  );
  const quantity = quantityMatch
    ? parseFloat(quantityMatch[1].replace(",", "."))
    : undefined;

  // Bild-URL (använd fullstorlek om tillgänglig, annars thumbnail)
  const imageUrl = raw.image?.url ?? raw.thumbnail?.url ?? undefined;

  // Produktsida-URL — använd sök-URL istället för gissad slug (sluggar är opålitliga)
  const productUrl = `${baseUrl}/search?q=${encodeURIComponent(raw.name)}`;

  return {
    externalId: code,
    name: raw.name,
    brand: raw.manufacturer || undefined,
    ean,
    price: raw.priceValue,
    ordinaryPrice,
    unit,
    quantity,
    quantityString: raw.displayVolume || undefined,
    imageUrl,
    url: productUrl,
    category: raw.googleAnalyticsCategory || undefined,
  };
}

export async function scrapeAxfood(
  chainId: string,
  baseUrl: string,
): Promise<ScrapedProduct[]> {
  const seen = new Set<string>();
  const products: ScrapedProduct[] = [];

  for (const term of SEARCH_TERMS) {
    try {
      const first = await fetchAxfoodPage(baseUrl, term, 0);
      const totalPages = Math.min(
        first.pagination?.numberOfPages ?? 0,
        MAX_PAGES_PER_QUERY,
      );

      const processResults = (results: AxfoodProduct[]) => {
        for (const raw of results) {
          if (!raw.code || seen.has(raw.code)) continue;
          seen.add(raw.code);

          try {
            const mapped = mapAxfoodProduct(raw, baseUrl);
            if (mapped) {
              products.push(ScrapedProductSchema.parse(mapped));
            }
          } catch (err) {
            console.warn(
              `[${chainId}] Ogiltig produkt ${raw.code}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      };

      processResults(first.results ?? []);

      // Paginera resterande sidor
      for (let page = 1; page < totalPages; page++) {
        try {
          const data = await fetchAxfoodPage(baseUrl, term, page);
          processResults(data.results ?? []);
        } catch (err) {
          console.warn(
            `[${chainId}] Kunde inte hämta sida ${page} för "${term}": ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[${chainId}] Sökning "${term}" misslyckades: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `[${chainId}] Hämtade ${products.length} unika produkter via ${SEARCH_TERMS.length} söktermer`,
  );
  return products;
}

/**
 * Willys-skrapare som använder det publika sök-API:et på willys.se.
 */
export class WillysScraper implements Scraper {
  readonly chainId = "willys";

  async scrape(): Promise<ScrapedProduct[]> {
    return scrapeAxfood(this.chainId, "https://www.willys.se");
  }
}
