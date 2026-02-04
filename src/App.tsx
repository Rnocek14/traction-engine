import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import AccountDetail from "./pages/AccountDetail";
import ScriptGenerator from "./pages/ScriptGenerator";
import QAReviewInbox from "./pages/QAReviewInbox";
import Studio from "./pages/Studio";
import Lab from "./pages/Lab";
import StoryStudio from "./pages/StoryStudio";
import Stories from "./pages/Stories";
import Settings from "./pages/Settings";
import RoutingAnalytics from "./pages/RoutingAnalytics";
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
            <Route path="/stories" element={<Stories />} />
            <Route path="/stories/:storyId" element={<Stories />} />
            <Route path="/scripts" element={<ScriptGenerator />} />
            <Route path="/qa-review" element={<QAReviewInbox />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:tab" element={<Settings />} />
            <Route path="/account/:accountId" element={<AccountDetail />} />
            
            {/* Legacy routes - redirect to new structure */}
            <Route path="/story/:storyId" element={<StoryRedirect />} />
            <Route path="/studio/lab/story/:storyId" element={<StoryRedirect />} />
            <Route path="/studio/lab/story" element={<Navigate to="/stories" replace />} />
            <Route path="/studio/lab" element={<Navigate to="/stories" replace />} />
            
            {/* Rendition Studio (script-based) - still separate */}
            <Route path="/studio" element={<Studio />} />
            <Route path="/studio/:scriptRunId" element={<Studio />} />
            <Route path="/studio/analytics" element={<RoutingAnalytics />} />
            
            <Route path="/login" element={<Login />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

/** Redirect from old story routes to new unified /stories workspace */
function StoryRedirect() {
  const storyId = window.location.pathname.split("/").pop();
  return <Navigate to={`/stories/${storyId}`} replace />;
}

export default App;
