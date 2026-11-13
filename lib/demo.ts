import { periods, sum, type Insights } from "./reporting";
export type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
};
export type Report = {
  source: string;
  accountName: string;
  customerId: string;
  currency: string;
  timeZone: string;
  fetchedAt: string;
  days: number;
  scopeLabel?: string;
  insights?: Insights;
  campaigns: Campaign[];
  daily: {
    date: string;
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
  }[];
};
export function demoReport(days: number): Report {
  const daily = Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 10, 8 - days + i)).toISOString().slice(0, 10),
    clicks: Math.round(63 + i * 2.4 + Math.sin(i * 1.9) * 20),
    cost: Math.round(17500 + i * 550 + Math.sin(i * 1.9) * 3200),
    conversions: Math.round(3 + i / 8 + Math.sin(i) * 2),
    impressions: Math.round(1650 + i * 60 + Math.cos(i) * 350),
  }));
  const t = daily.reduce(
    (a, d) => ({
      cost: a.cost + d.cost,
      clicks: a.clicks + d.clicks,
      impressions: a.impressions + d.impressions,
      conversions: a.conversions + d.conversions,
    }),
    { cost: 0, clicks: 0, impressions: 0, conversions: 0 },
  );
  const campaigns = [
    {
      id: "demo-1",
      name: "Búsqueda · Servicios principales",
      channel: "SEARCH",
      status: "ENABLED",
      share: 0.45,
    },
    {
      id: "demo-2",
      name: "Performance Max · Captación",
      channel: "PERFORMANCE_MAX",
      status: "ENABLED",
      share: 0.32,
    },
    {
      id: "demo-3",
      name: "Búsqueda · Marca",
      channel: "SEARCH",
      status: "ENABLED",
      share: 0.17,
    },
    {
      id: "demo-4",
      name: "Display · Remarketing",
      channel: "DISPLAY",
      status: "PAUSED",
      share: 0.06,
    },
  ].map((c) => ({
    ...c,
    cost: Math.round(t.cost * c.share),
    clicks: Math.round(t.clicks * c.share),
    impressions: Math.round(t.impressions * c.share),
    conversions: Math.round(t.conversions * c.share),
  }));
  const period = periods(
    days,
    "America/Santiago",
    new Date("2026-11-08T12:00:00Z"),
  );
  const totals = sum(daily);
  const part = (id: string, label: string, share: number) => ({
    id,
    label,
    cost: totals.cost * share,
    clicks: Math.round(totals.clicks * share),
    impressions: Math.round(totals.impressions * share),
    conversions: Math.round(totals.conversions * share),
  });
  const insights: Insights = {
    period,
    totals,
    previous: {
      cost: totals.cost * 0.9,
      clicks: Math.round(totals.clicks * 0.83),
      impressions: Math.round(totals.impressions * 0.9),
      conversions: Math.round(totals.conversions * 0.8),
    },
    monthCost: 178000,
    devices: [
      part("mobile", "Celulares", 0.7),
      part("desktop", "Computadores", 0.3),
    ],
    locations: [
      part("santiago", "Región Metropolitana, Chile", 0.8),
      part("valparaiso", "Valparaíso, Chile", 0.2),
    ],
    keywords: [part("key-1", "servicios para empresas", 0.6)],
    terms: [part("term-1", "cotizar servicios para empresas", 0.4)],
    ads: [
      {
        ...part(
          "ad-1",
          "Soluciones para tu empresa · Cotiza con nosotros",
          0.8,
        ),
        detail: "Búsqueda · Servicios principales",
      },
    ],
    conversions: [
      {
        id: "demo-form",
        name: "Formulario de contacto (ejemplo)",
        category: "SUBMIT_LEAD_FORM",
        status: "ENABLED",
        primary: true,
        conversions: totals.conversions,
        allConversions: totals.conversions,
      },
    ],
    unavailable: [],
  };
  return {
    insights,
    source: "demo",
    accountName: "Cuenta de demostración",
    customerId: "0000000000",
    currency: "CLP",
    timeZone: "America/Santiago",
    fetchedAt: "",
    days,
    campaigns,
    daily,
  };
}
