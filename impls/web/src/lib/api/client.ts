import "server-only";
import createClient from "openapi-fetch";
import type { paths } from "./schema";

export function api() {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) throw new Error("API_URL is not set");
  return createClient<paths>({ baseUrl, cache: "no-store" });
}
