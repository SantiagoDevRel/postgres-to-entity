import { generateModel, modelMarkdown } from 'postgres-to-entity';

self.onmessage = ({ data }) => {
  const model = generateModel(data);
  const sourceModel = generateModel({ sql: data.sql });
  const attributeLimits = sourceModel.entities.flatMap(entity => entity.payload.filter(field => /^(text|varchar|character varying)(?:\(\d+\))?$/.test(field.sourceType)).map(field => ({...field.source,maxBytes:128})));
  // Inspect the installed converter's actual encodings. Unsupported fields have no mapping.
  const queryModel = generateModel({ sql: data.sql, attributeLimits, filters: sourceModel.entities.flatMap(entity => entity.payload
    .filter(field => !/\[/.test(field.sourceType)).map(field => ({ ...field.source, operator: 'eq' }))) });
  self.postMessage({ model, sourceModel, queryModel, markdown: modelMarkdown(model) });
};
