function isMissing(value) {
  return value == null || String(value).trim() === '';
}

function calculateExpression(expression, row) {
  const source = expression.trim();
  const tokens = [];
  let position = 0;
  const tokenPattern = /\s*(\[[^\]]+\]|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-])/y;
  while (position < source.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(source);
    if (!match) throw new Error('Use numbers, arithmetic operators, parentheses, and [Column Name] references only.');
    tokens.push(match[1]);
    position = tokenPattern.lastIndex;
  }

  let cursor = 0;
  const factor = () => {
    const token = tokens[cursor++];
    if (token === '-') return -factor();
    if (token === '+') return factor();
    if (token === '(') {
      const value = expressionValue();
      if (tokens[cursor++] !== ')') throw new Error('Formula has unmatched parentheses.');
      return value;
    }
    if (!token) throw new Error('Formula is incomplete.');
    if (token.startsWith('[')) {
      const value = Number(row[token.slice(1, -1)]);
      if (!Number.isFinite(value)) throw new Error(`Column ${token} does not contain a numeric value in every row.`);
      return value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Formula contains an invalid value.');
    return value;
  };
  const term = () => {
    let value = factor();
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const operator = tokens[cursor++];
      const right = factor();
      if (operator === '/' && right === 0) throw new Error('Formula cannot divide by zero.');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const expressionValue = () => {
    let value = term();
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operator = tokens[cursor++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = expressionValue();
  if (cursor !== tokens.length || !Number.isFinite(result)) throw new Error('Formula is invalid or produces a non-finite result.');
  return result;
}

export function applyTransformation(rows, columns, step) {
  switch (step.type) {
    case 'remove_duplicates': {
      const seen = new Set();
      return rows.filter(row => {
        const key = JSON.stringify(columns.map(column => row[column] ?? null));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    case 'drop_missing':
      return rows.filter(row => !isMissing(row[step.column]));
    case 'fill_missing':
      return rows.map(row => isMissing(row[step.column]) ? { ...row, [step.column]: step.value } : row);
    case 'rename': {
      if (!step.newName.trim() || columns.includes(step.newName.trim())) throw new Error('Enter a unique, non-empty replacement column name.');
      return rows.map(row => {
        const next = { ...row, [step.newName.trim()]: row[step.column] };
        delete next[step.column];
        return next;
      });
    }
    case 'convert_type':
      return rows.map((row, index) => {
        const value = row[step.column];
        if (isMissing(value)) return row;
        let converted;
        if (step.to === 'number') converted = Number(String(value).replace(/[$€£¥₹₩₽,%\s,]/g, ''));
        else if (step.to === 'date') {
          const timestamp = Date.parse(value);
          if (Number.isNaN(timestamp)) throw new Error(`Row ${index + 1} in ${step.column} cannot be converted to a date.`);
          converted = new Date(timestamp).toISOString();
        }
        else if (step.to === 'boolean') {
          const normalized = String(value).toLowerCase();
          if (['true', 'yes', '1', 'y'].includes(normalized)) converted = true;
          else if (['false', 'no', '0', 'n'].includes(normalized)) converted = false;
          else throw new Error(`Row ${index + 1} in ${step.column} cannot be converted to boolean.`);
        } else converted = String(value);
        if (step.to === 'number' && !Number.isFinite(converted)) throw new Error(`Row ${index + 1} in ${step.column} cannot be converted to a number.`);
        return { ...row, [step.column]: converted };
      });
    case 'filter_rows':
      return rows.filter(row => {
        const value = row[step.column];
        if (step.operator === 'not_empty') return !isMissing(value);
        if (step.operator === 'equals') return String(value ?? '') === step.value;
        if (step.operator === 'contains') return String(value ?? '').toLowerCase().includes(step.value.toLowerCase());
        const numeric = Number(value);
        const target = Number(step.value);
        if (!Number.isFinite(numeric) || !Number.isFinite(target)) return false;
        return step.operator === 'greater_than' ? numeric > target : numeric < target;
      });
    case 'split_column': {
      if (!step.delimiter) throw new Error('Enter a delimiter to split this column.');
      const [leftName, rightName] = [step.leftName.trim(), step.rightName.trim()];
      if (!leftName || !rightName || leftName === rightName || columns.some(column => column === leftName || column === rightName)) {
        throw new Error('Split column names must be unique and non-empty.');
      }
      return rows.map(row => {
        const [left = '', ...right] = String(row[step.column] ?? '').split(step.delimiter);
        return { ...row, [leftName]: left, [rightName]: right.join(step.delimiter) };
      });
    }
    case 'merge_columns': {
      const newName = step.newName.trim();
      if (!newName || columns.includes(newName)) throw new Error('Enter a unique, non-empty new column name.');
      return rows.map(row => ({
        ...row,
        [newName]: [row[step.column], row[step.secondColumn]].filter(value => !isMissing(value)).join(step.delimiter || ' '),
      }));
    }
    case 'calculate_column': {
      const newName = step.newName.trim();
      if (!newName || columns.includes(newName)) throw new Error('Enter a unique, non-empty calculated column name.');
      return rows.map(row => ({ ...row, [newName]: calculateExpression(step.expression, row) }));
    }
    default:
      throw new Error(`Unsupported transformation: ${step.type}`);
  }
}

export function runTransformationPipeline(rows, columns, steps) {
  let currentRows = rows;
  let currentColumns = [...columns];
  for (const step of steps) {
    currentRows = applyTransformation(currentRows, currentColumns, step);
    if (step.type === 'rename') currentColumns = currentColumns.map(column => column === step.column ? step.newName.trim() : column);
    if (step.type === 'split_column') currentColumns = [...currentColumns, step.leftName.trim(), step.rightName.trim()];
    if (step.type === 'merge_columns' || step.type === 'calculate_column') currentColumns = [...currentColumns, step.newName.trim()];
  }
  return currentRows;
}

export function joinDatasets(left, right, leftKey, rightKey, mode = 'left') {
  const rightIndex = new Map();
  for (const row of right.sample) {
    const rawKey = row[rightKey];
    if (rawKey == null || String(rawKey).trim() === '') continue;
    const key = String(rawKey);
    if (!rightIndex.has(key)) rightIndex.set(key, []);
    rightIndex.get(key).push(row);
  }
  const rightColumns = right.columns.map(column => left.columns.includes(column) ? `${right.name}_${column}` : column);
  const rows = [];
  let unmatched = 0;
  let multiplyMatched = 0;

  for (const leftRow of left.sample) {
    const leftValue = leftRow[leftKey];
    const matches = leftValue == null || String(leftValue).trim() === '' ? [] : rightIndex.get(String(leftValue)) || [];
    if (matches.length === 0) {
      unmatched++;
      if (mode === 'left') rows.push({ ...leftRow });
    } else {
      if (matches.length > 1) multiplyMatched += matches.length - 1;
      for (const match of matches) {
        const combined = { ...leftRow };
        right.columns.forEach((column, index) => { combined[rightColumns[index]] = match[column]; });
        rows.push(combined);
      }
    }
  }

  return {
    rows,
    columns: [...left.columns, ...rightColumns],
    unmatched,
    multiplyMatched,
    mode,
    isSampled: left.rowCount > left.sample.length || right.rowCount > right.sample.length,
  };
}
