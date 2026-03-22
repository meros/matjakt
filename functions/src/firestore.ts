import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { ScrapedProduct } from "./scrapers/types.js";

const db = () => getFirestore();

interface RetailerProductData {
  chainId: string;
  externalId: string;
  name: string;
  nameLower: string;
  searchTokens: string[];
  brand?: string;
  ean?: string;
  unit: string;
  quantity?: number;
  quantityString?: string;
  imageUrl?: string;
  url?: string;
  category?: string;
  productId?: string;
  lastScrapedAt: Timestamp;
}

/**
 * Genererar söktokens från namn och varumärke.
 * Varje token är ett unikt ord i lowercase.
 */
export function buildSearchTokens(name: string, brand?: string): string[] {
  let text = [name, brand ?? ""].join(" ");
  // Ta bort varumärkessymboler
  text = text.replace(/[®™©]/g, "");
  // Normalisera komma till punkt i siffror (1,5 → 1.5)
  text = text.replace(/(\d),(\d)/g, "$1.$2");
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zåäö0-9.]/g, ""))
    .filter((t) => t.length > 0);
  return [...new Set(tokens)];
}

/**
 * Skapar eller uppdaterar en butikskedjas produkt i Firestore.
 * Dokumentets ID baseras på chainId + externalId.
 */
export async function upsertRetailerProduct(
  chainId: string,
  product: ScrapedProduct
): Promise<string> {
  const docId = `${chainId}_${product.externalId}`;
  const ref = db().collection("retailerProducts").doc(docId);

  const data: RetailerProductData = {
    chainId,
    externalId: product.externalId,
    name: product.name,
    nameLower: product.name.toLowerCase(),
    searchTokens: buildSearchTokens(product.name, product.brand),
    unit: product.unit,
    lastScrapedAt: Timestamp.now(),
  };

  if (product.brand) data.brand = product.brand;
  if (product.ean) data.ean = product.ean;
  if (product.quantity) data.quantity = product.quantity;
  if (product.quantityString) data.quantityString = product.quantityString;
  if (product.imageUrl) data.imageUrl = product.imageUrl;
  if (product.url) data.url = product.url;
  if (product.category) data.category = product.category;

  await ref.set(data, { merge: true });
  return docId;
}

/**
 * Sparar en prispunkt som subdokument under retailerProducts/{id}/prices.
 */
export async function recordPrice(
  retailerProductId: string,
  price: number,
  ordinaryPrice?: number
): Promise<void> {
  const ref = db()
    .collection("retailerProducts")
    .doc(retailerProductId)
    .collection("prices");

  await ref.add({
    price,
    ordinaryPrice: ordinaryPrice ?? null,
    scrapedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Matchar en butikskedjas produkt mot en gemensam produkt i products-samlingen.
 * Använder EAN-kod om tillgänglig, annars namnmatchning.
 */
export async function matchProduct(
  retailerProductId: string,
  product: ScrapedProduct
): Promise<string | null> {
  // TODO: Implementera matchningslogik
  // 1. Om EAN finns, sök i products-samlingen efter matchande EAN
  // 2. Om ingen EAN-match, använd namnlikhet (fuzzy matching)
  // 3. Om match hittas, uppdatera retailerProducts-dokumentet med productId
  // 4. Om ingen match, skapa en ny produkt i products-samlingen

  if (product.ean) {
    const snapshot = await db()
      .collection("products")
      .where("ean", "==", product.ean)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const productId = snapshot.docs[0].id;
      await db()
        .collection("retailerProducts")
        .doc(retailerProductId)
        .update({ productId });
      return productId;
    }
  }

  // TODO: Fuzzy namnmatchning
  return null;
}
