import { HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AgencyListItem } from "@/stores/agencyStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agency: AgencyListItem | null;
  note: string;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function AgencyRequestInfoDialog({
  open, onOpenChange, agency, note, onNoteChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request More Information</DialogTitle>
          <DialogDescription>
            Tell <strong>{agency?.agency.display_name}</strong> what's missing or needs
            clarification. They'll see this note and can update their application.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>What do you need?</Label>
          <Textarea
            placeholder="e.g. Your tourism license photo is not legible — please re-upload a clearer scan..."
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); onNoteChange(""); }}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!note.trim() || actionLoading !== null}>
            {actionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <HelpCircle className="h-4 w-4 mr-1" />}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
