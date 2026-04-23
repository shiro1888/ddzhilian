'use client'

import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

export default function BrowserApp() {
  return (
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  )
}
