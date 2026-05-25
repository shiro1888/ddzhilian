"use client"
"use no memo"

import type { ColumnDef } from "@tanstack/react-table"
import { differenceInCalendarDays, endOfToday, parseISO } from "date-fns"
import { ArrowDownUp, CircleDollarSign, Coins, UserRound, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDateTime, formatInteger } from "@/admin-v2/format"

import type { AccountQuotaRow } from "./schema"

export const accountQuotaColumns: ColumnDef<AccountQuotaRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.email || row.original.id}`}
        />
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "email",
    header: "账号",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-medium text-sm leading-none">{row.original.email || "未记录邮箱"}</span>
            <span className="truncate text-muted-foreground text-xs leading-none">{row.original.id}</span>
          </div>
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "search",
    accessorFn: (row) => `${row.id} ${row.email}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    id: "balanceStatus",
    accessorFn: (row) => (row.paidRemaining > 0 ? "has-balance" : "empty-balance"),
    filterFn: "equalsString",
    enableHiding: true,
  },
  {
    id: "updatedWindow",
    accessorFn: (row) => {
      if (!row.updatedAt) {
        return []
      }

      const daysSinceUpdated = differenceInCalendarDays(endOfToday(), parseISO(row.updatedAt))
      if (daysSinceUpdated <= 7) return ["7", "30"]
      if (daysSinceUpdated <= 30) return ["30"]
      return []
    },
    filterFn: "arrIncludes",
    enableHiding: true,
  },
  {
    accessorKey: "freeUsed",
    header: "免费已用",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline">
          <Coins data-icon="inline-start" />
          {formatInteger(row.original.freeUsed)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "paidRemaining",
    header: "付费剩余",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Badge variant="secondary">
          <Wallet data-icon="inline-start" />
          {formatInteger(row.original.paidRemaining)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "paidUsed",
    header: "付费已用",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline">
          <CircleDollarSign data-icon="inline-start" />
          {formatInteger(row.original.paidUsed)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "periodStartedAt",
    header: "额度周期",
    cell: ({ row }) => (
      <span className="text-sm">{formatDateTime(row.original.periodStartedAt)}</span>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "更新时间",
    cell: ({ row }) => (
      <span className="text-sm">{formatDateTime(row.original.updatedAt)}</span>
    ),
  },
  {
    id: "sortKey",
    accessorFn: (row) => row.updatedAt ?? row.periodStartedAt ?? "",
    header: () => (
      <div className="flex items-center gap-1 text-muted-foreground">
        <ArrowDownUp className="size-3.5" />
        排序字段
      </div>
    ),
    enableHiding: true,
  },
]
