import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Activities from "./pages/Activities";
import ActivityDetail from "./pages/ActivityDetail";
import Login from "./pages/Login";
import AgencyLanding from "./pages/AgencyLanding";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminAgencies from "./pages/admin/Agencies";
import AdminListings from "./pages/admin/Listings";
import AdminUsers from "./pages/admin/Users";
import AdminBookings from "./pages/admin/Bookings";
import AdminPayments from "./pages/admin/Payments";
import AdminSettings from "./pages/admin/Settings";
import AdminLogin from "./pages/admin/AdminLogin";
import AgencyDashboard from "./pages/agency/AgencyDashboard";
import AgencyListings from "./pages/agency/AgencyListings";
import AgencyListingForm from "./pages/agency/AgencyListingForm";
import AgencyBookings from "./pages/agency/AgencyBookings";
import AgencyAvailability from "./pages/agency/AgencyAvailability";
import AgencyEarnings from "./pages/agency/AgencyEarnings";
import AgencySettings from "./pages/agency/AgencySettings";
import AgencyOnboarding from "./pages/agency/AgencyOnboarding";
import AgencyVerificationStatus from "./pages/agency/AgencyVerificationStatus";
import AgencyLogin from "./pages/agency/AgencyLogin";
import BookingPayment from "./pages/BookingPayment";
import BookingConfirmation from "./pages/BookingConfirmation";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import About from "./pages/About";
import CancellationPolicy from "./pages/CancellationPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useAuthStore } from "./stores/authStore";

const queryClient = new QueryClient();

function AuthInitializer() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthInitializer />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Index />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/activities/:id" element={<ActivityDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/agency" element={<AgencyLanding />} />
          <Route path="/agency/login" element={<AgencyLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/about" element={<About />} />
          <Route path="/cancellation" element={<CancellationPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />

          {/* Traveler Booking Routes (Protected) */}
          <Route element={<ProtectedRoute allowedRoles={["user"]} />}>
            <Route path="/booking/payment" element={<BookingPayment />} />
            <Route path="/booking/confirmation" element={<BookingConfirmation />} />
          </Route>

          {/* Agency Routes (Protected) */}
          <Route element={<ProtectedRoute allowedRoles={["agency"]} />}>
            <Route path="/agency/dashboard" element={<AgencyDashboard />} />
            <Route path="/agency/listings" element={<AgencyListings />} />
            <Route path="/agency/listings/new" element={<AgencyListingForm />} />
            <Route path="/agency/listings/:id/edit" element={<AgencyListingForm />} />
            <Route path="/agency/bookings" element={<AgencyBookings />} />
            <Route path="/agency/availability" element={<AgencyAvailability />} />
            <Route path="/agency/earnings" element={<AgencyEarnings />} />
            <Route path="/agency/settings" element={<AgencySettings />} />
            <Route path="/agency/onboarding" element={<AgencyOnboarding />} />
            <Route path="/agency/onboarding/status" element={<AgencyVerificationStatus />} />
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
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
