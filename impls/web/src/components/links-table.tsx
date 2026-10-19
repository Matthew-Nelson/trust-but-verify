"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteLinkAction } from "@/app/actions";

export type Row = { code: string; shortUrl: string; url: string; clickCount: number; created: string };

export function LinksTable({ rows }: { rows: Row[] }) {
  // One piece of state for the whole table, so at most one confirmation is open (R-UI-6).
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete(code: string) {
    startTransition(async () => {
      await deleteLinkAction(code);
      setOpen(null);
    });
  }

  return (
    <section aria-labelledby="links-heading" className="mt-10">
      <h2 id="links-heading" className="text-xl font-semibold">
        Your links
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table aria-labelledby="links-heading" className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-gray-700">
              <th className="p-2">Short link</th>
              <th className="p-2">Destination</th>
              <th className="p-2">Clicks</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-gray-300 align-top">
                <td className="p-2">
                  <a href={r.shortUrl} className="text-blue-800 underline">
                    {r.shortUrl}
                  </a>
                </td>
                <td className="p-2 break-all">{r.url}</td>
                <td className="p-2">{r.clickCount}</td>
                <td className="p-2 whitespace-nowrap">{r.created}</td>
                <td className="p-2 whitespace-nowrap">
                  <Link
                    href={`/links/${encodeURIComponent(r.code)}`}
                    className="text-blue-800 underline"
                  >
                    Stats for {r.code}
                  </Link>{" "}
                  <button
                    type="button"
                    onClick={() => setOpen(r.code)}
                    className="ml-2 rounded border border-gray-700 px-2 py-1"
                  >
                    Delete {r.code}
                  </button>
                  {open === r.code && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirmDelete(r.code)}
                      className="ml-2 rounded bg-red-800 px-2 py-1 text-white disabled:opacity-60"
                    >
                      Confirm delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-2 text-gray-700">No links yet.</p>}
    </section>
  );
}
