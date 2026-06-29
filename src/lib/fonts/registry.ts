const systemFontVariables = 'dd-admin-font-vars'

export const fontRegistry = {
  geist: {
    label: 'Geist',
    font: {
      variable: systemFontVariables,
    },
  },
  geistMono: {
    label: 'Geist Mono',
    font: {
      variable: systemFontVariables,
    },
  },
} as const

export type FontKey = keyof typeof fontRegistry

export const fontVars = systemFontVariables
