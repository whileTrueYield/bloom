// React hook bridging window.location.hash to a Route value.
//
// Why the hash and not the path: a hash change pushes to the browser history
// automatically and fires `hashchange`, so browser back/forward works for free
// without any router library. The URL stays clean (`localhost:5173/#note/…` or
// `…/#daily/2026-05-20/b/3`) and survives reload.

import { useCallback, useEffect, useState } from "react";
import { formatRoute, parseRoute, type Route } from "./route";

function readHash(): Route {
  if (typeof window === "undefined") return { kind: "none" };
  return parseRoute(window.location.hash);
}

export function useRoute(): readonly [Route, (next: Route) => void] {
  const [route, setLocalRoute] = useState<Route>(readHash);

  useEffect(() => {
    const sync = () => setLocalRoute(readHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const setRoute = useCallback((next: Route) => {
    const newHash = formatRoute(next);
    if (window.location.hash !== newHash) {
      // Setting hash auto-pushes to history. We rely on the `hashchange`
      // listener above to keep React state in sync rather than calling
      // setLocalRoute directly — single source of truth.
      window.location.hash = newHash;
    }
  }, []);

  return [route, setRoute] as const;
}
