export function countPendingIndicatorDecisions(variant, rows = [], indicatorReviews = {}) {
  if (variant !== 'armazem') return 0;

  return rows
    .filter((row) => row.vinculado)
    .reduce((sum, row) => {
      const reviews = indicatorReviews[String(row.matricula)] || [];
      return sum + reviews.filter((indicator) => !indicator.decisao).length;
    }, 0);
}
