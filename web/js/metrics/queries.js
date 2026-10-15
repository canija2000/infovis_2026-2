/** Derived readings of published (rounded) values; presence always uses its mask. */
export function describeExample(row, month) {
  const freq = row[7 + month];
  const profile = row[19 + month];
  const years = row[31 + month];
  const mean = row.slice(7, 19).reduce((a, b) => a + b, 0) / 12;
  return {
    freq,
    profile,
    years,
    mean,
    present: Boolean(row[6] & (1 << month)),
    opacity: 0.3 + (0.7 * years) / 8,
    weight: ((profile / 100) * years) / 8,
    days: (freq / 1000) * new Date(2021, month + 1, 0).getDate(),
    daysMean: (mean / 1000) * 30.4,
  };
}

/** Selects a complete example without formatting strings or touching the DOM. */
export function createMetricsQueries({ data, state }) {
  function example() {
    const row = data.byScope.get(state.scope);
    if (!row) return null;
    const months = data.regionMonth[state.scope];
    return {
      row,
      bird: data.bird,
      scope: state.scope,
      month: state.month,
      scopeName: data.regionById.get(state.scope).name,
      d: describeExample(row, state.month),
      monthly: Array.from({ length: 12 }, (_, m) => describeExample(row, m)),
      context: months[state.month],
      qMean: months.reduce((sum, r) => sum + r[4], 0) / 12,
    };
  }
  return { example };
}
