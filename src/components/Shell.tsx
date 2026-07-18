import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Boxes,
  Store,
  Megaphone,
  CreditCard,
  BarChart3,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useAdminSession } from "@/hooks/useAdminSession";
import { canSee, ROLE_LABELS, type Section } from "@/lib/roles";
import { cn, Logo } from "./ui";

const NAV: { to: string; section: Section; label: string; icon: typeof Boxes }[] = [
  { to: "/products", section: "products", label: "Products", icon: Boxes },
  { to: "/vendors", section: "vendors", label: "Vendors", icon: Store },
  { to: "/ads", section: "ads", label: "Ads", icon: Megaphone },
  { to: "/subscriptions", section: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/reports", section: "reports", label: "Reports", icon: BarChart3 },
  { to: "/admins", section: "admins", label: "Admins", icon: ShieldCheck },
];

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Shell() {
  const { identity, signOut } = useAdminSession();
  const location = useLocation();
  const role = identity?.role ?? null;
  const visible = NAV.filter((n) => canSee(role, n.section));

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="warp rail-scroll sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-rail-line bg-rail text-rail-fg">
        <div className="px-4 py-5">
          <Logo onDark />
        </div>

        <nav className="flex-1 px-3 pb-4">
          <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-muted/70">
            Workspace
          </div>
          <div className="space-y-0.5">
            {visible.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-2.5 rounded-lg py-2 pl-3.5 pr-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-rail-muted hover:bg-white/[0.04] hover:text-white",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Selvedge: the marigold ID thread marks the active seam. */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-full bg-marigold transition-all duration-200",
                        isActive ? "h-6 opacity-100" : "h-0 opacity-0",
                      )}
                      aria-hidden
                    />
                    <Icon
                      size={17}
                      className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-marigold" : "text-rail-muted group-hover:text-white",
                      )}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-rail-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] font-display text-xs font-bold text-white ring-1 ring-white/10"
              aria-hidden
            >
              {initials(identity?.fullName ?? null, identity?.email ?? null)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">
                {identity?.fullName || identity?.email}
              </div>
              <div className="truncate text-[11px] text-rail-muted">
                {role ? ROLE_LABELS[role] : "No role assigned"}
              </div>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rail-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8 md:px-10 md:py-10">
        {/* Keyed on the route so each section eases in rather than snapping. */}
        <div key={location.pathname} className="animate-content-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
