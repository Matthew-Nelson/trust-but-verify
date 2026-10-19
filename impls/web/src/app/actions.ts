"use server";

import { revalidatePath } from "next/cache";
import { createLink, deleteLink } from "@/lib/api/links";
import { messageFor } from "@/lib/messages";
import { normalizeDestination, trimAscii } from "@/lib/normalize";

export type CreateState =
  | { status: "idle" }
  | { status: "success"; shortUrl: string; nonce: number }
  | { status: "error"; message: string; nonce: number };

export async function createLinkAction(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const nonce = Date.now();
  const destination = trimAscii(String(formData.get("destination") ?? ""));
  const alias = trimAscii(String(formData.get("alias") ?? ""));

  if (destination === "") return { status: "error", message: messageFor("invalid_url"), nonce };

  const result = await createLink(normalizeDestination(destination), alias || undefined);
  if (!result.ok) return { status: "error", message: messageFor(result.errorCode), nonce };

  revalidatePath("/");
  return { status: "success", shortUrl: result.link.shortUrl, nonce };
}

export async function deleteLinkAction(code: string): Promise<{ ok: boolean }> {
  const ok = await deleteLink(code);
  if (ok) revalidatePath("/");
  return { ok };
}
