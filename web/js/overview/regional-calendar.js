/** Pure queries: regional roles, relative profiles and the published presence mask. */
import { AUSTRAL } from "../shared/calendar.js";
import { REGIONAL_EXAMPLES, COMPARISON_REGIONS } from "./regional-examples.js";

export function queryRegionalCalendar(data, state) {
  const example = REGIONAL_EXAMPLES.find(
    (item) => item.sciName === state.species,
  );
  const bird = data.speciesByName.get(example.sciName);
  if (!bird) throw new Error(`Missing regional example: ${example.sciName}`);
  const profiles = data.bySpecies.get(bird.id);
  const regions = data.regions
    .filter((region) => region.id !== 0)
    .sort((a, b) => b.lat - a.lat);
  return {
    bird,
    reading: example.reading,
    choices: REGIONAL_EXAMPLES,
    allRegions: state.allRegions,
    regionCount: regions.length,
    photo: example.photo ?? null,
    rows: regions
      .filter(
        (region) => state.allRegions || COMPARISON_REGIONS.includes(region.id),
      )
      .map((region) => {
        const row = profiles?.get(region.id);
        return {
          region,
          cls: row ? row[2] : null,
          cells: AUSTRAL.map((month) => ({
            month,
            profile: row ? row[19 + month] : null,
            years: row ? row[31 + month] : null,
            present: row ? !!(row[6] & (1 << month)) : false,
          })),
        };
      }),
  };
}
