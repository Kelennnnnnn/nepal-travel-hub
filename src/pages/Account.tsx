import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Upload, Save, Lock, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

export default function Account() {
  const { logout } = useAuthStore();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);

  // Danger zone
  const [isDeleting, setIsDeleting] = useState(false);

  // Load user data on mount
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email ?? "");
      setName(user.user_metadata?.name ?? "");
      setPhone(user.user_metadata?.phone ?? "");
      setLastSignIn(user.last_sign_in_at ?? null);

      const storedPath = user.user_metadata?.avatar_url ?? user.user_metadata?.avatar_path;
      if (storedPath) {
        setAvatarPath(storedPath);
        const { data } = await supabase.storage
          .from("user-avatars")
          .createSignedUrl(storedPath, 3600);
        if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      }
    };
    void load();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }

    setIsUploadingAvatar(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsUploadingAvatar(false); return; }

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("user-avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error(uploadError.message);
      setIsUploadingAvatar(false);
      return;
    }

    const { data: signed } = await supabase.storage
      .from("user-avatars")
      .createSignedUrl(path, 3600);

    if (signed?.signedUrl) setAvatarUrl(signed.signedUrl);
    setAvatarPath(path);

    // Store the private storage path in auth metadata; signed URLs are created when displayed.
    await supabase.auth.updateUser({ data: { avatar_url: path } });
    toast.success("Avatar updated.");
    setIsUploadingAvatar(false);
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setIsSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { name: name.trim(), phone: phone.trim(), avatar_url: avatarPath },
    });
    setIsSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved.");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setIsSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) { toast.error(error.message); return; }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
  };

  const getFunctionErrorMessage = async (error: unknown) => {
    if (error && typeof error === "object" && "context" in error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const body = await context.json();
          if (typeof body?.error === "string") return body.error;
        } catch {
          // Fall through to the default error message.
        }
      }
    }
    return error instanceof Error ? error.message : "Failed to delete account.";
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Not authenticated.");
      setIsDeleting(false);
      return;
    }

    const { error } = await supabase.functions.invoke("delete-account", {
      body: {},
    });

    if (error) {
      toast.error(await getFunctionErrorMessage(error));
      setIsDeleting(false);
      return;
    }

    await logout();
    toast.success("Your account has been deleted.");
  };

  const initials = name
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const formatDate = (iso: string | null) => {
    if (!iso) return "Unknown";
    return new Date(iso).toLocaleString();
  };

  return (
    <Layout>
      <div className="pt-24 md:pt-32 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <h1 className="text-2xl font-bold mb-6">My Account</h1>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="danger">Danger Zone</TabsTrigger>
            </TabsList>

            {/* ── Profile ── */}
            <TabsContent value="profile">
              <Card>
                <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                      <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {isUploadingAvatar
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Upload className="h-4 w-4" />}
                        {isUploadingAvatar ? "Uploading…" : "Upload Photo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, or WebP · Max 2MB</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={email} disabled className="opacity-60 cursor-not-allowed" />
                      <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977 98XXXXXXXX" />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="gap-2">
                      {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {isSavingProfile ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Security ── */}
            <TabsContent value="security">
              <Card>
                <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {lastSignIn && (
                    <p className="text-sm text-muted-foreground">
                      Last sign-in: <span className="text-foreground font-medium">{formatDate(lastSignIn)}</span>
                    </p>
                  )}
                  <Separator />
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      placeholder="Optional"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Supabase does not require this to update your password.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleChangePassword} disabled={isSavingPassword} className="gap-2">
                      {isSavingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      {isSavingPassword ? "Updating…" : "Update Password"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Danger Zone ── */}
            <TabsContent value="danger">
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-5 w-5" />
                    Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">Delete Account</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently deletes your account, bookings, and reviews. This cannot be undone.
                      Accounts with upcoming confirmed bookings cannot be deleted.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2" disabled={isDeleting}>
                        <Trash2 className="h-4 w-4" />
                        Delete My Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete your account, all your bookings history, and reviews.
                          This action <strong>cannot be undone</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeleting ? "Deleting…" : "Yes, delete my account"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
