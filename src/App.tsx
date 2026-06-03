import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useAuthStore } from "./stores/authStore";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CookieConsent } from "./components/CookieConsent";
import { supabase } from "./lib/supabase";

// Lazy-loaded pages
const Account = lazy(() => import("./pages/Account"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Messages = lazy(() => import("./pages/Messages"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Index = lazy(() => import("./pages/Index"));
const Activities = lazy(() => import("./pages/Activities"));
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const Login = lazy(() => import("./pages/Login"));
const AgencyLanding = lazy(() => import("./pages/AgencyLanding"));
const AgencyProfile = lazy(() => import("./pages/AgencyProfile"));
const BookingPayment = lazy(() => import("./pages/BookingPayment"));
const BookingConfirmation = lazy(() => import("./pages/BookingConfirmation"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const FAQ = lazy(() => import("./pages/FAQ"));
const About = lazy(() => import("./pages/About"));
const CancellationPolicy = lazy(() => import("./pages/CancellationPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Agency pages
const AgencyMessages = lazy(() => import("./pages/agency/AgencyMessages"));
const AgencyLogin = lazy(() => import("./pages/agency/AgencyLogin"));
const AgencyOnboarding = lazy(() => import("./pages/agency/AgencyOnboarding"));
const AgencyVerificationStatus = lazy(() => import("./pages/agency/AgencyVerificationStatus"));
const AgencyDashboard = lazy(() => import("./pages/agency/AgencyDashboard"));
const AgencyListings = lazy(() => import("./pages/agency/AgencyListings"));
const AgencyListingForm = lazy(() => import("./pages/agency/AgencyListingForm"));
const AgencyBookings = lazy(() => import("./pages/agency/AgencyBookings"));
const AgencyAvailability = lazy(() => import("./pages/agency/AgencyAvailability"));
const AgencyEarnings = lazy(() => import("./pages/agency/AgencyEarnings"));
const AgencySettings = lazy(() => import("./pages/agency/AgencySettings"));
const AgencyAnalytics = lazy(() => import("./pages/agency/AgencyAnalytics"));

// Admin pages
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminAgencies = lazy(() => import("./pages/admin/Agencies"));
const AdminListings = lazy(() => import("./pages/admin/Listings"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminBookings = lazy(() => import("./pages/admin/Bookings"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminAuditLog = lazy(() => import("./pages/admin/AuditLog"));
const AdminReviews    = lazy(() => import("./pages/admin/Reviews"));
const AdminMFASetup   = lazy(() => import("./pages/admin/MFASetup"));
const AdminMFAVerify  = lazy(() => import("./pages/admin/MFAVerify"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const queryClient = new QueryClient();

function AuthInitializer() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  return null;
}

function MaintenanceBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle()
      .then(({ data }) => setShow(data?.value === true));
  }, []);

  if (!show) return null;

  return (
    <div className="bg-yellow-400 text-yellow-900 text-sm font-medium text-center px-4 py-2 flex items-center justify-between">
      <span>The platform is currently under maintenance. Some features may be unavailable.</span>
      <button onClick={() => setShow(false)} className="ml-4 underline text-xs">Dismiss</button>
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthInitializer />
          <MaintenanceBanner />
          <CookieConsent />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/activities" element={<Activities />} />
              <Route path="/activities/:id" element={<ActivityDetail />} />
              <Route path="/login" element={<Login />} />
              <Route path="/agency" element={<AgencyLanding />} />
              <Route path="/agency/login" element={<AgencyLogin />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/mfa-setup" element={<AdminMFASetup />} />
              <Route path="/admin/mfa-verify" element={<AdminMFAVerify />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/agency/profile/:agencyId" element={<AgencyProfile />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/about" element={<About />} />
              <Route path="/cancellation" element={<CancellationPolicy />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              {/* Traveler Routes (Protected) */}
              <Route element={<ProtectedRoute allowedRoles={["user"]} />}>
                <Route path="/account" element={<Account />} />
                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/wishlist" element={<Wishlist />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/booking/payment" element={<BookingPayment />} />
                <Route path="/booking/confirmation" element={<BookingConfirmation />} />
              </Route>

              {/* Agency Onboarding (user or agency role — pre-approval flow) */}
              <Route element={<ProtectedRoute allowedRoles={["user", "agency"]} />}>
                <Route path="/agency/onboarding" element={<AgencyOnboarding />} />
                <Route path="/agency/onboarding/status" element={<AgencyVerificationStatus />} />
              </Route>

              {/* Agency Routes (verified agency only) */}
              <Route element={<ProtectedRoute allowedRoles={["agency"]} />}>
                <Route path="/agency/messages" element={<AgencyMessages />} />
                <Route path="/agency/dashboard" element={<AgencyDashboard />} />
                <Route path="/agency/listings" element={<AgencyListings />} />
                <Route path="/agency/listings/new" element={<AgencyListingForm />} />
                <Route path="/agency/listings/:id/edit" element={<AgencyListingForm />} />
                <Route path="/agency/bookings" element={<AgencyBookings />} />
                <Route path="/agency/availability" element={<AgencyAvailability />} />
                <Route path="/agency/earnings" element={<AgencyEarnings />} />
                <Route path="/agency/settings" element={<AgencySettings />} />
                <Route path="/agency/analytics" element={<AgencyAnalytics />} />
              </Route>

              {/* Admin Routes (Protected) */}
              <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/agencies" element={<AdminAgencies />} />
                <Route path="/admin/listings" element={<AdminListings />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/bookings" element={<AdminBookings />} />
                <Route path="/admin/payments" element={<AdminPayments />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/audit" element={<AdminAuditLog />} />
                <Route path="/admin/reviews" element={<AdminReviews />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
