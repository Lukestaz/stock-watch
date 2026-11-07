const definitions = {
  kiwisaver: [
    ['high-growth', 'High Growth'], ['growth', 'Growth'],
    ['balanced', 'Balanced'], ['default', 'Default'],
    ['conservative', 'Conservative'], ['defensive', 'Defensive']
  ],
  investment: [
    ['high-growth', 'High Growth'], ['growth', 'Growth'],
    ['balanced', 'Balanced'], ['conservative', 'Conservative'],
    ['homes-and-income', 'Homes and Income'], ['nz-share', 'NZ Share'],
    ['nz-bond', 'NZ Bond'], ['nz-cash', 'NZ Cash'],
    ['hedged-global-share', 'Hedged Global Share'],
    ['unhedged-global-share', 'Unhedged Global Share'],
    ['hedged-global-bond', 'Hedged Global Bond']
  ]
};

export const SIMPLICITY_CATALOGUE = Object.freeze(
  Object.entries(definitions).flatMap(([scheme, funds]) =>
    funds.map(([slug, name]) => Object.freeze({
      seriesId: `simplicity:${scheme}:${slug}`,
      scheme, name, currency: 'NZD',
      feedUrl: null, verificationStatus: 'unverified',
      monitoringEnabled: false, alertsEnabled: false
    }))
  )
);

export function getSimplicityFund(seriesId) {
  return SIMPLICITY_CATALOGUE.find(fund => fund.seriesId === seriesId) ?? null;
}
