import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const PIE_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function formatPeriod(d: string, mode: "week" | "month") {
  const date = new Date(d);
  if (mode === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface BookingStatRow {
  period: string;
  booking_count: number;
  total_revenue: number;
  total_commission: number;
}

export interface RevenueRow {
  period: string;
  total_revenue: number;
  booking_count: number;
}

export interface AgencySignupRow {
  period: string;
  new_applications: number;
  cumulative: number;
}

export interface CategoryRow {
  category: string;
  booking_count: number;
  total_revenue: number;
}

interface ChartRowProps {
  loading: boolean;
  bookingStats: BookingStatRow[];
  revenueStats: RevenueRow[];
  agencyStats: AgencySignupRow[];
  categoryStats: CategoryRow[];
}

export function DashboardCharts({
  loading, bookingStats, revenueStats, agencyStats, categoryStats,
}: ChartRowProps) {
  return (
    <>
      {/* Charts Row 1: Bookings per week + Revenue per month */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings per Week</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : bookingStats.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No booking data in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={bookingStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(v) => formatPeriod(v, "week")}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "total_revenue" ? [money.format(v), "Revenue"] : [v, "Bookings"]
                    }
                    labelFormatter={(l) => formatPeriod(String(l), "week")}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="booking_count"
                    name="Bookings"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue per Month</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : revenueStats.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No revenue data in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(v) => formatPeriod(v, "month")}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [money.format(v), "Revenue"]}
                    labelFormatter={(l) => formatPeriod(String(l), "month")}
                  />
                  <Bar dataKey="total_revenue" name="Revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Agency signups + Category breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agency Sign-ups (Cumulative)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : agencyStats.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No agency sign-ups in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={agencyStats}>
                  <defs>
                    <linearGradient id="agencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(v) => formatPeriod(v, "week")}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(l) => formatPeriod(String(l), "week")} />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative"
                    stroke="#7c3aed"
                    fill="url(#agencyGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : categoryStats.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No category data in this period
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={200}>
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      dataKey="booking_count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {categoryStats.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Bookings"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {categoryStats.slice(0, 6).map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="capitalize truncate flex-1">{c.category}</span>
                      <span className="font-medium text-muted-foreground">{c.booking_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
