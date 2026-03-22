import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

const BASE_URL = "https://handlaprivatkund.ica.se";
const STORE_LIST_URL = "https://handla.ica.se/api/store/v1";

/**
 * Standardbutik att använda för att hämta produkter.
 * Maxi-butiker har störst sortiment. Vi använder Maxi ICA Stormarknad Lindhagen
 * som ligger centralt och har brett utbud.
 */
const DEFAULT_STORE_ID = "1004394";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Max antal produkter att hämta totalt */
const MAX_PRODUCTS = 1000;

/** Max antal produkter per kategori-anrop */
const PAGE_SIZE = 50;

/** Paus mellan anrop i ms för att undvika rate-limiting */
const DELAY_MS = 200;

// -------------------------------------------------------------------
// Typer för ICA:s API-svar
// -------------------------------------------------------------------

interface IcaCategory {
  name: string;
  categoryId: string;
  retailerCategoryId?: string;
  productCount?: number;
  childCategories?: IcaCategory[];
}

interface IcaProductPrice {
  current?: { amount?: string; currency?: string };
  unit?: {
    label?: string;
    current?: { amount?: string; currency?: string };
  };
  savings?: { amount?: string };
  ordinary?: { amount?: string };
}

interface IcaProductEntity {
  productId: string;
  retailerProductId?: string;
  name: string;
  available?: boolean;
  imagePaths?: string[];
  price?: IcaProductPrice;
  brand?: string;
  ean?: string;
}

interface IcaProductPageResponse {
  pageToken?: string;
  items?: Array<{
    type: string;
    product?: IcaProductEntity;
  }>;
  entities?: {
    product?: Record<string, IcaProductEntity>;
  };
}

// -------------------------------------------------------------------
// Session-hantering
// -------------------------------------------------------------------

interface IcaSession {
  storeId: string;
  cookies: Record<string, string>;
  csrfToken: string;
}

async function initSession(storeId: string): Promise<IcaSession> {
  const storeUrl = `${BASE_URL}/stores/${storeId}`;
  const resp = await fetch(storeUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
    },
    redirect: "manual",
  });

  // Samla cookies från set-cookie-headrar
  const cookies: Record<string, string> = {};
  const setCookieHeaders = resp.headers.getSetCookie?.() ?? [];
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match) {
      cookies[match[1]] = match[2];
    }
  }

  // Extrahera CSRF-token från __INITIAL_STATE__ i HTML
  let csrfToken = "";
  if (resp.ok) {
    const html = await resp.text();
    const stateMatch = html.match(
      /window\.__INITIAL_STATE__\s*=\s*(\{.*?"csrf"\s*:\s*\{[^}]*\})/
    );
    if (stateMatch) {
      const tokenMatch = stateMatch[1].match(
        /"csrf"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/
      );
      if (tokenMatch) {
        csrfToken = tokenMatch[1];
      }
    }
  }

  return { storeId, cookies, csrfToken };
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function buildHeaders(session: IcaSession): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    Cookie: buildCookieHeader(session.cookies),
    ...(session.csrfToken ? { "x-csrf-token": session.csrfToken } : {}),
  };
}

// -------------------------------------------------------------------
// API-anrop
// -------------------------------------------------------------------

async function fetchCategories(
  session: IcaSession
): Promise<IcaCategory[]> {
  const url = `${BASE_URL}/stores/${session.storeId}/api/webproductpagews/v1/categories?decoration=false&categoryDepth=10`;
  const resp = await fetch(url, { headers: buildHeaders(session) });
  if (!resp.ok) {
    console.warn(`[ICA] Kunde inte hämta kategorier: ${resp.status}`);
    return [];
  }
  return (await resp.json()) as IcaCategory[];
}

/**
 * Hämtar produkter för en kategori. Returnerar produkter och eventuell pageToken
 * för nästa sida.
 */
async function fetchProductPage(
  session: IcaSession,
  categoryId: string,
  pageToken?: string
): Promise<{ products: IcaProductEntity[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    categoryId,
    tag: "web",
    maxPageSize: String(PAGE_SIZE),
    includeAdditionalPageInfo: "true",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `${BASE_URL}/stores/${session.storeId}/api/webproductpagews/v6/product-pages?${params}`;
  const resp = await fetch(url, { headers: buildHeaders(session) });

  // WAF-utmaning returnerar 202 med x-amzn-waf-action: challenge
  if (resp.status === 202) {
    console.warn(
      `[ICA] WAF-utmaning för kategori ${categoryId}. Produkter kan inte hämtas utan webbläsarsession.`
    );
    return { products: [] };
  }

  if (!resp.ok) {
    console.warn(
      `[ICA] Misslyckades hämta produkter för ${categoryId}: ${resp.status}`
    );
    return { products: [] };
  }

  const data = (await resp.json()) as IcaProductPageResponse;
  const products: IcaProductEntity[] = [];

  // Svaret kan ha produkter i entities.product (äldre format) eller items (nyare)
  if (data.entities?.product) {
    products.push(...Object.values(data.entities.product));
  }
  if (data.items) {
    for (const item of data.items) {
      if (item.product) {
        products.push(item.product);
      }
    }
  }

  return { products, nextPageToken: data.pageToken };
}

// -------------------------------------------------------------------
// Hjälpfunktioner
// -------------------------------------------------------------------

/** Extrahera bladkategorier (utan barn) rekursivt */
function getLeafCategories(categories: IcaCategory[]): IcaCategory[] {
  const leaves: IcaCategory[] = [];
  for (const cat of categories) {
    if (!cat.childCategories || cat.childCategories.length === 0) {
      leaves.push(cat);
    } else {
      leaves.push(...getLeafCategories(cat.childCategories));
    }
  }
  return leaves;
}

/** Hitta full kategoriväg (t.ex. "Mejeri/Ost/Hårdost") */
function getCategoryPath(
  categories: IcaCategory[],
  targetId: string,
  path: string[] = []
): string | undefined {
  for (const cat of categories) {
    const current = [...path, cat.name];
    if (cat.categoryId === targetId) {
      return current.join("/");
    }
    if (cat.childCategories?.length) {
      const found = getCategoryPath(
        cat.childCategories,
        targetId,
        current
      );
      if (found) return found;
    }
  }
  return undefined;
}

/** Tolka enhetsetikett från ICA:s format (t.ex. "fop.price.per.kg" → "kr/kg") */
function parseUnitLabel(label?: string): string {
  if (!label) return "st";
  const mapping: Record<string, string> = {
    "fop.price.per.kg": "kr/kg",
    "fop.price.per.l": "kr/l",
    "fop.price.per.m": "kr/m",
    "fop.price.per.st": "kr/st",
    "fop.price.per.100g": "kr/100g",
    "fop.price.per.100ml": "kr/100ml",
    "fop.price.per.wash": "kr/tvätt",
    "fop.price.per.portion": "kr/portion",
  };
  return mapping[label] ?? "st";
}

/** Tolka kvantitet och enhet från produktnamn (t.ex. "Mjölk 1,5l" → { quantity: 1.5, unit: "l" }) */
function parseQuantityFromName(name: string): {
  quantity?: number;
  quantityString?: string;
} {
  const match = name.match(
    /(\d+[,.]?\d*)\s*(kg|g|ml|cl|dl|l|st|pack|port)\b/i
  );
  if (!match) return {};
  const numStr = match[1].replace(",", ".");
  return {
    quantity: parseFloat(numStr),
    quantityString: `${match[1]}${match[2]}`,
  };
}

function parseAmount(amount?: string): number | undefined {
  if (!amount) return undefined;
  const n = parseFloat(amount.replace(",", "."));
  return isNaN(n) ? undefined : n;
}

function mapProduct(
  raw: IcaProductEntity,
  storeId: string,
  categoryPath?: string
): ScrapedProduct | null {
  try {
    const price = parseAmount(raw.price?.current?.amount);
    if (price === undefined) return null;

    const ordinaryPrice = parseAmount(raw.price?.ordinary?.amount);
    const unit = parseUnitLabel(raw.price?.unit?.label);
    const { quantity, quantityString } = parseQuantityFromName(raw.name);

    const imageUrl = raw.imagePaths?.[0] || undefined;
    const productUrl = raw.retailerProductId
      ? `https://handlaprivatkund.ica.se/stores/${storeId}/products/${raw.retailerProductId}/details`
      : undefined;

    const mapped = {
      externalId: raw.retailerProductId ?? raw.productId,
      name: raw.name,
      brand: raw.brand || undefined,
      ean: raw.ean || undefined,
      price,
      ordinaryPrice: ordinaryPrice && ordinaryPrice > price ? ordinaryPrice : undefined,
      unit,
      quantity,
      quantityString,
      imageUrl,
      url: productUrl,
      category: categoryPath || undefined,
    };

    return ScrapedProductSchema.parse(mapped);
  } catch (err) {
    console.warn(
      `[ICA] Kunde inte tolka produkt "${raw.name}": ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------------
// Huvudklass
// -------------------------------------------------------------------

export class IcaScraper implements Scraper {
  readonly chainId = "ica";
  private storeId: string;

  constructor(storeId: string = DEFAULT_STORE_ID) {
    this.storeId = storeId;
  }

  /**
   * Hämtar listan av ICA-butiker som erbjuder online-handel.
   * Kan användas för att välja butik att skrapa.
   */
  static async fetchStores(): Promise<
    Array<{ id: string; name: string; storeFormat: string; retailerSiteId: string }>
  > {
    const resp = await fetch(STORE_LIST_URL, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return [];
    return resp.json();
  }

  async scrape(): Promise<ScrapedProduct[]> {
    console.log(`[ICA] Initierar session för butik ${this.storeId}...`);
    const session = await initSession(this.storeId);

    if (!Object.keys(session.cookies).length) {
      console.error("[ICA] Kunde inte skapa session – inga cookies mottagna.");
      return [];
    }

    console.log("[ICA] Hämtar kategorier...");
    const allCategories = await fetchCategories(session);
    if (!allCategories.length) {
      console.error("[ICA] Inga kategorier hittades.");
      return [];
    }

    const leafCategories = getLeafCategories(allCategories);
    console.log(
      `[ICA] Hittade ${leafCategories.length} bladkategorier. Hämtar produkter...`
    );

    const products: ScrapedProduct[] = [];
    const seenIds = new Set<string>();
    let wafBlocked = false;

    for (const cat of leafCategories) {
      if (products.length >= MAX_PRODUCTS) break;
      if (wafBlocked) break;

      const categoryPath = getCategoryPath(allCategories, cat.categoryId);
      let pageToken: string | undefined;

      do {
        const result = await fetchProductPage(
          session,
          cat.categoryId,
          pageToken
        );

        if (result.products.length === 0 && !pageToken) {
          // Om första sidan returnerar 0 produkter kan det vara WAF
          // Vi ger det fler försök med andra kategorier innan vi ger upp
          break;
        }

        for (const raw of result.products) {
          const id = raw.retailerProductId ?? raw.productId;
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const mapped = mapProduct(raw, this.storeId, categoryPath);
          if (mapped) {
            products.push(mapped);
          }

          if (products.length >= MAX_PRODUCTS) break;
        }

        pageToken = result.nextPageToken;

        if (pageToken) {
          await delay(DELAY_MS);
        }
      } while (pageToken && products.length < MAX_PRODUCTS);

      // Liten paus mellan kategorier
      await delay(DELAY_MS);

      // Om vi fått WAF-block på 3 kategorier i rad, ge upp
      if (products.length === 0 && leafCategories.indexOf(cat) >= 2) {
        wafBlocked = true;
        console.warn(
          "[ICA] Verkar vara blockerad av WAF. Avbryter skrapning."
        );
      }
    }

    console.log(`[ICA] Skrapning klar. ${products.length} produkter hämtade.`);
    return products;
  }
}
