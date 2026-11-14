import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRows, aggregateValues, buildKpiSuggestions, defaultAggregation, recalculateKpi } from './semanticMetrics.js';

const profiles = [
  { column: 'Order_ID', role: 'ID', confidence: 0.9 },
  { column: 'Product', role: 'CATEGORICAL_DIMENSION', confidence: 0.9 },
  { column: 'Revenue', role: 'CURRENCY', confidence: 0.9 },
  { column: 'Unit_Price', role: 'CURRENCY', confidence: 0.9 },
  { column: 'Discount_Rate', role: 'PERCENTAGE', confidence: 0.9 },
];

const rows = [
  { Order_ID: 'A', Product: 'P1', Revenue: '100', Unit_Price: '10', Discount_Rate: '10%' },
  { Order_ID: 'A', Product: 'P1', Revenue: '80', Unit_Price: '10', Discount_Rate: '20%' },
  { Order_ID: 'B', Product: 'P2', Revenue: '120', Unit_Price: '20', Discount_Rate: '0%' },
];

test('semantic defaults do not sum identifiers, rates, or repeated unit prices', () => {
  assert.equal(defaultAggregation(profiles[0]), 'distinct_count');
  assert.equal(defaultAggregation(profiles[2]), 'sum');
  assert.equal(defaultAggregation(profiles[3]), 'average');
  assert.equal(defaultAggregation(profiles[4]), 'average');
});

test('aggregation and generated KPI definitions produce expected values', () => {
  assert.equal(aggregateValues(rows.map(row => row.Revenue), 'sum'), 300);
  assert.equal(aggregateValues(rows.map(row => row.Order_ID), 'distinct_count'), 2);
  assert.equal(aggregateRows(rows, 'Product', 'Unit_Price', 'average').find(item => item.Product === 'P1').Unit_Price, 10);
  assert.equal(aggregateRows([{ Region: 'North', Customer_ID: 'A-1' }, { Region: 'North', Customer_ID: 'A-1' }, { Region: 'North', Customer_ID: 'B-2' }], 'Region', 'Customer_ID', 'distinct_count')[0].Customer_ID, 2);
  const kpis = buildKpiSuggestions(rows, profiles);
  assert.equal(kpis.find(kpi => kpi.title === 'Total Revenue').value, 300);
  assert.equal(kpis.find(kpi => kpi.title === 'Average Unit Price').value, 40 / 3);
  assert.equal(kpis.find(kpi => kpi.column === 'Discount_Rate').value, 10);
  assert.equal(kpis.find(kpi => kpi.column === 'Discount_Rate').format, 'percent');
});

test('filtered ratio KPI recalculates from its numerator and denominator fields', () => {
  const ratio = {
    type: 'kpi',
    aggregation: 'ratio',
    numeratorColumn: 'Revenue',
    denominatorColumn: 'Order_ID',
    numeratorAggregation: 'sum',
    denominatorAggregation: 'distinct_count',
    format: 'raw',
  };
  assert.equal(recalculateKpi(ratio, rows).value, 150);
});
