import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  Ban,
  BarChart3,
  Boxes,
  ChevronRight,
  Clapperboard,
  CreditCard,
  Award,
  LogOut,
  Map,
  Megaphone,
  Menu,
  MessagesSquare,
  Palette,
  Receipt,
  Regex,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tags,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAdminSession } from "@/hooks/useAdminSession";
import { canSee, ROLE_LABELS, type Section } from "@/lib/roles";
import { cn, Logo, ThemeToggle } from "./ui";

interface NavItem {
  to: string;
  section: Section;
  label: string;
  icon: typeof Boxes;
}

/**
 * NAVIGATION STRUCTURE
 *
 * This rail carried 13 items in two groups ("Workspace" and "Chat moderation")
 * and the Phase-4 sections take it to 20. Twenty flat items is a scroll, and a
 * scrolling nav is one where the thing you want is never where you left it. So
 * the rail is five groups of four or five, collapsible, with the group holding
 * the current route forced open.
 *
 * WHAT DELIBERATELY DID NOT CHANGE: every `to` and every `label`. Routes are
 * bookmarked and labels are muscle memory, so only the grouping is new. Ads and
 * Chats moved out of the old catch-all "Workspace" group into Moderation
 * because that is what they are; nothing about either page moved with them.
 *
 * A group whose items are all hidden by role renders nothing, heading included.
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Moderation",
    items: [
      { to: "/products", section: "products", label: "Products", icon: Boxes },
      { to: "/videos", section: "videos", label: "Video Closeups", icon: Clapperboard },
      { to: "/ads", section: "ads", label: "Ads", icon: Megaphone },
      { to: "/chat-review", section: "chat-review", label: "Review queue", icon: ShieldAlert },
      { to: "/chats", section: "chats", label: "Chats", icon: MessagesSquare },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/vendors", section: "vendors", label: "Vendors", icon: Store },
      { to: "/accounts", section: "accounts", label: "Accounts", icon: UserCog },
      { to: "/customers", section: "customers", label: "Customers", icon: Users },
      { to: "/geography", section: "geography", label: "Geography", icon: Map },
    ],
  },
  {
    title: "Commerce",
    items: [
      { to: "/subscriptions", section: "subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/payments", section: "payments", label: "Payments", icon: Receipt },
      { to: "/discounts", section: "discounts", label: "Discounts", icon: Tags },
      { to: "/certificates", section: "certificates", label: "Certificates", icon: Award },
    ],
  },
  {
    title: "Insight",
    items: [
      { to: "/reports", section: "reports", label: "Reports", icon: BarChart3 },
      { to: "/traction", section: "traction", label: "Live Activity", icon: Activity },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/content", section: "content", label: "Site content", icon: Palette },
      { to: "/chat-keywords", section: "chat-keywords", label: "Keyword blocklist", icon: Ban },
      { to: "/chat-patterns", section: "chat-patterns", label: "Flag patterns", icon: Regex },
      { to: "/chat-reasons", section: "chat-reasons", label: "Block reasons", icon: ScrollText },
      { to: "/admins", section: "admins", label: "Admins", icon: ShieldCheck },
    ],
  },
];

const COLLAPSE_KEY = "cosora-admin-nav-collapsed";

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

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
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const role = identity?.role ?? null;

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((n) => canSee(role, n.section)),
      })).filter((g) => g.items.length > 0),
    [role],
  );

  // The group holding the current route is always expanded, whatever the stored
  // preference says. Collapsing the group you are standing in would hide the
  // one item that tells you where you are.
  const activeGroup = groups.find((g) =>
    g.items.some((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`)),
  )?.title;

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // Preference is not persisted; the session still honours it.
      }
      return next;
    });
  }

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
    <div className="min-h-[100dvh] bg-canvas lg:flex">
      {/* Off-canvas backdrop (mobile / tablet only). */}
      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-canvas/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Rail: a slide-in drawer below lg, a sticky column at lg and up. */}
      <aside
        className={cn(
          "warp rail-scroll fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto",
          "border-r border-rail-line bg-rail text-rail-fg shadow-pop transition-transform duration-300 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-[100dvh] lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <Logo onDark />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="grid h-8 w-8 place-items-center rounded-lg text-rail-muted transition-colors hover:bg-white/10 hover:text-rail-fg lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">
          {groups.map((group) => {
            const isActiveGroup = group.title === activeGroup;
            const isOpen = isActiveGroup || !collapsed.includes(group.title);
            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider transition-colors",
                    "text-rail-muted hover:bg-white/[0.04] hover:text-rail-fg",
                  )}
                >
                  <ChevronRight
                    size={12}
                    className={cn("shrink-0 transition-transform duration-200", isOpen && "rotate-90")}
                    aria-hidden
                  />
                  {group.title}
                </button>

                {isOpen && (
                  <div className="mt-0.5 space-y-0.5 pb-1.5">
                    {group.items.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex items-center gap-2.5 rounded-lg py-2 pl-3.5 pr-2.5 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-white/[0.09] text-rail-fg"
                              : "text-rail-muted hover:bg-white/[0.04] hover:text-rail-fg",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Selvedge: the white ID thread marks the active seam. */}
                            <span
                              className={cn(
                                "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-sm bg-rail-fg transition-all duration-200",
                                isActive ? "h-5 opacity-100" : "h-0 opacity-0",
                              )}
                              aria-hidden
                            />
                            <Icon size={16} className="shrink-0" />
                            {label}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-rail-line p-3">
          <ThemeToggle onRail />
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] font-display text-xs font-bold text-rail-fg ring-1 ring-white/10"
              aria-hidden
            >
              {initials(identity?.fullName ?? null, identity?.email ?? null)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-rail-fg">
                {identity?.fullName || identity?.email}
              </div>
              <div className="truncate text-2xs text-rail-muted">
                {role ? ROLE_LABELS[role] : "No role assigned"}
              </div>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rail-muted transition-colors hover:bg-white/[0.04] hover:text-rail-fg"
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
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Menu size={18} />
          </button>
          <Logo />
          <div className="ml-auto w-24">
            <ThemeToggle />
          </div>
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
