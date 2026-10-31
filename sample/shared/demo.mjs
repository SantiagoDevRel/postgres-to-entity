import { generateModel, toSdkSchema, MAX_LIFETIME_BLOCKS } from 'postgres-to-entity';

export const demoId = '00000000-0000-4000-8000-000000000031';
export const demoSource = 'p2e_rabdi_demo_tasks';
export const demoRequest = {
  sql: `CREATE TABLE ${demoSource} (id UUID PRIMARY KEY, score INTEGER NOT NULL, title VARCHAR(24) NOT NULL, body BYTEA);`,
  project: 'postgres-to-entity-rabdi-v1',
  filters: [{ table: demoSource, column: 'id', operator: 'eq' }, { table: demoSource, column: 'score', operator: 'range' }],
  privacyReviewed: true,
  policies: [{ table: demoSource, owner: 'Connected signing wallet', expiration: 'Bounded maximum duration; Lifetime Extension only with owner authorization', expirationBlocks: MAX_LIFETIME_BLOCKS }],
};
export function generatedDemo(request = demoRequest) {
  const model = generateModel(request);
  if (model.status !== 'modelled') throw new Error('Generated demo schema has unresolved model decisions.');
  return { model, entity: model.entities[0], schema: toSdkSchema(model.entities[0]) };
}
