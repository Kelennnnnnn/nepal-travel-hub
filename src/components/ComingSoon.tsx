import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Shared placeholder for any page whose functionality was removed along
 * with the old Stripe-based payment/checkout/commission/payout model and
 * has not yet been rebuilt for the new NPR reservation-fee model.
 */
export function ComingSoon({ title, description, icon: Icon = Construction }: ComingSoonProps) {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {description ?? "This is being rebuilt for our new payment model and will be back soon."}
        </p>
      </CardContent>
    </Card>
  );
}
