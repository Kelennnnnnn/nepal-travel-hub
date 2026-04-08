import { useState, useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DollarSign, TrendingUp, ArrowDownToLine, Clock } from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type Booking } from "@/stores/bookingsStore";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function sumPaid(bookings: Booking[], pick: (b: Booking) => number): number {
  return bookings.filter((b) => b.payment_status === "paid").reduce((acc, b) => acc + pick(b), 0);
}

function pendingPayoutSum(bookings: Booking[]): number {
  return bookings
    .filter((b) => b.status === "confirmed" && b.payment_status === "paid")
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

export default function AgencyEarnings() {
  const { agencyBookings, isLoading, fetchAgencyBookings } = useBookingsStore();
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);

  useEffect(() => {
    if (agencyBookings.length === 0) {
      void fetchAgencyBookings();
    }
  }, [agencyBookings.length, fetchAgencyBookings]);

  const stats = useMemo(() => {
    const totalRevenue = sumPaid(agencyBookings, (b) => b.total_amount);
    const platformCommission = sumPaid(agencyBookings, (b) => b.commission_amount);
    const netEarnings = sumPaid(agencyBookings, (b) => b.net_payout);
    const pendingPayout = pendingPayoutSum(agencyBookings);
    return {
      totalRevenue,
      platformCommission,
      netEarnings,
      pendingPayout,
    };
  }, [agencyBookings]);

  const summaryStats = useMemo(
    () => [
      { label: "Total Revenue", value: money.format(stats.totalRevenue), icon: DollarSign, sub: "Lifetime (paid)" },
      { label: "Platform Commission (15%)", value: money.format(stats.platformCommission), icon: TrendingUp, sub: "Total deducted" },
      { label: "Net Earnings", value: money.format(stats.netEarnings), icon: ArrowDownToLine, sub: "After commission" },
      {
        label: "Pending Payout",
        value: money.format(stats.pendingPayout),
        icon: Clock,
        sub: "Confirmed & paid — not yet transferred",
      },
    ],
    [stats]
  );

  const transactions = useMemo(
    () =>
      agencyBookings.map((b) => ({
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

  const handleRequestPayout = () => {
    setPayoutDialogOpen(false);
    setPayoutRequested(true);
    toast.success("Your request has been submitted and will be processed within 3–5 business days.");
  };

  return (
    <AgencyLayout title="Earnings">
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  {showStatsSkeleton ? (
                    <Skeleton className="h-9 w-28 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  )}
                  <span className="text-xs text-muted-foreground">{s.sub}</span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Payout action */}
        <Card>
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">Request Payout</p>
              <p className="text-sm text-muted-foreground">
                {payoutRequested
                  ? "Your payout request is being processed. Expected within 3–5 business days."
                  : showStatsSkeleton
                    ? "Loading your balance…"
                    : `You have ${money.format(stats.pendingPayout)} available for withdrawal. Payouts are processed within 3–5 business days.`}
              </p>
            </div>
            <Button
              className="gap-2 whitespace-nowrap"
              disabled={payoutRequested || showStatsSkeleton || stats.pendingPayout <= 0}
              onClick={() => setPayoutDialogOpen(true)}
            >
              <ArrowDownToLine className="h-4 w-4" />
              {payoutRequested ? "Request Submitted" : "Request Payout"}
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request Payout</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to request a payout of <strong>{money.format(stats.pendingPayout)}</strong> to your registered bank account. This will be processed within 3–5 business days.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRequestPayout}>Confirm Request</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Transactions */}
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
                          <td className="py-3" colSpan={8}>
                            <Skeleton className="h-8 w-full" />
                          </td>
                        </tr>
                      ))
                    : transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-3 font-medium text-foreground">{t.booking_ref}</td>
                          <td className="py-3 text-foreground">{t.activity}</td>
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
