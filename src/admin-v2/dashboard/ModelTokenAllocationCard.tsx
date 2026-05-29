"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

import type { AdminStateResponse } from "@/lib/ddzhilian-types"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Coins } from "lucide-react"
import { formatInteger } from "@/admin-v2/format"
import { cn } from "@/lib/utils"

type TokenMetric = "totalTokens"

type ModelTokenSlice = {
  modelId: string
  modelLabel: string
  amount: number
  percentage: number
  fill?: string
}

const chartConfig = {
  amount: {
    label: "Tokens",
  },
  rank1: {
    color: "var(--chart-1)",
    label: "Top 1",
  },
  rank2: {
    color: "var(--chart-2)",
    label: "Top 2",
  },
  rank3: {
    color: "var(--chart-3)",
    label: "Top 3",
  },
  rank4: {
    color: "var(--chart-4)",
    label: "Top 4",
  },
} satisfies ChartConfig

const tokenMetrics = {
  totalTokens: {
    label: "Prompt + Completion",
  },
} as const

function getPrimaryProviderLabel(snapshot: AdminStateResponse) {
  if (snapshot.ai.openai.length > 0) {
    return snapshot.ai.openai[0].displayName.trim() || "OpenAI Compatible"
  }

  if (snapshot.ai.anthropic.length > 0) {
    return "Anthropic"
  }

  return "Cloudflare AI"
}

function buildTokenSlices(snapshot: AdminStateResponse): ModelTokenSlice[] {
  const usageItems = snapshot.usage.models
    .map((item) => ({
      modelId: item.modelId,
      modelLabel: item.modelLabel || item.modelId,
      amount: item.promptTokens + item.completionTokens,
    }))
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 4)

  const total = usageItems.reduce((sum, item) => sum + item.amount, 0)
  if (total <= 0) {
    return []
  }

  return usageItems.map((item, index) => {
    const colorKey = `rank${String(index + 1)}` as keyof typeof chartConfig
    const configEntry = chartConfig[colorKey]
    const fill = "color" in configEntry ? configEntry.color : undefined
    return {
      ...item,
      percentage: Number(((item.amount / total) * 100).toFixed(1)),
      fill,
    }
  })
}

export function ModelTokenAllocationCard({
  snapshot,
  className,
}: Readonly<{
  snapshot: AdminStateResponse
  className?: string
}>) {
  const [metric, setMetric] = React.useState<TokenMetric>("totalTokens")
  const providerLabel = getPrimaryProviderLabel(snapshot)
  const chartData = React.useMemo(() => buildTokenSlices(snapshot), [snapshot])
  const totalTokens = React.useMemo(() => chartData.reduce((sum, item) => sum + item.amount, 0), [chartData])

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle className="font-normal">模型 Token 量</CardTitle>
        <CardDescription>按 `promptTokens + completionTokens` 总量统计当前供应商的前四名模型</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant="outline">{providerLabel}</Badge>
          <Select onValueChange={(value) => setMetric(value as TokenMetric)} value={metric}>
            <SelectTrigger className="w-44" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(tokenMetrics).map(([value, item]) => (
                  <SelectItem key={value} value={value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        {chartData.length > 0 ? (
          <>
            <ChartContainer config={chartConfig} className="mx-auto aspect-square h-50">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel className="w-52" nameKey="modelLabel" />}
                />
                <Pie
                  cornerRadius={6}
                  data={chartData}
                  dataKey="amount"
                  innerRadius={65}
                  nameKey="modelLabel"
                  outerRadius={90}
                  paddingAngle={2}
                  strokeWidth={5}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (!(viewBox && "cx" in viewBox && "cy" in viewBox)) {
                        return null
                      }

                      return (
                        <text dominantBaseline="middle" textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                          <tspan className="fill-muted-foreground text-xs" x={viewBox.cx} y={(viewBox.cy ?? 0) - 8}>
                            Top 4
                          </tspan>
                          <tspan
                            className="fill-foreground font-medium text-lg tabular-nums"
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                          >
                            {formatInteger(totalTokens)}
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="flex min-w-0 flex-col gap-3">
              {chartData.map((item) => (
                <div className="grid grid-cols-[1fr_auto] items-end gap-3" key={item.modelId}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1">
                      <span aria-hidden="true" className="h-2 w-1 rounded-full" style={{ backgroundColor: item.fill }} />
                      <p className="truncate text-muted-foreground text-xs">{item.modelLabel}</p>
                    </div>
                    <p className="font-medium tabular-nums">{formatInteger(item.amount)}</p>
                  </div>
                  <div className="font-medium tabular-nums">{item.percentage}%</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty className="sm:col-span-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Coins />
              </EmptyMedia>
              <EmptyTitle>当前供应商暂无 Token 记录</EmptyTitle>
              <EmptyDescription>
                这里展示当前主运行供应商按 `promptTokens + completionTokens` 聚合后的前四名模型占比。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
