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
            <Route path="/" element={<Index />} />
            <Route path="/account/:accountId" element={<AccountDetail />} />
            <Route path="/scripts" element={<ScriptGenerator />} />
            <Route path="/qa-review" element={<QAReviewInbox />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/studio/:scriptRunId" element={<Studio />} />
            
            {/* Story Studio - new dedicated route */}
            <Route path="/story/:storyId" element={<StoryStudio />} />
            
            {/* Lab - keep for experiments (compare, learning) */}
            <Route path="/studio/lab" element={<Lab />} />
            <Route path="/studio/lab/story" element={<Lab />} />
            {/* Redirect old story routes to new Story Studio */}
            <Route path="/studio/lab/story/:storyId" element={<StoryStudioRedirect />} />
            
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

/** Redirect from old Lab story route to new Story Studio */
function StoryStudioRedirect() {
  const storyId = window.location.pathname.split("/").pop();
  return <Navigate to={`/story/${storyId}`} replace />;
}

export default App;
