/**
 * Turns free-text location input (e.g. "New York, USA") into approximate
 * coordinates, using OpenStreetMap's free Nominatim search API — no API key
 * needed. Used once per new post so the map can auto-place a pin.
 * https://nominatim.org/release-docs/latest/api/Search/
 *
 * Nominatim's usage policy requires a real identifying User-Agent and caps
 * usage at ~1 request/second — both are fine here since this only runs
 * once per story submission, not per page view.
 */
export async function geocodeLocation(query) {
  if (!query || !query.trim()) return null;

  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query.trim());

    const res = await fetch(url, {
      headers: {
        "User-Agent": "EveryBlockHasAStory/1.0 (https://everyblockhasastory.com)",
        "Accept-Language": "en",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    // Geocoding is best-effort — a failed lookup should never block a post.
    return null;
  }
}
