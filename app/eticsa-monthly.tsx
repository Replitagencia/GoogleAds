"use client";
import { useEffect, useState } from "react";
import type { Report } from "@/lib/demo";
import styles from "./eticsa-monthly.module.css";

type History = NonNullable<Report["monthlyHistory"]>;
const number = new Intl.NumberFormat("es-CL");
const month = new Intl.DateTimeFormat("es-CL", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const date = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default function EticsaMonthly({ clientId }: { clientId: string }) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          "/api/report/eticsa?view=monthly&clientId=" +
            encodeURIComponent(clientId),
          { signal: controller.signal },
        );
        if (!response.ok) throw Error();
        const { monthlyHistory } = await response.json();
        if (monthlyHistory?.status !== "available") throw Error();
        setData(monthlyHistory);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    setError(false);
    setData(null);
    void load();
    return () => controller.abort();
  }, [clientId, attempt]);

  return (
    <section className={styles.history} aria-labelledby="monthly-heading">
      <h2 id="monthly-heading">Impresiones y clics por mes</h2>
      <p>Histórico de 13 meses · Búsqueda + Pmax Eticsa</p>
      {error ? (
        <div role="status">
          No se pudo consultar el histórico.{" "}
          <button
            className="button secondary"
            onClick={() => retry(attempt + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <p role="status">Consultando el histórico de Google Ads…</p>
      ) : (
        <>
          <p>
            Del {date.format(new Date(data.start))} al{" "}
            {date.format(new Date(data.end))}. El asterisco indica el mes en
            curso.
          </p>
          <div className={styles.charts}>
            {(["impressions", "clicks"] as const).map((key) => {
              const values = data.months.flatMap((row) =>
                row[key] === null ? [] : [row[key]],
              );
              const max = Math.max(1, ...values);
              return (
                <div className={styles.card} key={key}>
                  <h3>
                    {key === "impressions" ? "Impresiones" : "Clics"}{" "}
                    <span>
                      Total registrado ·{" "}
                      {values.length
                        ? number.format(values.reduce((a, b) => a + b, 0))
                        : "—"}
                    </span>
                  </h3>
                  <ol className={styles.chart}>
                    {data.months.map((row) => {
                      const value = row[key];
                      const current =
                        row.month === data.currentMonth.slice(0, 7);
                      return (
                        <li
                          key={row.month}
                          className={styles.column}
                          data-current={current}
                        >
                          <span className={styles.label}>
                            {month
                              .format(new Date(row.month + "-01"))
                              .replace(" de ", " ")}
                            {current && "*"}
                          </span>
                          <div className={styles.track}>
                            <div
                              className={styles.bar}
                              style={
                                {
                                  "--size": ((value ?? 0) / max) * 100 + "%",
                                } as React.CSSProperties
                              }
                            />
                          </div>
                          <strong className={styles.value}>
                            {value === null ? (
                              <abbr title="Sin registros">—</abbr>
                            ) : (
                              number.format(value)
                            )}
                          </strong>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
