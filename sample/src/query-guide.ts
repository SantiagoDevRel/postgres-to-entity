import type { EntityDesign } from 'postgres-to-entity';

type Attribute = EntityDesign['attributes'][number];
type FilterExample = { name: string; explanation: string; query: string };

/** Examples describe the mapped Arkiv type, never infer capabilities from a SQL spelling. */
export function filterExamples(attribute: Attribute): FilterExample[] {
  const field = JSON.stringify(attribute.name);
  const text = attribute.sourceType === 'uuid' ? '00000000-0000-4000-8000-000000000001' : 'Friday concert';
  const prefix = attribute.sourceType === 'uuid' ? '0000' : 'Friday';
  const value = attribute.type === 'bool' ? 'false' : attribute.type === 'str' ? JSON.stringify(text) : attribute.type === 'dec' ? "dec('12')" : 'i32(12)';
  const examples: FilterExample[] = [{ name: 'Equals', explanation: 'Match one exact value.', query: `eq(${field}, ${value})` }];
  if (['i32', 'u64', 'u256', 'dec'].includes(attribute.type)) {
    const number = (n: number) => attribute.type === 'dec' ? `dec('${n}')` : attribute.type === 'i32' ? `i32(${n})` : `${attribute.type}(${n}n)`;
    const boundary = number(12);
    examples[0].query = `eq(${field}, ${boundary})`;
    for (const [op, name, explanation] of [
      ['gt', 'Greater than', 'Above 12; excludes 12.'],
      ['gte', 'Greater than or equal', '12 or above; includes 12.'],
      ['lt', 'Less than', 'Below 12; excludes 12.'],
      ['lte', 'Less than or equal', '12 or below; includes 12.'],
    ]) examples.push({ name, explanation, query: `${op}(${field}, ${boundary})` });
    examples.push({ name: 'Between two values', explanation: '10 through 20, including both ends. Combines two comparisons with AND.', query: `and(gte(${field}, ${number(10)}), lte(${field}, ${number(20)}))` });
  }
  if (attribute.type === 'str') examples.push({ name: 'Starts with', explanation: `Match text beginning with ${prefix}. Case-sensitive; this is not a search anywhere inside the text.`, query: `startsWith(${field}, ${JSON.stringify(prefix)})` });
  if (attribute.type === 'bool') examples[0].explanation = 'Match false (for example, an unused ticket). Use true for the other value.';
  examples.push({ name: 'Does not match · NOT', explanation: 'Invert a condition. This also includes entities where this attribute is missing; it is not SQL != or IS NOT NULL.', query: `not(${examples[0].query})` });
  return examples;
}

export function filterGuide(attribute: Attribute | undefined): HTMLElement {
  const details = document.createElement('details');details.className = 'field-filters';
  const summary = document.createElement('summary');summary.textContent = attribute ? `Available filters · ${attribute.type}` : 'Query mapping needs a decision';details.append(summary);
  if (!attribute) return details;
  const list = document.createElement('ul');list.className = 'filter-examples';
  for (const example of filterExamples(attribute)) {
    const item = document.createElement('li');item.textContent = example.name;list.append(item);
  }
  details.append(list);return details;
}
