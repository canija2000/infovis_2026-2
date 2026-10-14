/** Carga el resumen de conteos y presencia usado por la portada. */
export async function loadOverview() {
  const raw = await fetch("data/overview.json?v=1").then((r) => {
    if (!r.ok) throw new Error(`overview.json: ${r.status}`);
    return r.json();
  });
  const species = raw.species.map(([sid, cls, mask, phase], i) => ({
    sid,
    cls,
    mask,
    phase,
    name: raw.names[i],
    grain: raw.sound[String(sid)] || null,
  }));
  return { months: raw.months, species };
}
