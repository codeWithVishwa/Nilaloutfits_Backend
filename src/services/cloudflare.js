// Cloudflare cache hit-rate via the GraphQL Analytics API.
//   CLOUDFLARE_API_TOKEN  - token with Analytics:Read on the zone
//   CLOUDFLARE_ZONE_ID    - the zone (domain) tag
//   CLOUDFLARE_CACHE_WINDOW_HOURS (optional, default 24)
//
// The result is cached for 5 minutes and refreshed in the background, so the
// admin endpoint never blocks on Cloudflare's API or its rate limits.

const CACHE_TTL_MS = 5 * 60 * 1000;
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

let cached = null; // { hitRatePercent, cachedRequests, requests, windowHours, fetchedAt }
let cachedAt = 0;
let inFlight = null;

const isConfigured = () =>
  Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID);

const fetchFromCloudflare = async () => {
  const windowHours = Number(process.env.CLOUDFLARE_CACHE_WINDOW_HOURS || 24);
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const query = `
    query ($zoneTag: String!, $since: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1hGroups(
            limit: 168
            filter: { datetime_geq: $since }
            orderBy: [datetime_ASC]
          ) {
            sum { requests cachedRequests }
          }
        }
      }
    }`;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables: { zoneTag: process.env.CLOUDFLARE_ZONE_ID, since },
    }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'Cloudflare API error');
  }

  const groups = json?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || [];
  let requests = 0;
  let cachedRequests = 0;
  for (const group of groups) {
    requests += group?.sum?.requests || 0;
    cachedRequests += group?.sum?.cachedRequests || 0;
  }

  return {
    hitRatePercent: requests > 0 ? Number(((cachedRequests / requests) * 100).toFixed(1)) : null,
    cachedRequests,
    requests,
    windowHours,
    fetchedAt: new Date().toISOString(),
  };
};

// Returns immediately with the last known value; triggers a background refresh
// when stale. First-ever call returns { configured, loading } until data lands.
export const getCloudflareCacheStats = () => {
  if (!isConfigured()) {
    return { configured: false };
  }

  const isStale = Date.now() - cachedAt > CACHE_TTL_MS;
  if (isStale && !inFlight) {
    inFlight = fetchFromCloudflare()
      .then((data) => {
        cached = data;
        cachedAt = Date.now();
        return data;
      })
      .catch((error) => {
        cached = { ...(cached || {}), error: error.message };
        cachedAt = Date.now(); // back off on errors too, so we don't hammer CF
        return cached;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  if (cached) return { configured: true, ...cached };
  return { configured: true, loading: true };
};
