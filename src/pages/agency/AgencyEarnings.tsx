import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, ArrowDownToLine, Clock, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type Booking } from "@/stores/bookingsStore";
import { supabase } from "@/lib/supabase";
import { format, parseISO } from "date-fns";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

function sumPaid(bookings: Booking[], pick: (b: Booking) => number): number {
  return bookings.filter(b => b.payment_status === "paid").reduce((acc, b) => acc + pick(b), 0);
}

function pendingPayoutSum(bookings: Booking[]): number {
  return bookings
    .filter(b => b.status === "confirmed" && b.payment_status === "paid")
    .reduce((acc, b) => acc + b.net_payout, 0);
}

type RowStatus = "paid" | "pending" | "refunded";

function paymentDisplayStatus(p: Booking["payment_status"]): RowStatus {
  if (p === "paid") return "paid";
  if (p === "refunded") return "refunded";
  return "pending";
}

const statusStyle: Record<RowStatus, string> = {
  paid: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-muted text-muted-foreground",
};

const payoutStatusStyle: Record<string, string> = {
  completed:  "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending:    "bg-amber-100 text-amber-700",
  failed:     "bg-destructive/10 text-destructive",
};

interface PayoutRow {
  id: string;
  amount: number;
  status: string;
  stripe_transfer_id: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function AgencyEarnings() {
  const { agencyBookings, isLoading, fetchAgencyBookings } = useBookingsStore();

  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(true);

  useEffect(() => {
    if (agencyBookings.length === 0) void fetchAgencyBookings();
  }, [agencyBookings.length, fetchAgencyBookings]);

  // Load Stripe account status + payout history
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: app } = await supabase
        .from("agency_applications")
        .select("stripe_account_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) setStripeAccountId(app?.stripe_account_id ?? null);
      setStripeLoading(false);

      const { data: payoutData } = await supabase
        .from("payouts")
        .select("id, amount, status, stripe_transfer_id, period_start, period_end, created_at, completed_at")
        .eq("agency_user_id", user.id)
        .order("created_at", { ascending: false });

      if (!cancelled) setPayouts((payoutData ?? []) as PayoutRow[]);
      setPayoutsLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => ({
    totalRevenue:      sumPaid(agencyBookings, b => b.total_amount),
    platformCommission:sumPaid(agencyBookings, b => b.commission_amount),
    netEarnings:       sumPaid(agencyBookings, b => b.net_payout),
    pendingPayout:     pendingPayoutSum(agencyBookings),
  }), [agencyBookings]);

  const summaryStats = useMemo(() => [
    { label: "Total Revenue",             value: money.format(stats.totalRevenue),       icon: DollarSign,     sub: "Lifetime (paid)" },
    { label: "Platform Commission (15%)", value: money.format(stats.platformCommission), icon: TrendingUp,     sub: "Total deducted" },
    { label: "Net Earnings",              value: money.format(stats.netEarnings),         icon: ArrowDownToLine,sub: "After commission" },
    { label: "Pending Payout",            value: money.format(stats.pendingPayout),       icon: Clock,          sub: "Confirmed & paid — not yet transferred" },
  ], [stats]);

  const transactions = useMemo(() =>
    agencyBookings.map(b => ({
      id: b.id,
      booking_ref: b.booking_ref,
      activity: b.listing?.title ?? "—",
      customer: b.traveler_name ?? "—",
      date: b.created_at.split("T")[0],
      gross: b.total_amount,
      commission: b.commission_amount,
      net: b.net_payout,
      payment_status: b.payment_status,
      rowStatus: paymentDisplayStatus(b.payment_status),
    })),
    [agencyBookings]
  );

  const showStatsSkeleton = isLoading && agencyBookings.length === 0;
  const stripeConnected   = !stripeLoading && !!stripeAccountId;

  return (
    <AgencyLayout title="Earnings">
      <div className="space-y-6">

        {/* ── Stats ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  {showStatsSkeleton
                    ? <Skeleton className="h-9 w-28 mt-1" />
                    : <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  }
                  <span className="text-xs text-muted-foreground">{s.sub}</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Payout / Stripe status ────────────────────────── */}
        <Card>
          <CardContent className="p-5">
            {stripeLoading ? (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Checking Stripe status…</span>
              </div>
            ) : stripeConnected ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Stripe Connected</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {showStatsSkeleton
                        ? "Loading your balance…"
                        : `You have ${money.format(stats.pendingPayout)} pending. Payouts are processed by the platform admin within 3–5 business days.`}
                    </p>
                  </div>
                </div>
                <Link to="/agency/settings">
                  <Button variant="outline" size="sm" className="gap-2 whitespace-nowrap">
                    <ExternalLink className="h-4 w-4" />
                    Stripe Settings
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-4.5 w-4.5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Stripe Not Connected</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      You must connect a Stripe account before you can receive payouts.
                    </p>
                  </div>
                </div>
                <Link to="/agency/settings">
                  <Button className="gap-2 whitespace-nowrap">
                    <ExternalLink className="h-4 w-4" />
                    Connect Stripe
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Payout history ────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Payout History</CardTitle></CardHeader>
          <CardContent>
            {payoutsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No payouts yet.
                {!stripeConnected && " Connect Stripe first to start receiving payouts."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Period</th>
                      <th className="pb-2 font-medium">Transfer ID</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 tabular-nums">
                          {format(parseISO(p.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="py-3 font-bold text-foreground">{money.format(p.amount)}</td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {p.period_start && p.period_end
                            ? `${p.period_start} → ${p.period_end}`
                            : "—"}
                        </td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">
                          {p.stripe_transfer_id ?? "—"}
                        </td>
                        <td className="py-3">
                          <Badge variant="secondary" className={payoutStatusStyle[p.status] ?? ""}>
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Transaction History ───────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Transaction</th>
                    <th className="pb-2 font-medium">Activity</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Gross</th>
                    <th className="pb-2 font-medium text-right">Commission</th>
                    <th className="pb-2 font-medium text-right">Net</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {showStatsSkeleton
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                        </tr>
                      ))
                    : transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-3 font-medium text-foreground">{t.booking_ref}</td>
                          <td className="py-3 text-foreground max-w-[140px] truncate">{t.activity}</td>
                          <td className="py-3 text-muted-foreground">{t.customer}</td>
                          <td className="py-3 text-muted-foreground">{t.date}</td>
                          <td className="py-3 text-right font-medium">${t.gross.toFixed(2)}</td>
                          <td className="py-3 text-right text-destructive">-${t.commission.toFixed(2)}</td>
                          <td className="py-3 text-right font-bold text-foreground">${t.net.toFixed(2)}</td>
                          <td className="py-3">
                            <Badge variant="secondary" className={statusStyle[t.rowStatus]}>
                              {t.payment_status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!showStatsSkeleton && transactions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">No bookings yet.</p>
            )}
          </CardContent>
        </Card>

      </div>
    </AgencyLayout>
  );
}
