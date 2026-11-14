import { buildKpiSuggestions } from './semanticMetrics';

export function generateKPIs(classification, data) {
  return buildKpiSuggestions(data, classification.all || []);
}
