import { LinksTable } from "@/components/links-table";
import { ShortenForm } from "@/components/shorten-form";
import { listNewestLinks } from "@/lib/api/links";
import { formatCreated } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const links = await listNewestLinks();
  const rows = links.map((l) => ({
    code: l.code,
    shortUrl: l.shortUrl,
    url: l.url,
    clickCount: l.clickCount,
    created: formatCreated(l.createdAt),
  }));
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Shortlink</h1>
      <ShortenForm />
      <LinksTable rows={rows} />
    </>
  );
}
