import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ForecastDay } from '@/types/progress';

interface ReviewForecastChartProps {
  forecast: ForecastDay[];
  includeOverdue: boolean;
}

const chartConfig = {
  reviews: {
    label: 'Reviews',
    color: 'hsl(var(--primary))',
  },
  overdue: {
    label: 'Overdue',
    color: 'hsl(var(--destructive))',
  },
} satisfies ChartConfig;

export function ReviewForecastChart({
  forecast,
  includeOverdue,
}: ReviewForecastChartProps): React.ReactElement {
  const chartData = useMemo(() => {
    return forecast.map((day, index) => {
      const overdueCount = day.isOverdue ? day.reviewCount : 0;
      const regularCount = day.isOverdue ? 0 : day.reviewCount;

      // If not including overdue in the first bar, zero it out
      const displayOverdue = index === 0 && includeOverdue ? overdueCount : 0;
      const displayRegular = index === 0 && !includeOverdue
        ? regularCount
        : index === 0
          ? regularCount
          : day.reviewCount;

      return {
        label: day.label,
        reviews: index === 0 ? displayRegular : day.reviewCount,
        overdue: displayOverdue,
      };
    });
  }, [forecast, includeOverdue]);

  const hasData = chartData.some((d) => d.reviews > 0 || d.overdue > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Review Forecast</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-center text-muted-foreground py-8">
            No reviews scheduled yet. Start studying to see your forecast.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="overdue"
                stackId="a"
                fill="var(--color-overdue)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="reviews"
                stackId="a"
                fill="var(--color-reviews)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
