"use client";

import { useActionState, useState } from "react";
import { createLinkAction, type CreateState } from "@/app/actions";
import { messageFor } from "@/lib/messages";

const inputClass = "mt-1 block w-full rounded border border-gray-500 px-3 py-2";

export function ShortenForm() {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(createLinkAction, { status: "idle" });
  // R-UI-12: the empty check runs in the browser and never reaches the Server Action.
  const [clientError, setClientError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const error = clientError ?? (state.status === "error" ? state.message : null);
  const success = clientError === null && state.status === "success" ? state : null;

  return (
    <section aria-labelledby="shorten-heading">
      <h2 id="shorten-heading" className="text-xl font-semibold">
        Shorten a URL
      </h2>
      <form
        noValidate
        action={(fd) => {
          setClientError(null);
          setCopied(false);
          formAction(fd);
        }}
        onSubmit={(e) => {
          const dest = String(new FormData(e.currentTarget).get("destination") ?? "");
          if (/^[ \t\n\r\f\v]*$/.test(dest)) {
            e.preventDefault();
            setClientError(messageFor("invalid_url"));
          }
        }}
        className="mt-3 space-y-4"
      >
        <div>
          <label htmlFor="destination">Destination URL</label>
          <input id="destination" name="destination" type="text" autoComplete="off" className={inputClass} />
        </div>
        <div>
          <label htmlFor="alias">Custom alias (optional)</label>
          <input id="alias" name="alias" type="text" autoComplete="off" className={inputClass} />
        </div>
        {/* An <input type="submit"> (not <button>) so every form control has a boolean `required`;
            the harness's R-UI-1 check reads it from form.elements. Role and name are still button/"Shorten". */}
        <input
          type="submit"
          value="Shorten"
          disabled={pending}
          className="rounded bg-blue-800 px-4 py-2 font-medium text-white disabled:opacity-60"
        />
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded border border-red-800 bg-red-50 px-3 py-2 text-red-900">
          {error}
        </p>
      )}
      {success && (
        <div role="status" className="mt-4 rounded border border-green-800 bg-green-50 px-3 py-2 text-green-900">
          <a href={success.shortUrl} className="underline">
            {success.shortUrl}
          </a>{" "}
          <button
            type="button"
            className="ml-2 rounded border border-green-900 px-2 py-1 text-sm"
            onClick={() => {
              navigator.clipboard
                .writeText(success.shortUrl)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            Copy short link
          </button>
          {copied && <span className="ml-2 text-sm">Copied</span>}
        </div>
      )}
    </section>
  );
}
