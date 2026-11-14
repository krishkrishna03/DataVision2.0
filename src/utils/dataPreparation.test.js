import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTransformation, joinDatasets, runTransformationPipeline } from './dataPreparation.js';

test('pipeline transforms derived rows without mutating original data', () => {
  const source = [
    { Product: 'P1', Quantity: '2', Price: '5' },
    { Product: 'P1', Quantity: '2', Price: '5' },
    { Product: 'P2', Quantity: '3', Price: '4' },
  ];
  const result = runTransformationPipeline(source, ['Product', 'Quantity', 'Price'], [
    { type: 'remove_duplicates' },
    { type: 'calculate_column', newName: 'Revenue', expression: '[Quantity] * [Price]' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].Revenue, 12);
  assert.equal(source[0].Revenue, undefined);
  assert.equal(source.length, 3);
});

test('numeric conversion and filter operations validate their values', () => {
  const rows = [{ Score: '10' }, { Score: 'bad' }, { Score: '20' }];
  assert.throws(() => applyTransformation(rows, ['Score'], { type: 'convert_type', column: 'Score', to: 'number' }), /cannot be converted/);
  assert.deepEqual(applyTransformation(rows, ['Score'], { type: 'filter_rows', column: 'Score', operator: 'greater_than', value: '10' }), [{ Score: '20' }]);
});

test('formula input is limited to arithmetic and column references', () => {
  const rows = [{ Quantity: 4, Price: 3 }];
  assert.equal(applyTransformation(rows, ['Quantity', 'Price'], {
    type: 'calculate_column',
    newName: 'Value',
    expression: ' ([Quantity] * [Price]) + 2 ',
  })[0].Value, 14);
  assert.throws(() => applyTransformation(rows, ['Quantity', 'Price'], {
    type: 'calculate_column',
    newName: 'Unsafe',
    expression: 'globalThis.process.exit()',
  }), /Use numbers/);
});

test('joins report unmatched and duplicate keys without changing source tables', () => {
  const left = { id: 'a', name: 'left', columns: ['Key', 'Value'], sample: [{ Key: '1', Value: 4 }, { Key: '2', Value: 5 }], rowCount: 2 };
  const right = { id: 'b', name: 'right', columns: ['Key', 'Label'], sample: [{ Key: '1', Label: 'a' }, { Key: '1', Label: 'b' }], rowCount: 2 };
  const joined = joinDatasets(left, right, 'Key', 'Key');
  assert.equal(joined.rows.length, 3);
  assert.equal(joined.unmatched, 1);
  assert.equal(joined.multiplyMatched, 1);
  assert.equal(left.sample.length, 2);
});
