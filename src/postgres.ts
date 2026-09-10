import { generateModel as plan, modelMarkdown } from './planner.ts';
import type { ModelRequest as InternalRequest, EntityModel } from './planner.ts';
export type { EntityModel, EntityDesign, Filter, FieldRef, DesignIssue } from './planner.ts';
export type ModelRequest = Omit<InternalRequest, 'schema' | 'sql'> & { sql: string };
/** PostgreSQL CREATE TABLE definitions only. No row import or chain writes. */
export function generateModel(request: unknown): EntityModel {
  if (!request || typeof request !== 'object' || typeof (request as ModelRequest).sql !== 'string' || (request as InternalRequest).schema !== undefined) {
    const result = plan({sql:''});
    result.blockers = [{code:'postgres-required',message:'Provide PostgreSQL CREATE TABLE definitions in sql. JSON Schema, document rows and other database dialects are not supported inputs.'}];
    return result;
  }
  const {schema: _internal, ...sqlRequest} = request as InternalRequest;
  return plan(sqlRequest);
}
export { modelMarkdown };
