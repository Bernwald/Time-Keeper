import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/db/queries/organization";
import Link from "next/link";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/kunden", label: "Kunden" },
  { href: "/admin/integrationen", label: "Integrationen" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Administration
        </h1>
        <nav className="flex gap-1">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-[36px] px-4 rounded-lg text-sm font-medium flex items-center"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
