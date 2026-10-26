'use strict';
const path = require('path');
const { rankAlternatives } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/decision-rubric'));

function fixture() {
  return { criteria: [{ id: 'quality', weight: 4, minimum: 70 }, { id: 'economy', weight: 1 }],
    sources: [{ id: 'benchmark', reference: 'local measured benchmark' }],
    alternatives: [
      { id: 'first', scores: { quality: { value: 90, sources: ['benchmark'] }, economy: { value: 50, sources: ['benchmark'] } } },
      { id: 'second', scores: { quality: { value: 75, sources: ['benchmark'] }, economy: { value: 95, sources: ['benchmark'] } } },
    ] };
}

test('weight changes are reproducible and can change the recommendation', () => {
  const input = fixture();
  expect(rankAlternatives(input).winner).toBe('first');
  input.weightOverrides = { quality: 1, economy: 4 };
  expect(rankAlternatives(input).winner).toBe('second');
});
test('minimum requirements veto even a low-weight dimension', () => {
  const input = fixture();
  input.alternatives[1].scores.quality.value = 60;
  input.weightOverrides = { quality: 0, economy: 1 };
  expect(rankAlternatives(input).alternatives[1]).toMatchObject({ status: 'EXCLUDED', score: null });
});
test('missing source or score cannot become an eligible zero', () => {
  const input = fixture();
  delete input.alternatives[0].scores.economy;
  input.alternatives[1].scores.quality.sources = [];
  const result = rankAlternatives(input);
  expect(result.winner).toBeNull();
  expect(result.alternatives.every((item) => item.status === 'INSUFFICIENT_EVIDENCE' && item.score === null)).toBe(true);
});
test('duplicate ids, unknown evidence, malformed scores and zero weights fail', () => {
  const input = fixture();
  input.alternatives[0].scores.quality.sources = ['invented'];
  expect(() => rankAlternatives(input)).toThrow(/unknown source/);
  const duplicate = fixture();
  duplicate.criteria.push(duplicate.criteria[0]);
  expect(() => rankAlternatives(duplicate)).toThrow(/duplicate/);
  const zero = fixture();
  zero.weightOverrides = { quality: 0, economy: 0 };
  expect(() => rankAlternatives(zero)).toThrow(/positive/);
});
test('ties remain explicit rather than fabricating a sole winner', () => {
  const input = fixture();
  input.alternatives[1].scores = input.alternatives[0].scores;
  expect(rankAlternatives(input)).toMatchObject({ winner: null, ties: ['first', 'second'] });
});
