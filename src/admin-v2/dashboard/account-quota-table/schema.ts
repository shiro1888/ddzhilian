export type AccountQuotaRow = {
  id: string
  email: string
  freeUsed: number
  paidRemaining: number
  paidUsed: number
  periodStartedAt?: string
  updatedAt?: string
}
