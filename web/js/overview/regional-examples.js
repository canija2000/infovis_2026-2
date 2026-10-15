/**
 * Editorial examples; scientific names keep the selection stable across data builds.
 * Each photo is copied from data/images.json so the landing page does not download
 * the whole photo index (~1 MB) to show three pictures.
 */
export const REGIONAL_EXAMPLES = [
  {
    sciName: "Sephanoides sephaniodes",
    // Primera foto de data/images.json; un test verifica que sigan coincidiendo.
    photo: {
      url: "https://inaturalist-open-data.s3.amazonaws.com/photos/524218094/medium.jpg",
      author: "Cristhoffer Rodríguez",
      license: "http://creativecommons.org/licenses/by/4.0/",
      source: "https://www.gbif.org/occurrence/6353005084",
    },
    name: "Picaflor chico",
    reading:
      "En Metropolitana su perfil es invernal. Más al sur, en La Araucanía, Los Ríos y Los Lagos, se clasifica como residente.",
  },
  {
    sciName: "Charadrius modestus",
    // Primera foto de data/images.json; un test verifica que sigan coincidiendo.
    photo: {
      url: "https://inaturalist-open-data.s3.amazonaws.com/photos/391097694/medium.jpeg",
      author: "Christoph Moning",
      license: "http://creativecommons.org/licenses/by/4.0/",
      source: "https://www.gbif.org/occurrence/4891705492",
    },
    name: "Chorlito chileno",
    reading:
      "En Biobío y Los Lagos su perfil es invernal. En Magallanes, en cambio, mantiene presencia regular durante todo el año y se clasifica como residente.",
  },
  {
    sciName: "Elaenia albiceps",
    // Primera foto de data/images.json; un test verifica que sigan coincidiendo.
    photo: {
      url: "https://inaturalist-open-data.s3.amazonaws.com/photos/479626932/medium.jpg",
      author: "Frank Dietze",
      license: "http://creativecommons.org/licenses/by/4.0/",
      source: "https://www.gbif.org/occurrence/6469851095",
    },
    name: "Fío-fío",
    reading:
      "Su calendario también cambia: cumple presencia regular desde septiembre en Metropolitana y desde octubre en Magallanes. En Arica y Parinacota se clasifica como residente.",
  },
];

// A short north–south comparison, with all sixteen regions available on demand.
export const COMPARISON_REGIONS = [1, 7, 11, 12, 13, 14, 16];
