import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AdminSessionProvider, useAdminSession } from "@/hooks/useAdminSession";
import { RequireAdmin, RequireSection } from "@/components/Guard";
import Shell from "@/components/Shell";
import { canSee } from "@/lib/roles";

import Login from "@/pages/Login";
import Products from "@/pages/Products";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Ads from "@/pages/Ads";
import Subscriptions from "@/pages/Subscriptions";
import Reports from "@/pages/Reports";
import Admins from "@/pages/Admins";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Send each admin to the first section their role can actually see. */
function Landing() {
  const role = useAdminSession().identity?.role ?? null;
  const first =
    (["products", "vendors", "ads", "subscriptions", "reports", "admins"] as const).find((s) =>
      canSee(role, s),
    ) ?? "reports";
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
