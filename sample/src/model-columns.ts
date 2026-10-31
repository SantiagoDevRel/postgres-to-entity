import type { EntityDesign, ModelColumn, FieldRef } from 'postgres-to-entity';

export type SourceColumn = ModelColumn & { source: FieldRef; sourceType: string };
export const sourceColumns = (entity: EntityDesign): SourceColumn[] => entity.schema.columns.filter(
  (column): column is SourceColumn => column.source !== null && column.sourceType !== undefined,
);
export const indexedColumns = (entity: EntityDesign) => sourceColumns(entity).filter(c => c.indexed);
export const storedColumns = (entity: EntityDesign) => sourceColumns(entity).filter(c => !c.indexed);
