import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useOfflineData } from "@/hooks/useOfflineData";
import OfflineIndicator from "@/components/offline/OfflineIndicator";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Emergency from "./pages/Emergency";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Reports from "./pages/Reports";
import Support from "./pages/Support";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const AppContent = () => {
  // Initialize service worker for PWA functionality
  useServiceWorker('en');
  useOfflineData({ autoCache: true });

  // Global unhandled rejection handler
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return (
    <>
      <OfflineIndicator language="en" />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<ProtectedRoute allowIncompleteOnboarding><Onboarding /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/emergency" element={<ProtectedRoute><Emergency /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute requiredRoles={['chw', 'admin']}><Dashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requiredRoles={['admin']}><Admin /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute requiredRoles={['chw', 'admin']}><Reports /></ProtectedRoute>} />
          <Route path="/support" element={<Support />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <ThemeProvider defaultTheme="system" storageKey="medireach-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
