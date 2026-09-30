import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Mail, Loader2, MoreVertical, UserPlus, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { invokeEdge } from "@/lib/edge";

type AgencyRole = "owner" | "manager" | "staff";
type InvitableRole = "manager" | "staff";

interface TeamMember {
  membership_id: string;
  user_id: string;
  display_name: string;
  email: string;
  agency_role: AgencyRole;
  accepted_at: string | null;
  invited_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  agency_role: InvitableRole;
  created_at: string;
  expires_at: string;
}

interface Props {
  agencyId: string;
  currentUserId: string;
}

export function AgencyTeamCard({ agencyId, currentUserId }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableRole>("staff");
  const [isInviting, setIsInviting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: roster }, { data: pending }] = await Promise.all([
      supabase.rpc("agency_team_roster", { p_agency_id: agencyId }),
      supabase
        .from("agency_invitations")
        .select("id, email, agency_role, created_at, expires_at")
        .eq("agency_id", agencyId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
    ]);
    setMembers((roster as TeamMember[] | null) ?? []);
    setInvites((pending as PendingInvite[] | null) ?? []);
    setIsLoading(false);
  }, [agencyId]);

  useEffect(() => { void load(); }, [load]);

  const me = members.find((m) => m.user_id === currentUserId);
  const isOwner = me?.agency_role === "owner";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    const { error } = await invokeEdge("agency-invitations", {
      body: { action: "invite", agency_id: agencyId, email: inviteEmail.trim(), role: inviteRole },
    });
    setIsInviting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Invitation sent to ${inviteEmail.trim()}.`);
    setInviteEmail("");
    setInviteRole("staff");
    setInviteOpen(false);
    void load();
  };

  const handleRevoke = async (invitationId: string) => {
    setActionLoading(invitationId);
    const { error } = await invokeEdge("agency-invitations", {
      body: { action: "revoke", invitation_id: invitationId },
    });
    setActionLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invitation revoked.");
    void load();
  };

  const handleRemove = async (userId: string) => {
    setActionLoading(userId);
    const { error } = await supabase.rpc("remove_agency_member", { p_agency_id: agencyId, p_user_id: userId });
    setActionLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed.");
    void load();
  };

  const handleChangeRole = async (userId: string, role: AgencyRole) => {
    setActionLoading(userId);
    const { error } = await supabase.rpc("change_agency_member_role", { p_agency_id: agencyId, p_user_id: userId, p_role: role });
    setActionLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Role updated.");
    void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Team
        </CardTitle>
        {isOwner && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite a team member</DialogTitle></DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InvitableRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isInviting} className="gap-2">
                    {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {isInviting ? "Sending…" : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading team…</div>
        ) : (
          <>
            {members.map((m) => (
              <div key={m.membership_id} className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="capitalize text-xs">{m.agency_role}</Badge>
                  {isOwner && m.user_id !== currentUserId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={actionLoading === m.user_id}>
                          {actionLoading === m.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(["owner", "manager", "staff"] as AgencyRole[])
                          .filter((r) => r !== m.agency_role)
                          .map((r) => (
                            <DropdownMenuItem key={r} onClick={() => void handleChangeRole(m.user_id, r)} className="capitalize">
                              Make {r}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuItem className="text-destructive" onClick={() => void handleRemove(m.user_id)}>
                          Remove from team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}

            {invites.length > 0 && (
              <div className="pt-3 mt-2 border-t border-border space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">Pending invitations</p>
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{inv.email}</p>
                        <p className="text-xs text-muted-foreground capitalize">{inv.agency_role} · invited {new Date(inv.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground flex-shrink-0"
                        disabled={actionLoading === inv.id}
                        onClick={() => void handleRevoke(inv.id)}
                      >
                        {actionLoading === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
