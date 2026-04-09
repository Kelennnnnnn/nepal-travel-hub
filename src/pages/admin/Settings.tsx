import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminLayout } from "@/components/admin/AdminLayout";

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Platform configuration</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Platform Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Platform Name</Label>
              <Input value="Yatra Nepal" readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Commission Rate</Label>
              <Input value="15%" readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input value="hello@yatranepal.com" readOnly className="bg-muted" />
            </div>
            <p className="text-xs text-muted-foreground">
              These fields are read-only. Editable settings panel available in the next release.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
