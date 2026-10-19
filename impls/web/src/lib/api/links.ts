import "server-only";
import { notFound } from "next/navigation";
import type { components } from "./schema";
import { api } from "./client";

export type Link = components["schemas"]["Link"];
export type LinkStats = components["schemas"]["LinkStats"];

export type CreateResult =
  | { ok: true; link: Link }
  | { ok: false; errorCode: string | undefined };

export async function createLink(url: string, alias?: string): Promise<CreateResult> {
  try {
    const { data, error } = await api().POST("/api/links", {
      body: alias ? { url, alias } : { url },
    });
    if (data) return { ok: true, link: data };
    return { ok: false, errorCode: error?.error?.code };
  } catch {
    return { ok: false, errorCode: undefined };
  }
}

export async function listNewestLinks(): Promise<Link[]> {
  const { data } = await api().GET("/api/links", { params: { query: { limit: 20 } } });
  if (!data) throw new Error("could not list links");
  return data.items;
}

/** Returns the stats, or calls notFound() for an unknown code. */
export async function getStatsOrNotFound(code: string, days: number): Promise<LinkStats> {
  const { data, response } = await api().GET("/api/links/{code}/stats", {
    params: { path: { code }, query: { days } },
  });
  if (response.status === 404) notFound();
  if (!data) throw new Error("could not load stats");
  return data;
}

/** A 404 counts as success: the link is already gone. */
export async function deleteLink(code: string): Promise<boolean> {
  const { response } = await api().DELETE("/api/links/{code}", { params: { path: { code } } });
  return response.status === 204 || response.status === 404;
}
