import { generateModel, modelMarkdown } from 'postgres-to-entity';

self.onmessage = ({ data }) => {
  const model = generateModel(data);
  const sourceModel = generateModel({ sql: data.sql });
  self.postMessage({ model, sourceModel, markdown: modelMarkdown(model) });
};
