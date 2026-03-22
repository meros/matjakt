import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

/**
 * ICA-skrapare som använder ICAs publika API:er:
 *
 *   1. Hämtar en anonym åtkomsttoken via www.ica.se/e11/public-access-token
 *   2. Söker hela sortimentet via globalSearch-API:et på apimgw-pub.ica.se
 *      (wildcard-sökning "*" med offset-paginering, ger ~19 000 produkter)
 *   3. Hämtar aktuella butikserbjudanden via offerreader-API:et
 *
 * Ingen inloggning eller JavaScript-exekvering krävs — allt går via
 * vanliga HTTP-anrop.
 */

// -------------------------------------------------------------------
// Konfiguration
// -------------------------------------------------------------------

/**
 * Maxi ICA Stormarknad Lindhagen — centralt i Stockholm med brett sortiment.
 * accountNumber identifierar butiken mot sök-API:et, storeId mot erbjudande-API:et.
 */
const DEFAULT_ACCOUNT_NUMBER = "1003418";
const DEFAULT_STORE_ID = "13164";

const TOKEN_URL = "https://www.ica.se/e11/public-access-token";
const API_BASE = "https://apimgw-pub.ica.se/sverige/digx";
const SEARCH_URL = `${API_BASE}/globalsearch/v1/search/quicksearch`;
const OFFERS_URL = `${API_BASE}/offerreader/v1/offers/store`;

/** Antal produkter per sida (max verkar vara 500) */
const PAGE_SIZE = 500;

/** Max antal produkter att hämta totalt */
const MAX_PRODUCTS = 20_000;

// -------------------------------------------------------------------
// Typer
// -------------------------------------------------------------------

interface IcaTokenResponse {
  publicAccessToken: string;
  tokenExpires: string;
  isAnonymous: boolean;
}

interface IcaSearchProduct {
  id: string | null;
  accountNumber: string;
  consumerItemId: string;
  gtin: string;
  displayName: string;
  price: string;
  image: string | null;
  title: string;
  categoryName: string | null;
  mainCategoryName: string | null;
  meanWeight: string | null;
  countryOfOriginName: string | null;
  ageLimitid: string | null;
}

interface IcaSearchResponse {
  products: {
    documents: IcaSearchProduct[];
    stats: {
      totalHits: number;
    };
  };
  totalHits: number;
  hasResultItems: boolean;
}

interface IcaOfferDetails {
  name: string;
  brand: string;
  packageInformation: string;
  mechanicInfo: string;
  information: string;
  referenceInfo: string;
  isSelfScan: boolean;
}

interface IcaOfferEan {
  id: string;
  articleDescription: string;
  image: string;
}

interface IcaOffer {
  id: string;
  type: number;
  validFrom: string;
  validTo: string;
  description: string;
  discountType: string;
  discountValue: number;
  requirementType: string;
  requirementValue: number;
  details: IcaOfferDetails;
  eans: IcaOfferEan[] | null;
  category: {
    articleGroupName: string;
    expandedArticleGroupName: string;
  };
}

// -------------------------------------------------------------------
// API-anrop
// -------------------------------------------------------------------

async function fetchAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Kunde inte hämta ICA-token: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as IcaTokenResponse;
  return data.publicAccessToken;
}

async function searchProducts(
  token: string,
  accountNumber: string,
  take: number,
  offset: number,
): Promise<IcaSearchResponse> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      queryString: "*",
      take,
      offset,
      accountNumber,
      searchDomain: "Assortment",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `ICA sök-API ${res.status}: ${res.statusText}`,
    );
  }
  return (await res.json()) as IcaSearchResponse;
}

async function fetchOffers(
  token: string,
  storeId: string,
): Promise<IcaOffer[]> {
  const res = await fetch(`${OFFERS_URL}/${storeId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    console.warn(
      `[ICA] Kunde inte hämta erbjudanden: ${res.status} ${res.statusText}`,
    );
    return [];
  }
  return (await res.json()) as IcaOffer[];
}

// -------------------------------------------------------------------
// Hjälpfunktioner
// -------------------------------------------------------------------

/** Tolka kvantitet och enhet från produktnamn (t.ex. "Mjölk 3% 1l ICA") */
function parseQuantity(text: string): {
  quantity?: number;
  quantityString?: string;
} {
  const match = text.match(
    /(\d+[,.]?\d*)\s*(kg|g|mg|ml|cl|dl|l|st|pack|port|m)\b/i,
  );
  if (!match) return {};
  return {
    quantity: parseFloat(match[1].replace(",", ".")),
    quantityString: `${match[1]}${match[2]}`,
  };
}

/**
 * Försöker extrahera varumärke från produktnamnet.
 * ICA-produkter har ofta formatet "Produktnamn Kvantitet Varumärke",
 * t.ex. "Mjölk 3% 1l ICA" eller "Bryggkaffe Lätt Mörkrost 450g Gevalia".
 */
function extractBrand(displayName: string): string | undefined {
  // Matcha sista ordet/orden efter kvantitet+enhet
  const match = displayName.match(
    /\d+[,.]?\d*\s*(?:kg|g|mg|ml|cl|dl|l|st|pack|port|m)\s+(.+)$/i,
  );
  if (match) {
    const brand = match[1].trim();
    if (brand.length > 0 && brand.length < 40) return brand;
  }
  return undefined;
}

function mapSearchProduct(
  raw: IcaSearchProduct,
  accountNumber: string,
): ScrapedProduct | null {
  const id = raw.consumerItemId;
  if (!id || !raw.displayName) return null;

  const price = parseFloat(raw.price);
  if (isNaN(price) || price <= 0) return null;

  const { quantity, quantityString } = parseQuantity(raw.displayName);
  const brand = extractBrand(raw.displayName);

  // Normalisera EAN: ta bort inledande nollor om det är en 14-siffrig GTIN
  const ean = raw.gtin
    ? raw.gtin.replace(/^0+/, "").padStart(13, "0")
    : undefined;

  const mapped = {
    externalId: id,
    name: raw.displayName,
    brand,
    ean,
    price,
    unit: "st",
    quantity,
    quantityString,
    imageUrl: raw.image || undefined,
    url: `https://handla.ica.se/stores/${accountNumber}/search?q=${encodeURIComponent(raw.displayName)}`,
    category: raw.mainCategoryName || undefined,
  };

  return ScrapedProductSchema.parse(mapped);
}

function mapOffer(
  offer: IcaOffer,
  storeId: string,
): ScrapedProduct | null {
  if (!offer.details?.name) return null;

  // Försök extrahera ett rimligt pris från erbjudandet
  let price: number | undefined;
  if (
    offer.discountType === "FIXED" &&
    offer.discountValue > 0
  ) {
    // "2 för 30 kr" → pris per styck
    const qty = offer.requirementValue || 1;
    price = offer.discountValue / qty;
  }
  if (price == null || price <= 0) return null;

  // Använd första EAN om tillgängligt
  const ean =
    offer.eans?.[0]?.id?.replace(/^0+/, "").padStart(13, "0") ??
    undefined;
  const imageUrl = offer.eans?.[0]?.image ?? undefined;

  const { quantity, quantityString } = parseQuantity(
    offer.details.packageInformation || offer.details.name,
  );

  const mapped = {
    externalId: `offer-${offer.id}`,
    name: `${offer.details.name}${offer.details.brand ? ` ${offer.details.brand}` : ""}`,
    brand: offer.details.brand || undefined,
    ean,
    price,
    unit: "st",
    quantity,
    quantityString,
    imageUrl,
    url: `https://www.ica.se/erbjudanden/`,
    category:
      offer.category?.expandedArticleGroupName ??
      offer.category?.articleGroupName ??
      undefined,
  };

  return ScrapedProductSchema.parse(mapped);
}

// -------------------------------------------------------------------
// Huvudklass
// -------------------------------------------------------------------

export class IcaScraper implements Scraper {
  readonly chainId = "ica";
  private accountNumber: string;
  private storeId: string;

  constructor(
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
    storeId: string = DEFAULT_STORE_ID,
  ) {
    this.accountNumber = accountNumber;
    this.storeId = storeId;
  }

  async scrape(): Promise<ScrapedProduct[]> {
    const seen = new Set<string>();
    const products: ScrapedProduct[] = [];

    const addProduct = (product: ScrapedProduct) => {
      if (seen.has(product.externalId)) return;
      seen.add(product.externalId);
      products.push(product);
    };

    // Steg 1: Hämta åtkomsttoken
    console.log("[ICA] Hämtar åtkomsttoken...");
    const token = await fetchAccessToken();

    // Steg 2: Paginera genom hela sortimentet via sök-API:et
    console.log("[ICA] Hämtar produkter via sök-API:et...");
    let totalHits = 0;
    for (let offset = 0; offset < MAX_PRODUCTS; offset += PAGE_SIZE) {
      try {
        const data = await searchProducts(
          token,
          this.accountNumber,
          PAGE_SIZE,
          offset,
        );

        const docs = data.products.documents;
        if (docs.length === 0) break;

        if (offset === 0) {
          totalHits = data.products.stats.totalHits;
          console.log(
            `[ICA] Totalt ${totalHits} produkter tillgängliga`,
          );
        }

        for (const doc of docs) {
          try {
            const mapped = mapSearchProduct(doc, this.accountNumber);
            if (mapped) addProduct(mapped);
          } catch (err) {
            // Skippa ogiltiga produkter tyst
          }
        }

        console.log(
          `[ICA] Hämtat ${Math.min(offset + PAGE_SIZE, totalHits)}/${totalHits} (${products.length} giltiga)`,
        );

        // Om vi fick färre än begärt finns det inte fler
        if (docs.length < PAGE_SIZE) break;

        // Om vi nått totalHits behöver vi inte fler anrop
        if (offset + PAGE_SIZE >= totalHits) break;
      } catch (err) {
        console.warn(
          `[ICA] Sök-API misslyckades vid offset ${offset}: ${err instanceof Error ? err.message : err}`,
        );
        // Om token har gått ut, avbryt
        break;
      }
    }

    // Steg 3: Komplettera med erbjudanden
    console.log("[ICA] Hämtar erbjudanden...");
    try {
      const offers = await fetchOffers(token, this.storeId);
      console.log(`[ICA] ${offers.length} erbjudanden hittade`);

      for (const offer of offers) {
        try {
          const mapped = mapOffer(offer, this.storeId);
          if (mapped) addProduct(mapped);
        } catch {
          // Skippa ogiltiga erbjudanden tyst
        }
      }
    } catch (err) {
      console.warn(
        `[ICA] Erbjudande-API misslyckades: ${err instanceof Error ? err.message : err}`,
      );
    }

    console.log(
      `[ICA] Skrapning klar. ${products.length} unika produkter hämtade.`,
    );
    return products;
  }
}
