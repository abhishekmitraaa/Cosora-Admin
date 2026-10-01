import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { ROLE_LABELS, TEAM_ROLES, assignableRoles, type AdminRole } from "@/lib/roles";
import { registerStaff, resetStaffPassword, useStaffDirectory, type CredentialResult, type StaffRow } from "@/lib/staff";
import { Badge, Button, Empty, Field, Input, Notice, Panel, ROW_HOVER, Select, SkeletonList, Table } from "@/components/ui";

const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/**
 * "Register a staff member" (Andy, 2026-10-01). The panel generates the employee
 * ID, the work email (their sign-in) and a temporary password; the person gets the
 * password at their personal email and chooses their own at first sign-in.
 */
export function RegisterStaffPanel({ myRole }: { myRole: AdminRole | null }) {
  const qc = useQueryClient();
  const assignable = assignableRoles(myRole);
  const [fullName, setFullName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [result, setResult] = useState<{ name: string; r: CredentialResult } | null>(null);

  const register = useMutation({
    mutationFn: () => registerStaff({ fullName: fullName.trim(), personalEmail: personalEmail.trim(), phone, role }),
    onSuccess: (r) => {
      setResult({ name: fullName.trim(), r });
      setFullName("");
      setPersonalEmail("");
      setPhone("");
      void qc.invalidateQueries({ queryKey: ["staff-directory"] });
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => {
      setResult(null);
      toast.error(e.message, { duration: 12000 });
    },
  });

  return (
    <Panel
      title="Register a staff member"
      description={
        <>
          For people joining the Cosora team. The panel creates their employee ID and their work email, which is
          what they sign in with, and sends a temporary password to their personal email. They choose their own
          password when they first sign in.
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          register.mutate();
        }}
      >
        <Field label="Full name" htmlFor="staff-name">
          <Input
            id="staff-name"
            required
            autoComplete="off"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Asha Patel"
          />
        </Field>
        <Field label="Personal email" htmlFor="staff-email">
          <Input
            id="staff-email"
            type="email"
            required
            autoComplete="off"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            placeholder="asha@gmail.com"
          />
        </Field>
        <Field label="Mobile number" htmlFor="staff-phone">
          <Input
            id="staff-phone"
            type="tel"
            required
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
          />
        </Field>
        <Field label="Role" htmlFor="staff-role">
          <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button
            type="submit"
            variant="primary"
            disabled={register.isPending || !fullName.trim() || !personalEmail.trim() || !phone.trim()}
          >
            {register.isPending ? "Registering…" : "Register"}
          </Button>
        </div>
      </form>
      {result && <CredentialNotice name={result.name} r={result.r} kind="register" />}
    </Panel>
  );
}

/** The registered staff, with "Send a new temporary password". */
export function StaffDirectoryPanel({ myRole, myId }: { myRole: AdminRole | null; myId: string | undefined }) {
  const directory = useStaffDirectory(myRole === "super_admin" || myRole === "manager");
  const [result, setResult] = useState<{ name: string; r: CredentialResult } | null>(null);
  const qc = useQueryClient();

  const reset = useMutation({
    mutationFn: (row: StaffRow) => resetStaffPassword(row.user_id),
    onSuccess: (r, row) => {
      setResult({ name: row.full_name, r });
      void qc.invalidateQueries({ queryKey: ["staff-directory"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  return (
    <Panel
      title="Staff directory"
      description="Everyone registered here, with their employee ID and work email. Their work email has no mailbox yet, so “Forgot password” can't reach them: send a new temporary password from here instead."
    >
      {directory.isLoading ? (
        <SkeletonList rows={2} height="h-10" />
      ) : directory.error ? (
        <Notice tone="critical">Couldn't load the staff directory: {(directory.error as Error).message}</Notice>
      ) : (directory.data ?? []).length === 0 ? (
        <Empty>No one has been registered yet.</Empty>
      ) : (
        <Table head={["Employee", "Work email", "Personal contact", "Role", "Password", ""]}>
          {(directory.data ?? []).map((s) => {
            const isSelf = s.user_id === myId;
            // A manager resets teammates in the team roles only; the function refuses the rest too.
            const managerBlocked =
              myRole === "manager" && s.is_active && s.admin_role !== null && !TEAM_ROLES.includes(s.admin_role);
            return (
              <tr key={s.user_id} className={ROW_HOVER}>
                <td className="px-3 py-2">
                  <div className="text-ink">{s.full_name}</div>
                  <div className="font-mono text-xs text-ink-faint">{s.employee_id}</div>
                </td>
                <td className="px-3 py-2 text-ink-muted">{s.work_email}</td>
                <td className="px-3 py-2 text-xs text-ink-muted">
                  <div>{s.personal_email}</div>
                  <div>{s.phone}</div>
                </td>
                <td className="px-3 py-2">
                  {s.is_active && s.admin_role ? (
                    <Badge tone="info">{ROLE_LABELS[s.admin_role]}</Badge>
                  ) : (
                    <Badge tone="neutral">No access</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-muted">
                  {s.password_changed_at ? (
                    <>Their own, since {DATE.format(new Date(s.password_changed_at))}</>
                  ) : s.temp_password_issued_at ? (
                    <Badge tone="caution">Temporary, not yet changed</Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    disabled={isSelf || managerBlocked || reset.isPending}
                    title={
                      isSelf
                        ? "Ask another manager or a super admin"
                        : managerBlocked
                          ? "Only a super admin can reset a super admin's or manager's password"
                          : undefined
                    }
                    onClick={() => {
                      if (confirm(`Send ${s.full_name} a new temporary password? Their current password stops working.`)) {
                        setResult(null);
                        reset.mutate(s);
                      }
                    }}
                  >
                    <KeyRound size={13} /> New temporary password
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {result && <CredentialNotice name={result.name} r={result.r} kind="reset" />}
    </Panel>
  );
}

/**
 * Says what happened to the credential, keyed on `delivery`. When the email didn't
 * go, the password is shown here once: it isn't stored anywhere, so closing or
 * reloading the page loses it (send a new one then).
 */
function CredentialNotice({ name, r, kind }: { name: string; r: CredentialResult; kind: "register" | "reset" }) {
  const done = kind === "register" ? `${name} is registered.` : `${name} has a new temporary password.`;
  const ids = (
    <p className="mt-1 text-xs">
      Employee ID <span className="font-mono font-medium">{r.employee_id}</span> · signs in as{" "}
      <span className="font-medium">{r.work_email}</span>
    </p>
  );

  if (r.delivery === "email") {
    return (
      <Notice tone="positive" className="mt-4" icon={<Mail size={14} />} title={done}>
        {ids}
        <p className="mt-1 text-xs">The temporary password was emailed to {r.sent_to}.</p>
      </Notice>
    );
  }

  return (
    <Notice
      tone="caution"
      className="mt-4"
      icon={<TriangleAlert size={14} />}
      title={`${done} The email didn't go, so give them the password yourself.`}
    >
      {ids}
      <p className="mt-1 text-xs">
        {r.email_configured
          ? `The email couldn't be sent: ${r.email_problem ?? "unknown error"}.`
          : "Email isn't set up yet (Resend, ToDo.md)."}{" "}
        It's shown here once and isn't kept anywhere. They'll choose their own when they first sign in.
      </p>
      {r.temporary_password && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-surface px-2 py-1 font-mono text-sm text-ink ring-1 ring-inset ring-line">
            {r.temporary_password}
          </code>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(r.temporary_password ?? "").then(
                () => toast.success("Copied"),
                () => toast.error("Couldn't copy. Select it and copy by hand."),
              );
            }}
          >
            <Copy size={13} /> Copy
          </Button>
        </div>
      )}
    </Notice>
  );
}
