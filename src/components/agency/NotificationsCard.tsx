import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export type NotifKey = "new_booking" | "booking_cancel" | "payout" | "review";

const NOTIFICATION_ITEMS: { id: NotifKey; label: string; desc: string }[] = [
  { id: "new_booking",    label: "New booking received", desc: "Get notified when a customer books your activity" },
  { id: "booking_cancel", label: "Booking cancellation", desc: "Alert when a booking is cancelled" },
  { id: "payout",         label: "Payout processed",     desc: "Confirmation when payouts are completed" },
  { id: "review",         label: "New review",           desc: "When a customer leaves a review" },
];

interface Props {
  notifications: Record<NotifKey, boolean>;
  notifSaving: NotifKey | null;
  onToggle: (key: NotifKey, checked: boolean) => void;
}

export function NotificationsCard({ notifications, notifSaving, onToggle }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {NOTIFICATION_ITEMS.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <Separator className="mb-4" />}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {notifSaving === n.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={notifications[n.id]}
                  disabled={notifSaving === n.id}
                  onCheckedChange={(checked) => onToggle(n.id, checked)}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
