'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format as formatDate, parseISO } from 'date-fns'
import { Area, CartesianGrid, ComposedChart, XAxis } from 'recharts'
import type { AdminStateResponse } from '@/lib/ddzhilian-types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Activity } from 'lucide-react'
import { formatInteger } from '@/admin-v2/format'
import { ADMIN_V2_BASE_PATH } from '@/admin-v2/config'
import { cn } from '@/lib/utils'

type WindowOption = '6' | '12' | '24'

type VisitPoint = {
  date: string
  messages: number
}

const chartConfig = {
  messages: {
    label: '消息数',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function buildVisitPoints(snapshot: AdminStateResponse, windowHours: number): VisitPoint[] {
  return snapshot.history.textTrendBuckets
    .slice(-windowHours)
    .map((bucket) => ({ date: bucket.bucketStartAt, messages: bucket.messageCount }))
}

function hasVisitData(points: VisitPoint[]) {
  return points.some((point) => point.messages > 0)
}

export function UserVisitVolumeCard({
  snapshot,
  className,
}: Readonly<{
  snapshot: AdminStateResponse
  className?: string
}>) {
  const [windowHours, setWindowHours] = useState<WindowOption>('24')

  const points = useMemo(
    () => buildVisitPoints(snapshot, Number(windowHours)),
    [snapshot, windowHours],
  )

  const activeUserCount = snapshot.history.activeUserCount ?? 0

  return (
    <Card className={cn('@container/card h-full', className)}>
      <CardHeader>
        <CardTitle className="font-normal leading-none">用户访问量</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            基于 ddzhilian 用户发送文本消息聚合的最近 {windowHours} 小时活跃度
          </span>
          <span className="@[540px]/card:hidden">
            最近 {windowHours} 小时
          </span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select value={windowHours} onValueChange={(value) => setWindowHours(value as WindowOption)}>
            <SelectTrigger size="sm" className="w-24">
              <SelectValue placeholder="24 小时" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>时间范围</SelectLabel>
                <SelectItem value="24">24 小时</SelectItem>
                <SelectItem value="12">12 小时</SelectItem>
                <SelectItem value="6">6 小时</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link prefetch={false} href={`${ADMIN_V2_BASE_PATH}/users`}>
              查看用户
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {hasVisitData(points) ? (
          <ChartContainer config={chartConfig} className="h-50 w-full">
            <ComposedChart data={points} margin={{ top: 0 }}>
              <defs>
                <linearGradient id="fillVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-visits)" stopOpacity={0.36} />
                  <stop offset="95%" stopColor="var(--color-visits)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) =>
                  formatDate(parseISO(value), Number(windowHours) <= 12 ? 'HH:mm' : 'MM-dd HH:mm')
                }
              />
              <ChartTooltip
                cursor={false}
                content={(
                  <ChartTooltipContent
                    className="w-52"
                    labelFormatter={(value) => formatDate(parseISO(String(value)), 'yyyy-MM-dd HH:mm')}
                  />
                )}
              />

              <Area
                dataKey="messages"
                type="natural"
                fill="url(#fillVisits)"
                stroke="var(--color-messages)"
                strokeWidth={1.25}
                dot={false}
                fillOpacity={1}
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity />
              </EmptyMedia>
              <EmptyTitle>最近时段暂无消息记录</EmptyTitle>
              <EmptyDescription>
                用户发送文本消息聚合后的活跃度。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>活跃用户 {formatInteger(activeUserCount)}</span>
          <span>数据口径：文本消息聚合</span>
        </div>
      </CardContent>
    </Card>
  )
}
