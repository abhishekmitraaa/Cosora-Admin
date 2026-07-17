import { NavLink, Outlet } from "react-router-dom";
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
import { cn } from "./ui";

const NAV: { to: string; section: Section; label: string; icon: typeof Boxes }[] = [
  { to: "/products", section: "products", label: "Products", icon: Boxes },
  { to: "/vendors", section: "vendors", label: "Vendors", icon: Store },
  { to: "/ads", section: "ads", label: "Ads", icon: Megaphone },
  { to: "/subscriptions", section: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/reports", section: "reports", label: "Reports", icon: BarChart3 },
  { to: "/admins", section: "admins", label: "Admins", icon: ShieldCheck },
];

export default function Shell() {
  const { identity, signOut } = useAdminSession();
  const role = identity?.role ?? null;
  const visible = NAV.filter((n) => canSee(role, n.section));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">Cosora Admin</div>
          <div className="mt-0.5 text-xs text-slate-500">Internal tool</div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {visible.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition",
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="truncate text-xs font-medium text-slate-800">
            {identity?.fullName || identity?.email}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {role ? ROLE_LABELS[role] : "No role assigned"}
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden p-6">
        <Outlet />
      </main>
    </div>
  );
}
