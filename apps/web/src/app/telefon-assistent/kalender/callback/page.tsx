import { redirect } from "next/navigation";
import { exchangeGoogleCode } from "../../actions";
import { card, page, styles } from "@/components/ui/table-classes";

type Props = {
  searchParams: Promise<{ code?: string; error?: string }>;
};

export default async function GoogleCalendarCallback({ searchParams }: Props) {
  const params = await searchParams;

  if (params.error) {
    return (
      <div className={page.narrow}>
        <div className={`${card.base} flex flex-col gap-3`} style={styles.panel}>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-danger)" }}>
            Verbindung fehlgeschlagen
          </h1>
          <p className="text-sm" style={styles.muted}>
            Google hat die Verbindung abgelehnt: {params.error}
          </p>
          <a
            href="/telefon-assistent/kalender"
            className="text-xs font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            &larr; Zurueck zur Kalender-Integration
          </a>
        </div>
      </div>
    );
  }

  if (!params.code) {
    redirect("/telefon-assistent/kalender");
  }

  const result = await exchangeGoogleCode(params.code);

  if (!result.ok) {
    return (
      <div className={page.narrow}>
        <div className={`${card.base} flex flex-col gap-3`} style={styles.panel}>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-danger)" }}>
            Fehler beim Verbinden
          </h1>
          <p className="text-sm" style={styles.muted}>
            {result.error}
          </p>
          <a
            href="/telefon-assistent/kalender"
            className="text-xs font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            &larr; Zurueck zur Kalender-Integration
          </a>
        </div>
      </div>
    );
  }

  redirect("/telefon-assistent/kalender");
}
