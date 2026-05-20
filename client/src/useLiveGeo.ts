// Live geo accuracy for the status bar. watchPosition gives us continuous
// updates without polling; the hook resolves to null when the device has no
// GPS or the user hasn't granted permission. The handler intentionally
// swallows errors — a degraded geo signal should never break the editor.

import { useEffect, useState } from "react";

export interface LiveGeo {
  lat: number;
  lon: number;
  accuracy_m: number;
}

export function useLiveGeo(): LiveGeo | null {
  const [geo, setGeo] = useState<LiveGeo | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) =>
        setGeo({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }),
      () => setGeo(null),
      { maximumAge: 30_000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return geo;
}
