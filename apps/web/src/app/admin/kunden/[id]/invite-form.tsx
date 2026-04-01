"use client";

import { useRef, useTransition } from "react";
import { inviteMember } from "../../actions";

export function InviteForm({ orgId }: { orgId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const inviteAction = inviteMember.bind(null, orgId);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await inviteAction(formData);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex gap-2">
      <input
        name="email"
        type="email"
        required
        placeholder="email@beispiel.de"
        className="flex-1 min-h-[44px] px-3 rounded-lg text-sm"
        style={{
          border: "1px solid var(--color-line)",
          background: "var(--color-bg)",
          color: "var(--color-text)",
        }}
      />
      <select
        name="role"
        defaultValue="member"
        className="min-h-[44px] px-3 rounded-lg text-sm"
        style={{
          border: "1px solid var(--color-line)",
          background: "var(--color-bg)",
          color: "var(--color-text)",
        }}
      >
        <option value="member">Mitglied</option>
        <option value="owner">Inhaber</option>
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="min-h-[44px] min-w-[44px] px-4 rounded-lg text-sm font-medium gradient-accent"
        style={{ color: "var(--color-accent-text)", opacity: isPending ? 0.6 : 1 }}
      >
        {isPending ? "..." : "Einladen"}
      </button>
    </form>
  );
}
