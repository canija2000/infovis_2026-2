/** Load and index the existing regional profiles, without deriving display rules. */
export function createRegionalCalendarRepository({ meta, species, typical }) {
  const speciesByName = new Map(species.map((bird) => [bird.sciName, bird]));
  const bySpecies = new Map();
  for (const row of typical.rows) {
    if (!bySpecies.has(row[0])) bySpecies.set(row[0], new Map());
    bySpecies.get(row[0]).set(row[1], row);
  }
  return { regions: meta.regions, speciesByName, bySpecies };
}

export async function loadRegionalCalendar() {
  const [meta, species, typical] = await Promise.all(
    ["meta.json", "species.json", "typical_year.json"].map(async (file) => {
      const response = await fetch(`data/${file}`);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return response.json();
    }),
  );
  return createRegionalCalendarRepository({ meta, species, typical });
}
