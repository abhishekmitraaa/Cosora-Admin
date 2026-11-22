import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useRole } from "@/hooks/useAdminSession";
import { canSee, type Section } from "@/lib/roles";

/**
 * A link to another section, shown as a link only to roles that can open that section, and as plain text otherwise
 * (review AR-M41, 2026-11-22): Leads and Premises photos linked support and finance to Accounts and vendor pages
 * that then said "Section not available for your role".
 */
export function RoleLink({
  section,
  to,
  className,
  title,
  children,
}: {
  section: Section;
  to: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const role = useRole();
  if (!canSee(role, section)) return <span className={className?.replace(/hover:underline|underline-offset-2/g, "").trim()}>{children}</span>;
  return (
    <Link to={to} className={className} title={title}>
      {children}
    </Link>
  );
}
