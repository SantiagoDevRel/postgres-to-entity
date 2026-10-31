import * as sdk from '@arkiv-network/sdk/schema';
import type { EntityDesign } from './planner.ts';

/** Build the declared SDK schema without connecting or writing. */
export function toSdkSchema(entity: EntityDesign): sdk.Schema {
  const columns: Record<string, sdk.AnyColumn> = Object.create(null);
  for (const spec of entity.schema.columns) {
    const column = sdk[spec.type]();
    if (spec.indexed && !('indexed' in column)) throw new Error('bytes columns cannot be indexed.');
    const indexed = spec.indexed && 'indexed' in column ? column.indexed() : column;
    columns[spec.name] = spec.nullable ? indexed.optional() : indexed;
  }
  return sdk.defineSchema(entity.schema.name, columns);
}
