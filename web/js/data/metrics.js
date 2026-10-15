/** Indexes the published example embedded in the standalone reference. */
export function createMetricsRepository(payload) {
  return {
    bird: payload.bird,
    byScope: new Map(payload.rows.map((row) => [row[1], row])),
    regionById: new Map(payload.regions.map((region) => [region.id, region])),
    regionMonth: payload.scopes,
  };
}
