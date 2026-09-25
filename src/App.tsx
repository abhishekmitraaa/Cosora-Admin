import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AdminSessionProvider, useAdminSession } from "@/hooks/useAdminSession";
import { RequireAdmin, RequireSection } from "@/components/Guard";
import Shell from "@/components/Shell";
import { SkeletonList } from "@/components/ui";
import { canSee } from "@/lib/roles";

import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Products from "@/pages/Products";
import Videos from "@/pages/Videos";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Ads from "@/pages/Ads";
import Subscriptions from "@/pages/Subscriptions";
import Reports from "@/pages/Reports";
import Admins from "@/pages/Admins";
import AdminLog from "@/pages/AdminLog";
import Accounts from "@/pages/Accounts";
import Chats from "@/pages/Chats";
import ChatThread from "@/pages/ChatThread";
import ChatReview from "@/pages/ChatReview";
import ChatKeywords from "@/pages/ChatKeywords";
import ChatPatterns from "@/pages/ChatPatterns";
import ChatReasons from "@/pages/ChatReasons";
import Faqs from "@/pages/Faqs";
// Phase-4 sections. Geography reads real vendor rows; the five below it render
// from a development-only seed (src/lib/devSeed/) until Phase 2 creates their
// tables, and Live Activity is an external link with no Cosora query at all.
// Geography is the ONE lazily-loaded route. It pulls in maplibre-gl, which is
// roughly a third of this app's JavaScript on its own, and three of the six
// admin roles cannot even see the section. Making every other screen wait for a
// map they will not open is the wrong trade; every other page stays eagerly
// imported because they are small and admins move between them constantly.
const Geography = lazy(() => import("@/pages/Geography"));
import Content from "@/pages/Content";
import Payments from "@/pages/Payments";
import Certificates from "@/pages/Certificates";
import Discounts from "@/pages/Discounts";
import Customers from "@/pages/Customers";
import LiveActivity from "@/pages/LiveActivity";
import SystemHealth from "@/pages/SystemHealth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Send each admin to the first section their role can actually see. */
function Landing() {
  const role = useAdminSession().identity?.role ?? null;
  const first =
    (
      [
        // Ordered by how much of an admin's day each section is likely to be,
        // so a role lands somewhere useful rather than on the first section
        // that happens to be alphabetically early. Phase-4 sections sit after
        // the established ones for the same reason.
        "products",
        "videos",
        "vendors",
        "ads",
        "subscriptions",
        "accounts",
        "chats",
        "chat-review",
        "chat-keywords",
        "chat-patterns",
        "chat-reasons",
        "faqs",
        "payments",
        "certificates",
        "discounts",
        "customers",
        "geography",
        "content",
        "reports",
        "traction",
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
                path="/videos"
                element={
                  <RequireSection section="videos">
                    <Videos />
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
                path="/faqs"
                element={
                  <RequireSection section="faqs">
                    <Faqs />
                  </RequireSection>
                }
              />
              {/* ── Phase-4 sections ──────────────────────────────────
                  Same RequireSection guard as every established route, keyed to
                  the sections added to roles.ts. The five dev-seed screens are
                  routed and gated NOW so Phase 2 only has to swap their data
                  source; the guard, the route and the nav entry are already in
                  place. */}
              <Route
                path="/geography"
                element={
                  <RequireSection section="geography">
                    {/* Shaped like the map it is about to replace, so the page
                        does not jump when the chunk lands. */}
                    <Suspense fallback={<SkeletonList rows={1} height="h-[28rem]" />}>
                      <Geography />
                    </Suspense>
                  </RequireSection>
                }
              />
              <Route
                path="/content"
                element={
                  <RequireSection section="content">
                    <Content />
                  </RequireSection>
                }
              />
              <Route
                path="/payments"
                element={
                  <RequireSection section="payments">
                    <Payments />
                  </RequireSection>
                }
              />
              <Route
                path="/certificates"
                element={
                  <RequireSection section="certificates">
                    <Certificates />
                  </RequireSection>
                }
              />
              <Route
                path="/discounts"
                element={
                  <RequireSection section="discounts">
                    <Discounts />
                  </RequireSection>
                }
              />
              <Route
                path="/customers"
                element={
                  <RequireSection section="customers">
                    <Customers />
                  </RequireSection>
                }
              />
              <Route
                path="/traction"
                element={
                  <RequireSection section="traction">
                    <LiveActivity />
                  </RequireSection>
                }
              />
              <Route
                path="/system-health"
                element={
                  <RequireSection section="system-health">
                    <SystemHealth />
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
              <Route
                path="/admin-log"
                element={
                  <RequireSection section="admin-log">
                    <AdminLog />
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
