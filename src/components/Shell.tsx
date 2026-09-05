import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Ban,
  BarChart3,
  Boxes,
  Clapperboard,
  CreditCard,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Regex,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Store,
  X,
  UserCog,
} from "lucide-react";
import { useAdminSession } from "@/hooks/useAdminSession";
import { canSee, ROLE_LABELS, type Section } from "@/lib/roles";
import { cn, Logo } from "./ui";

interface NavItem {
  to: string;
  section: Section;
  label: string;
  icon: typeof Boxes;
}

/**
 * Two groups rather than one 11-item list. The eyebrow label is the same one
 * the rail already used for "Workspace" — a heading, not a new nav pattern.
 * A group whose items are all hidden by role renders nothing, heading included.
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { to: "/products", section: "products", label: "Products", icon: Boxes },
      { to: "/videos", section: "videos", label: "Video Closeups", icon: Clapperboard },
      { to: "/vendors", section: "vendors", label: "Vendors", icon: Store },
      { to: "/ads", section: "ads", label: "Ads", icon: Megaphone },
      { to: "/subscriptions", section: "subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/accounts", section: "accounts", label: "Accounts", icon: UserCog },
      { to: "/reports", section: "reports", label: "Reports", icon: BarChart3 },
      { to: "/admins", section: "admins", label: "Admins", icon: ShieldCheck },
    ],
  },
  {
    title: "Chat moderation",
    items: [
      { to: "/chats", section: "chats", label: "Chats", icon: MessagesSquare },
      { to: "/chat-review", section: "chat-review", label: "Review queue", icon: ShieldAlert },
      { to: "/chat-keywords", section: "chat-keywords", label: "Keyword blocklist", icon: Ban },
      { to: "/chat-patterns", section: "chat-patterns", label: "Flag patterns", icon: Regex },
      { to: "/chat-reasons", section: "chat-reasons", label: "Block reasons", icon: ScrollText },
    ],
  },
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
  const [open, setOpen] = useState(false);
  const role = identity?.role ?? null;
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => canSee(role, n.section)),
  })).filter((g) => g.items.length > 0);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock the page behind the drawer and allow Escape to dismiss it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Off-canvas backdrop (mobile / tablet only). */}
      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-ink/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Rail: a slide-in drawer below lg, a sticky column at lg and up. */}
      <aside
        className={cn(
          "warp rail-scroll fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto",
          "border-r border-rail-line bg-rail text-rail-fg shadow-pop transition-transform duration-300 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <Logo onDark />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="grid h-8 w-8 place-items-center rounded-lg text-rail-muted transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 px-3 pb-4">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-muted/70">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-lg py-2.5 pl-3.5 pr-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "text-rail-muted hover:bg-white/[0.04] hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Selvedge: the white ID thread marks the active seam. */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-full bg-white transition-all duration-200",
                            isActive ? "h-6 opacity-100" : "h-0 opacity-0",
                          )}
                          aria-hidden
                        />
                        <Icon
                          size={17}
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive ? "text-white" : "text-rail-muted group-hover:text-white",
                          )}
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
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
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-xs font-medium text-rail-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Content column: a mobile top bar, then the routed page. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/85 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <Menu size={18} />
          </button>
          <Logo />
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {/* Keyed on the route so each section eases in rather than snapping. */}
          <div key={location.pathname} className="animate-content-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
