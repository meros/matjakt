# Matjakt

Swedish grocery price comparison app.

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- Firebase: Firestore, Auth, Cloud Functions, Hosting

## Project Structure

- `src/` — frontend (Vite/React)
- `functions/` — Cloud Functions (Node.js)

## Commands

```bash
npm run dev                    # Start frontend dev server
npm run build                  # Build frontend
firebase emulators:start       # Start Firebase emulators (auth, firestore, functions, hosting)
cd functions && npm run build  # Build Cloud Functions
```

## Key Files

- `src/lib/firebase.ts` — Firebase app init and exports
- `src/lib/types.ts` — Shared TypeScript types
- `src/lib/normalizer.ts` — Product/price normalization logic
- `functions/src/` — Cloud Functions source

## Conventions

- Unit price (kr/100g or kr/l) is the primary UX metric for comparisons
- Prices in SEK (not öre)
- Swedish text must use correct å, ä, ö — never substitute ASCII equivalents
- Zod validation for all scraped/external data
- Supported chains: ICA, Willys, Coop, Hemköp, Lidl, City Gross
