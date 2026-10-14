/** Selecciona y ordena las filas del calendario de especies. */
export const TAB_LIMIT = [12, 24, 16];
export function arrival(row, order) {
  let best = [12, 12],
    start = -1;
  order.forEach((m, i) => {
    const on = row.prof[m] >= 50;
    if (on && start < 0) start = i;
    if (start >= 0 && (!on || i === 11)) {
      const end = on ? i : i - 1;
      if (end - start > best[1] - best[0] || best[0] === 12)
        best = [start, end];
      start = -1;
    }
  });
  return best;
}

export function selectRows(data, state, order) {
  const pool = (data.byScope.get(state.scope) || []).filter(
    (r) => r.cls === state.tab,
  );
  let rows = pool.slice().sort((a, b) => b.mean - a.mean || a.sid - b.sid);
  if (!state.expanded) rows = rows.slice(0, TAB_LIMIT[state.tab]);
  const pinned = pool.find((r) => r.sid === state.species);
  if (pinned && !rows.includes(pinned)) rows.push(pinned);
  if (state.tab !== 0) {
    // Escalera: primero los que llegan antes; a igual llegada, los que se van antes.
    rows.sort((a, b) => {
      const [a0, a1] = arrival(a, order);
      const [b0, b1] = arrival(b, order);
      return a0 - b0 || a1 - b1 || b.mean - a.mean;
    });
  }
  return { rows, total: pool.length };
}
