import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import CodeWorkspace from "./components/CodeWorkspace";
import SecurityScanner from "./components/SecurityScanner";
import SummaryReport from "./components/SummaryReport";
import Settings from "./components/Settings";
import NotFound from "./pages/NotFound";
import { AppProvider } from "./context/AppContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="workspace" element={<CodeWorkspace />} />
            <Route path="security" element={<SecurityScanner />} />
            <Route path="report" element={<SummaryReport />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
