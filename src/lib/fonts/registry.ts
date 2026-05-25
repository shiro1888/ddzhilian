import { Geist, Geist_Mono } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const fontRegistry = {
  geist: {
    label: 'Geist',
    font: geist,
  },
  geistMono: {
    label: 'Geist Mono',
    font: geistMono,
  },
} as const

export type FontKey = keyof typeof fontRegistry

export const fontVars = Object.values(fontRegistry)
  .map((entry) => entry.font.variable)
  .join(' ')
