import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getAnalytics, logEvent, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Analytics — only initialize in browser (not SSR/prerender)
let analytics: Analytics | null = null
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  analytics = getAnalytics(app)
}
export { analytics }

/** Log a custom analytics event */
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (analytics) {
    logEvent(analytics, eventName, params)
  }
}

/** Pre-defined events for Matjakt */
export const track = {
  search: (query: string, resultCount: number) =>
    trackEvent('search', { search_term: query, result_count: resultCount }),
  viewProduct: (productId: string, productName: string) =>
    trackEvent('view_item', { item_id: productId, item_name: productName }),
  comparePrice: (productId: string, chainId: string) =>
    trackEvent('compare_price', { item_id: productId, chain: chainId }),
  addToList: (productId: string) =>
    trackEvent('add_to_list', { item_id: productId }),
}
