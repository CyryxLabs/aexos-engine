'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`Decision rubric: ${message}`);
}

function uniqueIds(items, label) {
  assert(Array.isArray(items) && items.length > 0, `${label} must be a non-empty array.`);
  const ids = new Set();
  for (const item of items) {
    assert(typeof item?.id === 'string' && /^[a-z][a-z0-9-]*$/.test(item.id), `${label} requires valid ids.`);
    assert(!ids.has(item.id), `${label} contains duplicate ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function rankAlternatives(input) {
  assert(input && typeof input === 'object', 'input must be an object.');
  const ids = uniqueIds(input.criteria, 'criteria');
  uniqueIds(input.alternatives, 'alternatives');
  const sourceIds = uniqueIds(input.sources, 'sources');
  for (const source of input.sources) {
    assert(typeof source.reference === 'string' && source.reference.trim(), 'sources require a reference.');
  }
  const overrides = input.weightOverrides || {};
  assert(typeof overrides === 'object' && !Array.isArray(overrides), 'weightOverrides must be an object.');
  for (const id of Object.keys(overrides)) assert(ids.has(id), `unknown weight override ${id}.`);
  const criteria = input.criteria.map((criterion) => {
    const weight = Object.hasOwn(overrides, criterion.id) ? overrides[criterion.id] : criterion.weight;
    assert(Number.isFinite(weight) && weight >= 0, 'weights must be finite non-negative numbers.');
    assert(criterion.minimum === undefined || (Number.isFinite(criterion.minimum)
      && criterion.minimum >= 0 && criterion.minimum <= 100), 'minimum must be within 0–100.');
    return { id: criterion.id, weight, minimum: criterion.minimum };
  });
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  assert(Number.isFinite(totalWeight) && totalWeight > 0, 'total weight must be finite and positive.');
  const alternatives = input.alternatives.map((alternative) => {
    assert(alternative.scores && typeof alternative.scores === 'object' && !Array.isArray(alternative.scores), 'scores must be an object.');
    for (const id of Object.keys(alternative.scores)) assert(ids.has(id), `unknown score criterion ${id}.`);
    const missing = [];
    const vetoes = [];
    let weighted = 0;
    const evidenceSources = new Set();
    for (const criterion of criteria) {
      const score = Object.hasOwn(alternative.scores, criterion.id) ? alternative.scores[criterion.id] : null;
      if (score == null) {
        if (criterion.weight > 0 || criterion.minimum !== undefined) missing.push(criterion.id);
        continue;
      }
      assert(Number.isFinite(score.value) && score.value >= 0 && score.value <= 100, 'scores must be within 0–100.');
      assert(Array.isArray(score.sources), 'score sources must be an array.');
      for (const source of score.sources) {
        assert(sourceIds.has(source), `unknown source ${source}.`);
        evidenceSources.add(source);
      }
      if (score.sources.length === 0) missing.push(criterion.id);
      if (criterion.minimum !== undefined && score.value < criterion.minimum) vetoes.push(criterion.id);
      weighted += score.value * (criterion.weight / totalWeight);
    }
    const status = vetoes.length ? 'EXCLUDED' : missing.length ? 'INSUFFICIENT_EVIDENCE' : 'ELIGIBLE';
    return { id: alternative.id, status, score: status === 'ELIGIBLE' ? Math.round(weighted * 10000) / 10000 : null,
      missing, vetoes, evidenceSources: [...evidenceSources].sort() };
  });
  const ranked = alternatives.filter((item) => item.status === 'ELIGIBLE')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const leaders = ranked.filter((item) => item.score === ranked[0]?.score).map((item) => item.id);
  return { schemaVersion: 1, evidenceLevel: 'source-referenced-inputs-not-independently-verified',
    criteria, alternatives, ranking: ranked.map((item) => item.id),
    winner: leaders.length === 1 ? leaders[0] : null, ties: leaders.length > 1 ? leaders : [] };
}

module.exports = { rankAlternatives };
