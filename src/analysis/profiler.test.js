import test from 'node:test';
import assert from 'node:assert/strict';
import { profileDataset } from './profiler.js';

test('profiler recognizes string identifiers, geographic labels, and full date values', () => {
  const rows = [
    { Order_ID: 'A-1', Region: 'North', Order_Date: '2025-01-03' },
    { Order_ID: 'A-1', Region: 'North', Order_Date: '2025-01-04' },
    { Order_ID: 'B-2', Region: 'South', Order_Date: '2025-02-03' },
    { Order_ID: 'C-3', Region: 'South', Order_Date: '2025-02-07' },
  ];
  const profiles = profileDataset(rows, Object.keys(rows[0]), rows.length);
  assert.equal(profiles.find(profile => profile.column === 'Order_ID').role, 'ID');
  assert.equal(profiles.find(profile => profile.column === 'Region').role, 'GEOGRAPHIC');
  assert.equal(profiles.find(profile => profile.column === 'Order_Date').role, 'DATE');
});

test('four-digit year fields remain year dimensions rather than dates', () => {
  const rows = [{ Year: '2022' }, { Year: '2023' }, { Year: '2024' }];
  const profile = profileDataset(rows, ['Year'], rows.length)[0];
  assert.equal(profile.role, 'YEAR');
});

test('unique ISO date strings are not misclassified as identifiers', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    Order_Date: `2025-01-${String(index + 1).padStart(2, '0')}`,
  }));
  const profile = profileDataset(rows, ['Order_Date'], rows.length)[0];
  assert.equal(profile.role, 'DATE');
});
