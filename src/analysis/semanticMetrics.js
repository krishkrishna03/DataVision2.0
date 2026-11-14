const RATE_ROLES = new Set(['PERCENTAGE']);
export function parseMetricValue(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[$€£¥₹₩₽,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferDomain(profiles = []) {
  const names = profiles.map(profile => profile.column.toLowerCase().replace(/[_-]+/g, ' ')).join(' ');
  const domains = [
    ['Sales', /\b(revenue|sales|order|customer|quantity|product|discount)\b/],
    ['Finance', /\b(income|expense|profit|budget|cash|invoice|cost)\b/],
    ['HR', /\b(employee|salary|hire|attrition|department|tenure)\b/],
    ['Education', /\b(student|score|grade|attendance|course|subject)\b/],
    ['Marketing', /\b(click|impression|campaign|conversion|spend|roas)\b/],
    ['Inventory', /\b(stock|inventory|warehouse|sku|sell.?through)\b/],
    ['Operations', /\b(cycle.?time|throughput|sla|defect|delivery|shipment)\b/],
  ];

  return domains.find(([, pattern]) => pattern.test(names))?.[0] || 'General';
}

export function inferDomainWithConfidence(profiles = []) {
  const domain = inferDomain(profiles);
  if (domain === 'General') return { domain, confidence: 0.35 };
  const patterns = {
    Sales: /revenue|sales|order|customer|quantity|product|discount/i,
    Finance: /income|expense|profit|budget|cash|invoice|cost/i,
    HR: /employee|salary|hire|attrition|department|tenure/i,
    Education: /student|score|grade|attendance|course|subject/i,
    Marketing: /click|impression|campaign|conversion|spend|roas/i,
    Inventory: /stock|inventory|warehouse|sku|sell.?through/i,
    Operations: /cycle.?time|throughput|sla|defect|delivery|shipment/i,
  };
  const matches = profiles.filter(profile => patterns[domain].test(profile.column)).length;
  return { domain, confidence: Math.min(0.95, 0.5 + matches * 0.1) };
}

export function defaultAggregation(profile, dimension = '') {
  if (!profile) return 'count';
  const role = profile.role;
  const name = profile.column.toLowerCase();
  if (role === 'ID') return 'distinct_count';
  if (RATE_ROLES.has(role)) return 'average';
  if (/(unit.?price|price.?per|rate|ratio|percent|margin|discount)/.test(name)) return 'average';
  if (/(price|cost.?per|salary|score|duration|tenure|age)/.test(name)) return 'average';
  if (role === 'CURRENCY' && !/(unit.?price|price.?per)/.test(name)) return 'sum';
  if (role === 'COUNT') return 'sum';
  if (role === 'NUMERIC_MEASURE') return 'sum';
  if (dimension && role === 'YEAR') return 'count';
  return 'average';
}

export function aggregateValues(values, aggregation = 'sum') {
  if (aggregation === 'count') return values.length;
  if (aggregation === 'distinct_count') return new Set(values.map(value => String(value))).size;

  const numeric = values.map(parseMetricValue).filter(value => value != null);
  if (numeric.length === 0) return null;
  if (aggregation === 'average') return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  if (aggregation === 'min') return Math.min(...numeric);
  if (aggregation === 'max') return Math.max(...numeric);
  if (aggregation === 'median') {
    const sorted = numeric.sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  if (aggregation === 'sum') return numeric.reduce((sum, value) => sum + value, 0);
  return null;
}

export function aggregateRows(rows, dimension, measure, aggregation = 'sum', limit = 15) {
  const groups = new Map();
  for (const row of rows) {
    const key = dimension ? String(row[dimension] ?? '').trim() : 'All records';
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const valueKey = measure || 'count';
  const result = Array.from(groups, ([key, group]) => {
    const rawValues = measure ? group.map(row => row[measure]).filter(value => value != null && value !== '') : group;
    const values = aggregation === 'distinct_count' || aggregation === 'count'
      ? rawValues
      : rawValues.filter(value => parseMetricValue(value) != null);
    return {
      [dimension || 'category']: key,
      [valueKey]: aggregateValues(values, measure ? aggregation : 'count'),
      count: group.length,
      aggregation,
    };
  });

  return result
    .sort((left, right) => (right[valueKey] ?? 0) - (left[valueKey] ?? 0))
    .slice(0, limit);
}

export function recalculateKpi(chart, rows) {
  if (chart.column === '__count__') return { ...chart, value: rows.length, count: rows.length };
  if (chart.aggregation === 'ratio' && chart.numeratorValues) {
    const numerator = rows.filter(row => chart.numeratorValues.includes(String(row[chart.column] ?? '').trim().toLowerCase())).length;
    const denominator = rows.length;
    return { ...chart, numerator, denominator, value: denominator ? numerator / denominator * 100 : null };
  }
  if (chart.aggregation === 'ratio' && chart.numeratorColumn && chart.denominatorColumn) {
    const numerator = aggregateValues(rows.map(row => row[chart.numeratorColumn]), chart.numeratorAggregation || 'sum');
    const denominator = aggregateValues(rows.map(row => row[chart.denominatorColumn]), chart.denominatorAggregation || 'sum');
    return {
      ...chart,
      numerator,
      denominator,
      value: denominator ? numerator / denominator * (chart.format === 'percent' ? 100 : 1) : null,
    };
  }
  if (chart.aggregation === 'difference' && chart.numeratorColumn && chart.denominatorColumn) {
    const numerator = aggregateValues(rows.map(row => row[chart.numeratorColumn]), chart.numeratorAggregation || 'sum');
    const denominator = aggregateValues(rows.map(row => row[chart.denominatorColumn]), chart.denominatorAggregation || 'sum');
    return { ...chart, numerator, denominator, value: numerator == null || denominator == null ? null : numerator - denominator };
  }
  if (chart.aggregation === 'row_product_sum' && chart.numeratorColumn && chart.denominatorColumn) {
    const value = rows.reduce((sum, row) => {
      const left = parseMetricValue(row[chart.numeratorColumn]);
      const right = parseMetricValue(row[chart.denominatorColumn]);
      return left == null || right == null ? sum : sum + left * right;
    }, 0);
    return { ...chart, value };
  }
  const values = rows.map(row => row[chart.column]).filter(value => value != null && value !== '');
  const aggregation = chart.aggregation || (chart.displayType === 'avg' ? 'average' : chart.displayType === 'distinct_count' ? 'distinct_count' : 'sum');
  return {
    ...chart,
    value: aggregateValues(values, aggregation),
    avg: aggregateValues(values, 'average'),
    max: aggregateValues(values, 'max'),
    min: aggregateValues(values, 'min'),
    count: values.length,
  };
}

export function buildKpiSuggestions(rows, profiles) {
  const kpis = [{
    id: 'kpi_records',
    type: 'kpi',
    title: 'Total Records',
    value: rows.length,
    column: '__count__',
    aggregation: 'count',
    definition: 'Count of rows in the current dataset or filter context.',
    formula: 'COUNT(rows)',
    format: 'raw',
    confidence: 1,
  }];

  const domain = inferDomain(profiles);
  const identifiers = profiles.filter(profile => profile.role === 'ID');
  if (identifiers.length > 0) {
    const profile = identifiers[0];
    kpis.push({
      id: `kpi_unique_${profile.column}`,
      type: 'kpi',
      title: `Unique ${profile.column.replace(/[_-]?id$/i, '').replace(/[_-]+/g, ' ') || 'Records'}`,
      value: aggregateValues(rows.map(row => row[profile.column]).filter(value => value != null && value !== ''), 'distinct_count'),
      column: profile.column,
      aggregation: 'distinct_count',
      definition: `Distinct count of ${profile.column}; identifiers are never summed.`,
      formula: `COUNT DISTINCT(${profile.column})`,
      format: 'raw',
      confidence: 0.9,
    });
  }

  const revenue = profiles.find(profile => /revenue|sales/i.test(profile.column) && profile.role === 'CURRENCY');
  const profit = profiles.find(profile => /profit/i.test(profile.column) && profile.role === 'CURRENCY');
  const orderId = identifiers.find(profile => /order/i.test(profile.column));
  if (revenue && profit) {
    const revenueTotal = aggregateValues(rows.map(row => row[revenue.column]), 'sum');
    const profitTotal = aggregateValues(rows.map(row => row[profit.column]), 'sum');
    if (revenueTotal) {
      kpis.push({
        id: 'kpi_profit_margin',
        type: 'kpi',
        title: 'Profit Margin',
        value: (profitTotal / revenueTotal) * 100,
        column: profit.column,
        aggregation: 'ratio',
        numeratorColumn: profit.column,
        denominatorColumn: revenue.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        definition: 'Profit divided by revenue. Both totals use the same filtered rows.',
        formula: `SUM(${profit.column}) / SUM(${revenue.column})`,
        numerator: profitTotal,
        denominator: revenueTotal,
        format: 'percent',
        confidence: 0.9,
      });
    }
  }
  if (revenue && orderId) {
    const revenueTotal = aggregateValues(rows.map(row => row[revenue.column]), 'sum');
    const orderCount = aggregateValues(rows.map(row => row[orderId.column]).filter(value => value != null && value !== ''), 'distinct_count');
    if (orderCount > 0) {
      kpis.push({
        id: 'kpi_average_order_value',
        type: 'kpi',
        title: 'Average Order Value',
        value: revenueTotal / orderCount,
        column: revenue.column,
        aggregation: 'ratio',
        numeratorColumn: revenue.column,
        denominatorColumn: orderId.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'distinct_count',
        definition: 'Revenue divided by distinct order IDs; repeated order lines are counted once.',
        formula: `SUM(${revenue.column}) / COUNT DISTINCT(${orderId.column})`,
        numerator: revenueTotal,
        denominator: orderCount,
        format: 'raw',
        confidence: 0.9,
      });
    }
  }
  const clicks = profiles.find(profile => /click/i.test(profile.column));
  const impressions = profiles.find(profile => /impression/i.test(profile.column));
  if (domain === 'Marketing' && clicks && impressions) {
    const clickTotal = aggregateValues(rows.map(row => row[clicks.column]), 'sum');
    const impressionTotal = aggregateValues(rows.map(row => row[impressions.column]), 'sum');
    if (impressionTotal > 0) kpis.push({
      id: 'kpi_click_through_rate',
      type: 'kpi',
      title: 'Click-through Rate',
      value: clickTotal / impressionTotal * 100,
      column: clicks.column,
      aggregation: 'ratio',
      numeratorColumn: clicks.column,
      denominatorColumn: impressions.column,
      numeratorAggregation: 'sum',
      denominatorAggregation: 'sum',
      definition: 'Total clicks divided by total impressions.',
      formula: `SUM(${clicks.column}) / SUM(${impressions.column})`,
      format: 'percent',
      confidence: 0.9,
    });
  }
  if (domain === 'Marketing') {
    const spend = profiles.find(profile => /spend|ad.?cost|marketing.?cost/i.test(profile.column) && profile.role === 'CURRENCY');
    const conversions = profiles.find(profile => /conversion/i.test(profile.column) && profile.isPotentialMeasure);
    const sales = revenue || profiles.find(profile => /revenue|sales/i.test(profile.column) && profile.isPotentialMeasure);
    if (spend && clicks) {
      const spendTotal = aggregateValues(rows.map(row => row[spend.column]), 'sum');
      const clickTotal = aggregateValues(rows.map(row => row[clicks.column]), 'sum');
      if (clickTotal > 0) kpis.push({
        id: 'kpi_cost_per_click',
        type: 'kpi',
        title: 'Cost per Click',
        value: spendTotal / clickTotal,
        column: spend.column,
        aggregation: 'ratio',
        numeratorColumn: spend.column,
        denominatorColumn: clicks.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        definition: 'Total campaign spend divided by total clicks.',
        formula: `SUM(${spend.column}) / SUM(${clicks.column})`,
        format: 'raw',
        confidence: 0.85,
      });
    }
    if (sales && spend) {
      const salesTotal = aggregateValues(rows.map(row => row[sales.column]), 'sum');
      const spendTotal = aggregateValues(rows.map(row => row[spend.column]), 'sum');
      if (spendTotal > 0) kpis.push({
        id: 'kpi_roas',
        type: 'kpi',
        title: 'Return on Ad Spend',
        value: salesTotal / spendTotal,
        column: sales.column,
        aggregation: 'ratio',
        numeratorColumn: sales.column,
        denominatorColumn: spend.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        definition: 'Revenue divided by marketing spend.',
        formula: `SUM(${sales.column}) / SUM(${spend.column})`,
        format: 'raw',
        confidence: 0.85,
      });
    }
    if (conversions && clicks) {
      const conversionTotal = aggregateValues(rows.map(row => row[conversions.column]), 'sum');
      const clickTotal = aggregateValues(rows.map(row => row[clicks.column]), 'sum');
      if (clickTotal > 0) kpis.push({
        id: 'kpi_conversion_rate',
        type: 'kpi',
        title: 'Conversion Rate',
        value: conversionTotal / clickTotal * 100,
        column: conversions.column,
        aggregation: 'ratio',
        numeratorColumn: conversions.column,
        denominatorColumn: clicks.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        definition: 'Conversions divided by clicks.',
        formula: `SUM(${conversions.column}) / SUM(${clicks.column})`,
        format: 'percent',
        confidence: 0.85,
      });
    }
  }

  if (domain === 'Finance') {
    const income = profiles.find(profile => /income|revenue/i.test(profile.column) && profile.role === 'CURRENCY');
    const expenses = profiles.find(profile => /expense|cost/i.test(profile.column) && profile.role === 'CURRENCY');
    if (income && expenses) {
      const incomeTotal = aggregateValues(rows.map(row => row[income.column]), 'sum');
      const expenseTotal = aggregateValues(rows.map(row => row[expenses.column]), 'sum');
      kpis.push({
        id: 'kpi_net_income',
        type: 'kpi',
        title: 'Net Income',
        value: incomeTotal - expenseTotal,
        column: income.column,
        aggregation: 'difference',
        definition: 'Total income minus total expenses over the current rows.',
        formula: `SUM(${income.column}) - SUM(${expenses.column})`,
        numerator: incomeTotal,
        denominator: expenseTotal,
        numeratorColumn: income.column,
        denominatorColumn: expenses.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        format: 'raw',
        confidence: 0.8,
      });
    }
    const actual = profiles.find(profile => /actual/i.test(profile.column) && profile.isPotentialMeasure);
    const budget = profiles.find(profile => /budget|target/i.test(profile.column) && profile.isPotentialMeasure);
    if (actual && budget) {
      const actualTotal = aggregateValues(rows.map(row => row[actual.column]), 'sum');
      const budgetTotal = aggregateValues(rows.map(row => row[budget.column]), 'sum');
      kpis.push({
        id: 'kpi_budget_variance',
        type: 'kpi',
        title: 'Budget Variance',
        value: actualTotal - budgetTotal,
        column: actual.column,
        aggregation: 'difference',
        definition: 'Actual total minus budget total.',
        formula: `SUM(${actual.column}) - SUM(${budget.column})`,
        numerator: actualTotal,
        denominator: budgetTotal,
        numeratorColumn: actual.column,
        denominatorColumn: budget.column,
        numeratorAggregation: 'sum',
        denominatorAggregation: 'sum',
        format: 'raw',
        confidence: 0.8,
      });
    }
  }

  const status = profiles.find(profile => /status|return|pass|delivery|sla/i.test(profile.column));
  if (status && rows.length > 0) {
    const normalizedStatus = rows.map(row => String(row[status.column] ?? '').trim().toLowerCase());
    const returnCount = normalizedStatus.filter(value => /^(returned|return|refunded)$/.test(value)).length;
    if (domain === 'Sales' && returnCount > 0) {
      kpis.push({
        id: 'kpi_return_rate',
        type: 'kpi',
        title: 'Return Rate',
        value: returnCount / rows.length * 100,
        column: status.column,
        aggregation: 'ratio',
        numerator: returnCount,
        denominator: rows.length,
        numeratorValues: ['returned', 'return', 'refunded'],
        definition: 'Rows with a returned/refunded status divided by all rows; this is a row-level rate, not a distinct-order rate.',
        formula: `COUNT returned rows / COUNT rows`,
        format: 'percent',
        confidence: 0.7,
      });
    }
    const passedCount = normalizedStatus.filter(value => /^(pass|passed|on time|ontime|delivered|compliant|active)$/.test(value)).length;
    const hasPassLabels = normalizedStatus.some(value => /^(pass|passed)$/.test(value));
    if (domain === 'Education' && hasPassLabels) {
      kpis.push({
        id: 'kpi_pass_rate',
        type: 'kpi',
        title: 'Pass Rate',
        value: passedCount / rows.length * 100,
        column: status.column,
        aggregation: 'ratio',
        numerator: passedCount,
        denominator: rows.length,
        numeratorValues: ['pass', 'passed'],
        definition: 'Rows labeled pass/passed divided by all rows; the pass rule is taken from the explicit status values.',
        formula: `COUNT pass rows / COUNT rows`,
        format: 'percent',
        confidence: 0.8,
      });
    }
    if (domain === 'Operations' && normalizedStatus.some(value => /^(on time|ontime|delivered|compliant)$/.test(value))) {
      kpis.push({
        id: 'kpi_sla_compliance',
        type: 'kpi',
        title: 'On-time / compliant rate',
        value: passedCount / rows.length * 100,
        column: status.column,
        aggregation: 'ratio',
        numerator: passedCount,
        denominator: rows.length,
        numeratorValues: ['on time', 'ontime', 'delivered', 'compliant'],
        definition: 'Rows with an explicit on-time/delivered/compliant status divided by all rows.',
        formula: `COUNT compliant rows / COUNT rows`,
        format: 'percent',
        confidence: 0.7,
      });
    }
  }

  if (domain === 'Inventory') {
    const quantity = profiles.find(profile => /quantity|stock.?on.?hand|units/i.test(profile.column) && profile.isPotentialMeasure);
    const unitCost = profiles.find(profile => /unit.?cost|cost.?per/i.test(profile.column) && profile.isPotentialMeasure);
    if (quantity && unitCost) {
      const inventoryValue = rows.reduce((sum, row) => {
        const quantityValue = parseMetricValue(row[quantity.column]);
        const costValue = parseMetricValue(row[unitCost.column]);
        return quantityValue == null || costValue == null ? sum : sum + quantityValue * costValue;
      }, 0);
      kpis.push({
        id: 'kpi_inventory_value',
        type: 'kpi',
        title: 'Inventory Value',
        value: inventoryValue,
        column: unitCost.column,
        aggregation: 'row_product_sum',
        numeratorColumn: quantity.column,
        denominatorColumn: unitCost.column,
        definition: 'Sum of quantity multiplied by unit cost for rows with both values present.',
        formula: `SUM(${quantity.column} * ${unitCost.column})`,
        format: 'raw',
        confidence: 0.8,
      });
    }
  }

  const candidates = profiles.filter(profile =>
    ['CURRENCY', 'NUMERIC_MEASURE', 'COUNT', 'PERCENTAGE', 'DURATION'].includes(profile.role)
  );
  const currency = candidates.find(profile => profile.role === 'CURRENCY');
  const selected = currency ? [currency, ...candidates.filter(profile => profile !== currency)] : candidates;

  for (const profile of selected) {
    const aggregation = defaultAggregation(profile);
    const value = aggregateValues(rows.map(row => row[profile.column]), aggregation);
    if (value == null) continue;
    const isAverage = aggregation === 'average';
    const title = `${isAverage ? 'Average' : 'Total'} ${profile.column.replace(/[_-]+/g, ' ')}`;
    kpis.push({
      id: `kpi_${aggregation}_${profile.column}`,
      type: 'kpi',
      title,
      value,
      column: profile.column,
      aggregation,
      role: profile.role,
      definition: `${aggregation === 'sum' ? 'Sum' : 'Arithmetic mean'} of ${profile.column}; ${profile.role === 'PERCENTAGE' ? 'rates are averaged, never summed.' : 'aggregation selected from the inferred semantic role.'}`,
      formula: `${aggregation.toUpperCase()}(${profile.column})`,
      format: profile.role === 'PERCENTAGE' ? 'percent' : 'raw',
      confidence: profile.confidence ?? 0.7,
    });
    if (kpis.length >= 6) break;
  }

  return kpis.slice(0, 6);
}
