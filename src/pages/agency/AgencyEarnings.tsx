import { useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DollarSign, TrendingUp, ArrowDownToLine, Clock } from "lucide-react";
import { toast } from "sonner";

const summaryStats = [
  { label: "Total Revenue", value: "$24,890", icon: DollarSign, sub: "Lifetime" },
  { label: "Platform Commission (15%)", value: "$3,734", icon: TrendingUp, sub: "Total deducted" },
  { label: "Net Earnings", value: "$21,156", icon: ArrowDownToLine, sub: "After commission" },
  { label: "Pending Payout", value: "$4,218", icon: Clock, sub: "Next payout: Apr 5" },
];

interface Transaction {
  id: string;
  booking: string;
  activity: string;
  customer: string;
  date: string;
  gross: number;
  commission: number;
  net: number;
  status: "paid" | "pending" | "processing";
}

const transactions: Transaction[] = [
  { id: "TXN-001", booking: "BK-001", activity: "Everest Base Camp Trek", customer: "John Smith", date: "2026-03-20", gross: 3798, commission: 569.7, net: 3228.3, status: "paid" },
  { id: "TXN-002", booking: "BK-003", activity: "Chitwan Safari Experience", customer: "Mike Chen", date: "2026-03-15", gross: 1800, commission: 270, net: 1530, status: "paid" },
  { id: "TXN-003", booking: "BK-005", activity: "Everest Base Camp Trek", customer: "Alex Turner", date: "2026-02-15", gross: 3798, commission: 569.7, net: 3228.3, status: "paid" },
  { id: "TXN-004", booking: "BK-002", activity: "Paragliding Over Pokhara", customer: "Sarah Lee", date: "2026-03-28", gross: 120, commission: 18, net: 102, status: "pending" },
  { id: "TXN-005", booking: "BK-004", activity: "Langtang Valley Trek", customer: "Emma Wilson", date: "2026-03-29", gross: 3297, commission: 494.55, net: 2802.45, status: "processing" },
];

const statusStyle: Record<string, string> = {
  paid: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-muted text-muted-foreground",
};

export default function AgencyEarnings() {
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);

  const handleRequestPayout = () => {
    setPayoutDialogOpen(false);
    setPayoutRequested(true);
    toast.success("Payout request submitted. You'll receive $4,218 within 3–5 business days.");
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
                  <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
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
                  : "You have $4,218 available for withdrawal. Payouts are processed within 3–5 business days."}
              </p>
            </div>
            <Button
              className="gap-2 whitespace-nowrap"
              disabled={payoutRequested}
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
                You are about to request a payout of <strong>$4,218</strong> to your registered bank account. This will be processed within 3–5 business days.
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
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-3 font-medium text-foreground">{t.id}</td>
                      <td className="py-3 text-foreground">{t.activity}</td>
                      <td className="py-3 text-muted-foreground">{t.customer}</td>
                      <td className="py-3 text-muted-foreground">{t.date}</td>
                      <td className="py-3 text-right font-medium">${t.gross.toFixed(2)}</td>
                      <td className="py-3 text-right text-destructive">-${t.commission.toFixed(2)}</td>
                      <td className="py-3 text-right font-bold text-foreground">${t.net.toFixed(2)}</td>
                      <td className="py-3"><Badge variant="secondary" className={statusStyle[t.status]}>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AgencyLayout>
  );
}
