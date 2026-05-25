"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Users } from "lucide-react"
import type { AdminStateResponse } from "@/lib/ddzhilian-types"
import { formatInteger } from "@/admin-v2/format"
import { AccountQuotaTable } from "./account-quota-table/table"
import type { AccountQuotaRow } from "./account-quota-table/schema"

function exportQuotaRows(rows: AccountQuotaRow[]) {
  if (rows.length === 0) {
    return
  }

  const headers = [
    "email",
    "id",
    "freeUsed",
    "paidRemaining",
    "paidUsed",
    "periodStartedAt",
    "updatedAt",
  ] as const
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\r\n")
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "ddzhilian-account-quotas.csv"
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildRows(snapshot: AdminStateResponse): AccountQuotaRow[] {
  const accountUsers = snapshot.users?.users ?? []
  return accountUsers.map((user) => ({
    id: user.id,
    email: user.email || "",
    freeUsed: user.imageQuotaUsed,
    paidRemaining: user.imagePaidQuotaRemaining,
    paidUsed: user.imagePaidQuotaUsed,
    periodStartedAt: user.imageQuotaPeriodStartedAt,
    updatedAt: user.updatedAt,
  }))
}

export function AccountQuotaOverviewCard({
  snapshot,
}: Readonly<{
  snapshot: AdminStateResponse
}>) {
  const rows = buildRows(snapshot)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-none">{formatInteger(rows.length)} 个账号</CardTitle>
        <CardDescription>Recent account quota records with free used, paid remaining, paid used, and update activity.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => exportQuotaRows(rows)}>
            <Download />
            Export
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-0">
        {rows.length > 0 ? (
          <AccountQuotaTable data={rows} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>当前暂无账号额度记录</EmptyTitle>
              <EmptyDescription>
                这里展示后台当前账号额度、免费已用、付费剩余、付费已用和更新时间。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
