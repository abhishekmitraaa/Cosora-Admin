import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AdminSessionProvider, useAdminSession } from "@/hooks/useAdminSession";
import { RequireAdmin, RequireSection } from "@/components/Guard";
import Shell from "@/components/Shell";
import { canSee } from "@/lib/roles";

import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Products from "@/pages/Products";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Ads from "@/pages/Ads";
import Subscriptions from "@/pages/Subscriptions";
import Reports from "@/pages/Reports";
import Admins from "@/pages/Admins";
import Accounts from "@/pages/Accounts";
import Chats from "@/pages/Chats";
import ChatThread from "@/pages/ChatThread";
import ChatReview from "@/pages/ChatReview";
import ChatKeywords from "@/pages/ChatKeywords";
import ChatPatterns from "@/pages/ChatPatterns";
import ChatReasons from "@/pages/ChatReasons";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Send each admin to the first section their role can actually see. */
function Landing() {
  const role = useAdminSession().identity?.role ?? null;
  const first =
    (
      [
        "products",
        "vendors",
        "ads",
        "subscriptions",
        "accounts",
        "chats",
        "chat-review",
        "chat-keywords",
        "chat-patterns",
        "chat-reasons",
        "reports",
        "admins",
      ] as const
    ).find((s) => canSee(role, s)) ?? "reports";
  return <Navigate to={`/${first}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminSessionProvider>
        <BrowserRouter>
          <Toaster richColors position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Invite / recovery links land here. Outside RequireAdmin on purpose —
                see ResetPassword. /set-password is a backward-compatible alias. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/set-password" element={<ResetPassword />} />
            <Route
              element={
                <RequireAdmin>
                  <Shell />
                </RequireAdmin>
              }
            >
              <Route path="/" element={<Landing />} />
              <Route
                path="/products"
                element={
                  <RequireSection section="products">
                    <Products />
                  </RequireSection>
                }
              />
              <Route
                path="/vendors"
                element={
                  <RequireSection section="vendors">
                    <Vendors />
                  </RequireSection>
                }
              />
              <Route
                path="/vendors/:id"
                element={
                  <RequireSection section="vendors">
                    <VendorDetail />
                  </RequireSection>
                }
              />
              <Route
                path="/ads"
                element={
                  <RequireSection section="ads">
                    <Ads />
                  </RequireSection>
                }
              />
              <Route
                path="/subscriptions"
                element={
                  <RequireSection section="subscriptions">
                    <Subscriptions />
                  </RequireSection>
                }
              />
              <Route
                path="/accounts"
                element={
                  <RequireSection section="accounts">
                    <Accounts />
                  </RequireSection>
                }
              />
              <Route
                path="/chats"
                element={
                  <RequireSection section="chats">
                    <Chats />
                  </RequireSection>
                }
              />
              <Route
                path="/chats/:id"
                element={
                  <RequireSection section="chats">
                    <ChatThread />
                  </RequireSection>
                }
              />
              <Route
                path="/chat-review"
                element={
                  <RequireSection section="chat-review">
                    <ChatReview />
                  </RequireSection>
                }
              />
              <Route
                path="/chat-keywords"
                element={
                  <RequireSection section="chat-keywords">
                    <ChatKeywords />
                  </RequireSection>
                }
              />
              <Route
                path="/chat-patterns"
                element={
                  <RequireSection section="chat-patterns">
                    <ChatPatterns />
                  </RequireSection>
                }
              />
              <Route
                path="/chat-reasons"
                element={
                  <RequireSection section="chat-reasons">
                    <ChatReasons />
                  </RequireSection>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireSection section="reports">
                    <Reports />
                  </RequireSection>
                }
              />
              <Route
                path="/admins"
                element={
                  <RequireSection section="admins">
                    <Admins />
                  </RequireSection>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AdminSessionProvider>
    </QueryClientProvider>
  );
}
