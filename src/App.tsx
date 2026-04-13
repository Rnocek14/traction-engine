import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Ideas from "./pages/Ideas";
import AccountDetail from "./pages/AccountDetail";
import ScriptGenerator from "./pages/ScriptGenerator";
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
            <Route path="/" element={<Index />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/produce" element={<Produce />} />
            <Route path="/produce/:storyId" element={<Produce />} />
            <Route path="/review" element={<Review />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:tab" element={<Settings />} />
            <Route path="/account/:accountId" element={<AccountDetail />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:productId" element={<ProductDossier />} />

            {/* Scripts generator (accessible from Produce "New Script") */}
            <Route path="/scripts" element={<ScriptGenerator />} />

            {/* Rendition Studio (script timeline editor) */}
            <Route path="/studio" element={<Studio />} />
            <Route path="/studio/:scriptRunId" element={<Studio />} />
            <Route path="/studio/analytics" element={<RoutingAnalytics />} />

            {/* Legacy redirects */}
            <Route path="/stories" element={<Navigate to="/produce" replace />} />
            <Route path="/stories/:storyId" element={<StoryRedirect />} />
            <Route path="/story/:storyId" element={<StoryRedirect />} />
            <Route path="/studio/lab/story/:storyId" element={<StoryRedirect />} />
            <Route path="/studio/lab/story" element={<Navigate to="/produce" replace />} />
            <Route path="/studio/lab" element={<Navigate to="/produce" replace />} />
            <Route path="/qa-review" element={<Navigate to="/review" replace />} />

            <Route path="/login" element={<Login />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

/** Redirect from old story routes to new /produce/:storyId */
function StoryRedirect() {
  const storyId = window.location.pathname.split("/").pop();
  return <Navigate to={`/produce/${storyId}`} replace />;
}

export default App;
