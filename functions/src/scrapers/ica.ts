import { ScrapedProduct, ScrapedProductSchema, Scraper } from "./types.js";

/**
 * ICA-skrapare som använder det publika produkt-API:et på handlaprivatkund.ica.se.
 *
 * Strategi: Två metoder kombineras för att nå ~1000 produkter:
 *   1. Hämta produkter via /api/v5/products (hela sortimentet, offset-paginering)
 *   2. Komplettera med sökningar via /api/v5/products/search för bredare täckning
 *
 * Dedupliserar på produkt-ID. Ingen autentisering krävs.
 */

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/**
 * Maxi ICA Stormarknad Lindhagen — centralt i Stockholm med brett sortiment.
 * Större butiker har fler produkter tillgängliga i API:et.
 */
const DEFAULT_STORE_ID = "1004394";

const PAGE_SIZE = 50;
const MAX_PRODUCTS = 1500;
const MAX_PAGES_PER_QUERY = 10;

/** Breda sökord för att komplettera produktlistan */
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

// -------------------------------------------------------------------
// Typer för ICA:s API-svar (v5)
// -------------------------------------------------------------------

interface IcaProductPrice {
  current?: { amount?: number | string };
  unit?: {
    label?: string;
    current?: { amount?: number | string };
  };
  ordinary?: { amount?: number | string };
  savings?: { amount?: number | string };
}

interface IcaProduct {
  id?: string;
  productId?: string;
  retailerProductId?: string;
  name?: string;
  brand?: string;
  ean?: string;
  price?: IcaProductPrice;
  /** Alternativt prisformat — direkt som nummer */
  priceValue?: number;
  ordinaryPrice?: number;
  comparePrice?: string;
  comparePriceUnit?: string;
  image?: string;
  imagePaths?: string[];
  imageUrl?: string;
  available?: boolean;
  category?: string;
  categoryName?: string;
  displayVolume?: string;
  description?: string;
}

interface IcaProductsResponse {
  /** Produktlista — kan ligga direkt i roten eller under "products" */
  products?: IcaProduct[];
  items?: Array<{
    type?: string;
    product?: IcaProduct;
  }>;
  entities?: {
    product?: Record<string, IcaProduct>;
  };
  /** Offset-baserad paginering */
  totalCount?: number;
  pagination?: {
    totalNumberOfResults?: number;
    numberOfPages?: number;
    currentPage?: number;
    pageSize?: number;
  };
  /** Token-baserad paginering */
  pageToken?: string;
}

// -------------------------------------------------------------------
// API-anrop
// -------------------------------------------------------------------

function buildBaseUrl(storeId: string): string {
  return `https://handlaprivatkund.ica.se/stores/${storeId}`;
}

const HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

/**
 * Hämtar produkter via list-endpointen (offset-paginering).
 */
async function fetchProductList(
  storeId: string,
  limit: number,
  offset: number,
): Promise<IcaProductsResponse> {
  const base = buildBaseUrl(storeId);
  const url = `${base}/api/v5/products?limit=${limit}&offset=${offset}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`ICA products ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as IcaProductsResponse;
}

/**
 * Söker produkter via search-endpointen (offset-paginering).
 */
async function fetchProductSearch(
  storeId: string,
  term: string,
  limit: number,
  offset: number,
): Promise<IcaProductsResponse> {
  const base = buildBaseUrl(storeId);
  const url = `${base}/api/v5/products/search?term=${encodeURIComponent(term)}&limit=${limit}&offset=${offset}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(
      `ICA search "${term}" ${res.status}: ${res.statusText}`,
    );
  }
  return (await res.json()) as IcaProductsResponse;
}

// -------------------------------------------------------------------
// Alternativa endpoints (äldre API som backup)
// -------------------------------------------------------------------

interface IcaCategory {
  name: string;
  categoryId: string;
  childCategories?: IcaCategory[];
}

/**
 * Hämtar kategorier via äldre webproductpagews-endpointen.
 * Används som backup om v5-endpointen inte fungerar.
 */
async function fetchCategories(
  storeId: string,
): Promise<IcaCategory[]> {
  const base = buildBaseUrl(storeId);
  const url = `${base}/api/webproductpagews/v1/categories?decoration=false&categoryDepth=10`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  return (await res.json()) as IcaCategory[];
}

/**
 * Hämtar produkter via äldre webproductpagews-endpointen med kategori-ID.
 */
async function fetchProductsByCategory(
  storeId: string,
  categoryId: string,
  pageToken?: string,
): Promise<IcaProductsResponse> {
  const base = buildBaseUrl(storeId);
  const params = new URLSearchParams({
    categoryId,
    tag: "web",
    maxPageSize: String(PAGE_SIZE),
    includeAdditionalPageInfo: "true",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const url = `${base}/api/webproductpagews/v6/product-pages?${params}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(
      `ICA category ${categoryId} ${res.status}: ${res.statusText}`,
    );
  }
  return (await res.json()) as IcaProductsResponse;
}

// -------------------------------------------------------------------
// Hjälpfunktioner
// -------------------------------------------------------------------

/** Extrahera alla produkter från de olika svarsformat som ICA:s API kan returnera */
function extractProducts(data: IcaProductsResponse): IcaProduct[] {
  const products: IcaProduct[] = [];

  // Format 1: produkter direkt i en lista
  if (Array.isArray(data.products)) {
    products.push(...data.products);
  }

  // Format 2: array i roten (svaret kan vara en ren lista)
  if (Array.isArray(data)) {
    products.push(...(data as unknown as IcaProduct[]));
  }

  // Format 3: entities.product (äldre API)
  if (data.entities?.product) {
    products.push(...Object.values(data.entities.product));
  }

  // Format 4: items med inbäddade produkter
  if (data.items) {
    for (const item of data.items) {
      if (item.product) {
        products.push(item.product);
      }
    }
  }

  return products;
}

/** Tolka pris från olika format som ICA returnerar */
function parsePrice(val?: number | string): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  const n = parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? undefined : n;
}

/** Tolka enhetsetikett från ICA:s format */
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
  if (mapping[label]) return mapping[label];
  // Om etiketten redan är läsbar (t.ex. "kr/kg"), returnera den
  if (label.includes("/")) return label;
  return "st";
}

/** Tolka kvantitet och enhet från produktnamn eller volymtext */
function parseQuantity(text?: string): {
  quantity?: number;
  quantityString?: string;
} {
  if (!text) return {};
  const match = text.match(
    /(\d+[,.]?\d*)\s*(kg|g|mg|ml|cl|dl|l|st|pack|port|m)\b/i,
  );
  if (!match) return {};
  return {
    quantity: parseFloat(match[1].replace(",", ".")),
    quantityString: `${match[1]}${match[2]}`,
  };
}

/** Bygg bild-URL — ICA kan returnera relativa sökvägar */
function resolveImageUrl(raw: IcaProduct): string | undefined {
  const path =
    raw.imageUrl ?? raw.image ?? raw.imagePaths?.[0] ?? undefined;
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  // Relativ sökväg — ICA använder ofta assets.icanet.se
  if (path.startsWith("/"))
    return `https://assets.icanet.se${path}`;
  return `https://assets.icanet.se/${path}`;
}

function mapProduct(
  raw: IcaProduct,
  storeId: string,
): ScrapedProduct | null {
  const id = raw.retailerProductId ?? raw.productId ?? raw.id;
  if (!id || !raw.name) return null;

  // Pris: försök hämta från price-objekt eller direkt fält
  const price =
    parsePrice(raw.price?.current?.amount) ??
    parsePrice(raw.priceValue) ??
    undefined;
  if (price == null) return null;

  // Ordinarie pris (före kampanj)
  const ordinaryPrice = parsePrice(
    raw.price?.ordinary?.amount ?? raw.ordinaryPrice,
  );

  // Enhet
  const unit = parseUnitLabel(raw.price?.unit?.label);

  // Kvantitet från displayVolume eller produktnamn
  const volQty = parseQuantity(raw.displayVolume);
  const { quantity, quantityString } =
    volQty.quantity != null ? volQty : parseQuantity(raw.name);

  // Bild-URL
  const imageUrl = resolveImageUrl(raw);

  // Produktsida-URL
  const productUrl = `https://handlaprivatkund.ica.se/stores/${storeId}/products/${id}/details`;

  // Kategori
  const category =
    raw.category ?? raw.categoryName ?? undefined;

  const mapped = {
    externalId: id,
    name: raw.name,
    brand: raw.brand || undefined,
    ean: raw.ean || undefined,
    price,
    ordinaryPrice:
      ordinaryPrice != null && ordinaryPrice > price
        ? ordinaryPrice
        : undefined,
    unit,
    quantity,
    quantityString,
    imageUrl,
    url: productUrl,
    category,
  };

  return ScrapedProductSchema.parse(mapped);
}

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

// -------------------------------------------------------------------
// Huvudklass
// -------------------------------------------------------------------

export class IcaScraper implements Scraper {
  readonly chainId = "ica";
  private storeId: string;

  constructor(storeId: string = DEFAULT_STORE_ID) {
    this.storeId = storeId;
  }

  async scrape(): Promise<ScrapedProduct[]> {
    const seen = new Set<string>();
    const products: ScrapedProduct[] = [];

    const addProduct = (raw: IcaProduct) => {
      const id = raw.retailerProductId ?? raw.productId ?? raw.id;
      if (!id || seen.has(id)) return;
      seen.add(id);

      try {
        const mapped = mapProduct(raw, this.storeId);
        if (mapped) {
          products.push(mapped);
        }
      } catch (err) {
        console.warn(
          `[ICA] Ogiltig produkt ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    };

    // Steg 1: Försök hämta via v5 list-endpoint (hela sortimentet)
    console.log("[ICA] Hämtar produkter via v5 list-endpoint...");
    let v5Works = false;
    try {
      for (let offset = 0; offset < MAX_PRODUCTS; offset += PAGE_SIZE) {
        const data = await fetchProductList(
          this.storeId,
          PAGE_SIZE,
          offset,
        );
        const batch = extractProducts(data);
        if (batch.length === 0) break;

        v5Works = true;
        for (const p of batch) addProduct(p);

        // Om vi fått färre än page size finns det inte fler
        if (batch.length < PAGE_SIZE) break;
      }
    } catch (err) {
      console.warn(
        `[ICA] v5 list-endpoint misslyckades: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (v5Works) {
      console.log(
        `[ICA] v5 list: ${products.length} produkter hittade`,
      );
    }

    // Steg 2: Komplettera med sökningar om vi inte nått målet
    if (products.length < MAX_PRODUCTS) {
      console.log("[ICA] Kompletterar med sökningar...");
      for (const term of SEARCH_TERMS) {
        if (products.length >= MAX_PRODUCTS) break;

        try {
          for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
            const offset = page * PAGE_SIZE;
            const data = await fetchProductSearch(
              this.storeId,
              term,
              PAGE_SIZE,
              offset,
            );
            const batch = extractProducts(data);
            if (batch.length === 0) break;

            for (const p of batch) addProduct(p);
            if (batch.length < PAGE_SIZE) break;
            if (products.length >= MAX_PRODUCTS) break;
          }
        } catch (err) {
          console.warn(
            `[ICA] Sökning "${term}" misslyckades: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    // Steg 3: Om varken v5 list eller search fungerade, prova äldre kategori-API
    if (products.length === 0) {
      console.log(
        "[ICA] v5-API gav inga resultat, provar äldre kategori-API...",
      );
      try {
        const categories = await fetchCategories(this.storeId);
        const leaves = getLeafCategories(categories);

        for (const cat of leaves) {
          if (products.length >= MAX_PRODUCTS) break;

          let pageToken: string | undefined;
          do {
            try {
              const data = await fetchProductsByCategory(
                this.storeId,
                cat.categoryId,
                pageToken,
              );
              const batch = extractProducts(data);
              for (const p of batch) addProduct(p);

              pageToken = data.pageToken;
              if (batch.length === 0) break;
            } catch (err) {
              console.warn(
                `[ICA] Kategori "${cat.name}" misslyckades: ${err instanceof Error ? err.message : err}`,
              );
              break;
            }
          } while (pageToken && products.length < MAX_PRODUCTS);
        }
      } catch (err) {
        console.warn(
          `[ICA] Kategori-API misslyckades: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    console.log(
      `[ICA] Skrapning klar. ${products.length} unika produkter hämtade.`,
    );
    return products;
  }
}
