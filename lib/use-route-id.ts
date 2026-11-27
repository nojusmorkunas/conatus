"use client";

import { usePathname } from "next/navigation";

/**
 * The id in /projects/<id>, /filters/<id> and /labels/<id>. It comes from the address because useParams
 * reads the route tree the server rendered, which for a page cached for another URL names that other id.
 */
export function useRouteId() {
  const id = usePathname().split("/")[2] ?? "";
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
