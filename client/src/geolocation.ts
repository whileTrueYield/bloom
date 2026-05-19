// Thin wrapper over the browser Geolocation API that always resolves —
// never rejects — so callers can write a single straight-line code path
// regardless of whether the user has granted permission, the device has GPS,
// or the lookup timed out. A null result is the universal "no geo" signal.

export interface CapturedGeo {
  lat: number;
  lon: number;
  accuracy_m: number;
}

export async function getCurrentGeo(): Promise<CapturedGeo | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}
