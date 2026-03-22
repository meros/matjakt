import { z } from "zod";

export const ScrapedProductSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  ean: z.string().optional(),
  price: z.number(),
  ordinaryPrice: z.number().optional(),
  unit: z.string(),
  quantity: z.number().optional(),
  quantityString: z.string().optional(),
  imageUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  category: z.string().optional(),
});

export type ScrapedProduct = z.infer<typeof ScrapedProductSchema>;

export interface Scraper {
  chainId: string;
  scrape(): Promise<ScrapedProduct[]>;
}
