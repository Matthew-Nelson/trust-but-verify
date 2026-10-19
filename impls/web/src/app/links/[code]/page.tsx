import Link from "next/link";
import { getStatsOrNotFound } from "@/lib/api/links";

export const dynamic = "force-dynamic";

const PRESETS = [7, 30, 90];

/** R-UI-8: a plain integer 1..365 (no sign, no leading zero, no repeats); anything else is 30. */
function parseDays(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,2}$/.test(raw)) return 30;
  const n = Number(raw);
  return n >= 1 && n <= 365 ? n : 30;
}

function StatTable({ title, nameHeader, rows }: { title: string; nameHeader: string; rows: { name: string; clicks: number }[] }) {
  const id = `t-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="mt-8">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <table aria-labelledby={id} className="mt-2 w-full max-w-md border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-gray-700">
            <th className="p-2">{nameHeader}</th>
            <th className="p-2">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-gray-300">
              <td className="p-2">{r.name}</td>
              <td className="p-2">{r.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-2 text-gray-700">No data.</p>}
    </section>
  );
}

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const { code } = await params;
  const days = parseDays((await searchParams).days);
  const stats = await getStatsOrNotFound(code, days);
  const base = `/links/${encodeURIComponent(code)}`;

  return (
    <>
      <p>
        <Link href="/" className="text-blue-800 underline">
          Back to all links
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-bold">Stats for {code}</h1>
      <p className="mt-4">Total clicks: {stats.totalClicks}</p>
      <p>Clicks in range: {stats.rangeClicks}</p>

      <nav aria-label="Date range" className="mt-4 flex gap-4">
        {PRESETS.map((n) => (
          <Link
            key={n}
            href={`${base}?days=${n}`}
            aria-current={n === days ? "page" : undefined}
            className="text-blue-800 underline aria-[current=page]:font-bold aria-[current=page]:text-gray-900"
          >
            {n} days
          </Link>
        ))}
      </nav>

      <StatTable
        title="Clicks per day"
        nameHeader="Date"
        rows={stats.daily.map((d) => ({ name: d.date, clicks: d.clicks }))}
      />
      <StatTable title="Top referrers" nameHeader="Name" rows={stats.topReferrers} />
      <StatTable title="Top countries" nameHeader="Name" rows={stats.topCountries} />
      <StatTable title="Devices" nameHeader="Name" rows={stats.devices} />
    </>
  );
}
