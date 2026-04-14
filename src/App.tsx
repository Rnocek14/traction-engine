import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Verticals from "./pages/Verticals";
import VerticalDetail from "./pages/VerticalDetail";
import AccountDetail from "./pages/AccountDetail";
import Produce from "./pages/Produce";
import Review from "./pages/Review";
import Studio from "./pages/Studio";
import Settings from "./pages/Settings";
import RoutingAnalytics from "./pages/RoutingAnalytics";
import Products from "./pages/Products";
import ProductDossier from "./pages/ProductDossier";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Core Workspaces */}
            <Route path="/" element={<Verticals />} />
            <Route path="/verticals/:vertical" element={<VerticalDetail />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:productId" element={<ProductDossier />} />
            <Route path="/studio" element={<Review />} />
            <Route path="/studio/:scriptRunId" element={<Studio />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:tab" element={<Settings />} />
            <Route path="/account/:accountId" element={<AccountDetail />} />

            {/* Legacy redirects */}
            <Route path="/ideas" element={<Navigate to="/" replace />} />
            <Route path="/produce" element={<Navigate to="/studio" replace />} />
            <Route path="/produce/:storyId" element={<ProduceRedirect />} />
            <Route path="/review" element={<Navigate to="/studio" replace />} />
            <Route path="/scripts" element={<Navigate to="/studio" replace />} />
            <Route path="/stories" element={<Navigate to="/studio" replace />} />
            <Route path="/stories/:storyId" element={<Navigate to="/studio" replace />} />
            <Route path="/story/:storyId" element={<Navigate to="/studio" replace />} />
            <Route path="/studio/lab/story/:storyId" element={<Navigate to="/studio" replace />} />
            <Route path="/studio/lab/story" element={<Navigate to="/studio" replace />} />
            <Route path="/studio/lab" element={<Navigate to="/studio" replace />} />
            <Route path="/studio/analytics" element={<Navigate to="/studio" replace />} />
            <Route path="/qa-review" element={<Navigate to="/studio" replace />} />

            <Route path="/login" element={<Login />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

function ProduceRedirect() {
  return <Navigate to="/studio" replace />;
}

export default App;
