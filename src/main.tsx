import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { Layout } from './components/layout'
import { HomePage } from './pages/home'
import { SearchPage } from './pages/search'
import { ProductPage } from './pages/product'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sok" element={<SearchPage />} />
          <Route path="/produkt/:id" element={<ProductPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
)
