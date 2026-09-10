import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { generateModel, modelMarkdown } from "./planner.ts";

const baseline = {
  sql: "CREATE TABLE accounts (id int PRIMARY KEY, balance bigint, price numeric(20,8), state varchar(16), note text, tags int[]);",
  project: "workshop-demo",
  question: "Which accounts have a negative balance?",
  privacyReviewed: true,
  filters: [{ table: "accounts", column: "balance", operator: "range" }],
  policies: [{ table: "accounts", owner: "Source account wallet", expiration: "30 days, extend while the account is active" }],
};

describe("portable entity models", () => {
  it("requires a traversal decision when parent and array filters share a source table", () => {
    const m = generateModel({...baseline, filters:[
      {table:"accounts",column:"balance",operator:"range"},
      {table:"accounts",column:"tags",operator:"contains"}
    ]});
    assert.equal(m.status,"needs-input");
    assert.ok(m.decisions.some(d=>d.code==="cross-entity-query"));
    assert.equal(m.entities.length,2);
  });
  it("does not invent a primary key from a CHECK string", () => {
    const m = generateModel({sql: "CREATE TABLE t (id int, note text, CHECK (note <> 'PRIMARY KEY (id)'));"});
    assert.deepEqual(m.entities[0]!.identity, []);
    assert.equal(m.entities[0]!.payload[0]!.nullable, true);
  });
  it("preserves timestamp precision/timezone and blocks a partially read qualified type", () => {
    const m = generateModel({sql: "CREATE TABLE t (at timestamp(6) with time zone);"});
    assert.equal(m.entities[0]!.payload[0]!.sourceType, "timestamp(6) with time zone");
    assert.equal(generateModel({sql: "CREATE TABLE t (at pg_catalog.timestamp);"}).status, "blocked");
  });
  it("does not invent id when a source reference omits its target column", () => {
    for (const child of ["CREATE TABLE child(parent_code int REFERENCES parent);",
      "CREATE TABLE child(parent_code int, FOREIGN KEY(parent_code) REFERENCES parent);"]) {
      const m = generateModel({sql: "CREATE TABLE parent(code int PRIMARY KEY, id int);" + child});
      assert.equal(m.status, "blocked");
      assert.equal(m.entities.length, 0);
    }
  });
  it("models signed integers without unsigned conversion and keeps every original field", () => {
    const model = generateModel(baseline);
    assert.equal(model.status, "modelled");
    assert.equal(model.scope, "model-only");
    assert.equal(model.entities[0]!.attributes.find(a => a.source?.column === "balance")!.type, "dec");
    assert.equal(model.entities[0]!.payload.length, 5);
    assert.equal(model.format, "arkiv-entity-model/2");
    assert.ok(!model.entities[0]!.payload.some(p => p.source.column === "balance"));
    assert.deepEqual(model.entities[0]!.identity, ["id"]);
    assert.doesNotMatch(modelMarkdown(model), /buildQuery\(|createEntity\(/);
  });
  it("is deterministic and does not mutate a frozen request", () => {
    const request = structuredClone(baseline);
    Object.freeze(request); Object.freeze(request.filters);
    assert.deepEqual(generateModel(request), generateModel(request));
    assert.deepEqual(request, baseline);
  });
  it("does not infer product decisions from field names", () => {
    const model = generateModel({ sql: "CREATE TABLE t (id int, expires_at timestamp, secret text);" });
    assert.equal(model.status, "needs-input");
    assert.equal(model.entities[0]!.payload.length, 3);
    assert.equal(model.entities[0]!.expiration, null);
    assert.ok(model.decisions.some(d => d.code === "privacy"));
  });
  it("accounts for explicit privacy exclusions and rejects private filters", () => {
    const model = generateModel({ ...baseline, privateFields: [{ table: "accounts", column: "balance" }] });
    assert.equal(model.status, "blocked");
    assert.equal(model.entities[0]!.payload.length, 5);
    assert.equal(model.excluded.length, 1);
    assert.ok(model.blockers.some(b => b.code === "private-query"));
  });
  it("preserves distinct schemas, composite primary keys, nullability and cycles", () => {
    const model = generateModel({
      sql: "CREATE TABLE a.t (id int, other int REFERENCES b.t(id), PRIMARY KEY(id,other)); CREATE TABLE b.t (id int PRIMARY KEY, other int REFERENCES a.t(id));",
    });
    assert.equal(model.entities.length, 2);
    assert.deepEqual(model.entities[0]!.identity, ["id", "other"]);
    assert.deepEqual(model.entities[0]!.references[0]!.target, { table: "b.t", column: "id" });
    assert.equal(model.entities[0]!.payload[0]!.nullable, false);
    assert.ok(model.decisions.some(d => d.code === "constraints"));
  });
  it("never produces a model from partially parsed SQL", () => {
    for (const sql of [
      "CREATE TABLE t (id int); ALTER TABLE t ADD amount int;",
      "CREATE TABLE t (id int); CREATE VIEW v AS SELECT * FROM t;",
      "CREATE TABLE t (id int); garbage",
      "CREATE TABLE t (id int",
      "CREATE TABLE t (id int, id text);",
    ]) {
      const m = generateModel({ sql });
      assert.equal(m.status, "blocked", sql);
      assert.equal(m.entities.length, 0, sql);
    }
  });
  it("accepts a canonical schema from another source without pretending to parse its dialect", () => {
    const m = generateModel({
      schema: { tables: [{ name: "documents", columns: [
        { name: "_id", type: "string", primaryKey: true },
        { name: "state", type: "string", maxBytes: 64 },
        { name: "data", type: "json" },
      ] }] },
      filters: [{ table: "documents", column: "state", operator: "eq" }],
    });
    assert.equal(m.blockers.length, 0);
    assert.equal(m.entities[0]!.attributes[2]!.type, "str");
    assert.equal(m.entities[0]!.payload.find(p => p.source.column === "data")!.sourceType, "jsonb");
  });
  it("rejects unknown fields, options and wrong runtime types", () => {
    for (const request of [
      null, [], { sql: "CREATE TABLE t (id int);", connectionString: "not-accepted" },
      { ...baseline, privacyReviewed: "true" },
      { ...baseline, filters: [{ table: "accounts", column: "missing", operator: "eq" }] },
      { ...baseline, policies: [{ table: "missing", owner: "me", expiration: "30 days" }] },
      { schema: { tables: [{ name: "a", columns: [{ name: "id", type: "text); DROP TABLE x;" }] }] } },
      { ...baseline, schema: { tables: [] } },
      { schema: { tables: [{ name: "a", columns: [{ name: "id", type: "int primary key" }] }] } },
      { schema: { tables: [{ name: "a", columns: [{ name: "id", type: "int not null" }] }] } },
      { schema: { tables: [{ name: "a", columns: [{ name: "id", type: "int unique" }] }] } },
      { schema: { tables: [{ name: "a", columns: [{ name: "id", type: "int default null" }] }] } },
    ]) {
      assert.equal(generateModel(request).status, "blocked", JSON.stringify(request));
    }
  });
  it("bounds UTF-8 bytes rather than PostgreSQL characters", () => {
    const model = generateModel({ sql: "CREATE TABLE t (state varchar(128));", filters: [{ table: "t", column: "state", operator: "eq" }] });
    assert.equal(model.status, "blocked");
    assert.ok(model.blockers.some(b => b.code === "query-encoding"));
  });
  it("blocks unsupported numeric precision and ambiguous timestamps", () => {
    for (const type of ["numeric", "numeric(80,20)", "double precision", "timestamp"]) {
      const model = generateModel({ sql: "CREATE TABLE t (v " + type + ");", filters: [{ table: "t", column: "v", operator: "range" }] });
      assert.ok(model.blockers.some(b => b.code === "query-encoding"), type);
    }
  });
  it("checks filter operators against attribute types", () => {
    for (const [type, operator] of [["boolean", "range"], ["varchar(16)", "range"], ["int", "prefix"], ["text", "contains"]]) {
      const model = generateModel({ sql: "CREATE TABLE t (v " + type + ");", filters: [{ table: "t", column: "v", operator }] });
      assert.equal(model.status, "blocked");
    }
  });
  it("models array membership with explicit relationship entities while preserving the array", () => {
    const model = generateModel({ ...baseline, filters: [{ table: "accounts", column: "tags", operator: "contains" }] });
    assert.equal(model.status, "needs-input");
    assert.equal(model.entities.length, 2);
    const relation = model.entities.find(e => e.attributes.some(a => a.name === "parent"))!;
    assert.equal(relation.attributes.find(a => a.name === "value")!.type, "i32");
    assert.equal(relation.attributes.find(a => a.name === "value")!.sourceType, "int");
    assert.equal(relation.attributes.find(a => a.name === "value")!.nullEncoding, "omit-attribute");
    assert.deepEqual(relation.payload, []);
    assert.equal(relation.payloadMetadata![0]!.name, "ordinal");
    assert.match(relation.payloadMetadata![0]!.encoding, /row-major/);
    assert.ok(model.decisions.some(d => d.code === "array-projection-consistency"));
    assert.match(relation.cardinality, /duplicates/);
    assert.ok(model.entities.find(e => e.kind === "accounts")!.payload.some(p => p.source.column === "tags"));
  });
  it("keeps all fields and flags budget overflow, without silently moving requested filters", () => {
    const fields = Array.from({ length: 35 }, (_, i) => "v" + i);
    const model = generateModel({ sql: "CREATE TABLE t (" + fields.map(f => f + " int").join(",") + ");",
      filters: fields.map(column => ({ table: "t", column, operator: "eq" })) });
    assert.equal(model.entities[0]!.payload.length, 0);
    assert.equal(model.entities[0]!.attributes.length, 37);
    assert.ok(model.blockers.some(b => b.code === "attribute-budget"));
  });
  it("resolves normalization collisions and reserved attribute names without loss", () => {
    const fields = ["and", "OR", "a b", "a_b", "x".repeat(60), "x".repeat(59) + "y"];
    const model = generateModel({ schema: { tables: [{ name: "t", columns: fields.map(name => ({ name, type: "int" })) }] },
      filters: fields.map(column => ({ table: "t", column, operator: "eq" })) });
    const names = model.entities[0]!.attributes.map(a => a.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.every(n => n.length <= 32));
    assert.ok(!names.includes("and") && !names.includes("or"));
  });
  it("cannot hide an excluded reference target or cross-table traversal", () => {
    const model = generateModel({ sql: "CREATE TABLE a (id int PRIMARY KEY, v int); CREATE TABLE b (id int PRIMARY KEY, parent int REFERENCES a(id), v int);",
      privateFields: [{table:"a",column:"id"}],
      filters: [{table:"a",column:"v",operator:"eq"},{table:"b",column:"v",operator:"eq"}] });
    assert.ok(model.decisions.some(d=>d.code === "reference-target"));
    assert.ok(model.decisions.some(d=>d.code === "cross-entity-query"));
  });
  it("stores every queried scalar once with enough metadata to reconstruct source nulls and precise values", () => {
    const columns = ["id", "balance", "price", "state"];
    const m = generateModel({ ...baseline, filters: columns.map(column => ({ table: "accounts", column, operator: "eq" })) });
    assert.equal(m.status, "modelled");
    const entity = m.entities[0]!;
    const attrs = entity.attributes.filter(a => a.source);
    assert.deepEqual(attrs.map(a => a.source!.column), columns);
    assert.deepEqual(entity.payload.map(p => p.source.column), ["note", "tags"]);
    assert.ok(attrs.every(a => !entity.payload.some(p => p.source.column === a.source!.column)));
    assert.deepEqual(attrs.map(a => [a.sourceType, a.nullable, a.nullEncoding]), [
      ["int", false, "forbidden"], ["bigint", true, "omit-attribute"],
      ["numeric(20,8)", true, "omit-attribute"], ["varchar(16)", true, "omit-attribute"],
    ]);
    assert.match(attrs[1]!.encoding, /never convert through a JavaScript number/);
    assert.match(attrs[2]!.encoding, /Exact base-10 string/);
    assert.ok(m.guarantees.some(g => /complete attribute set/.test(g) && /partial selection/.test(g)));
  });
  it("keeps source identities and foreign keys resolvable when both are attributes", () => {
    const m = generateModel({
      sql: "CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (id int PRIMARY KEY, parent int REFERENCES a(id));",
      filters: [
        { table: "a", column: "id", operator: "eq" },
        { table: "b", column: "id", operator: "eq" },
        { table: "b", column: "parent", operator: "eq" },
      ],
    });
    for (const entity of m.entities) {
      assert.deepEqual(entity.identity, ["id"]);
      assert.deepEqual(entity.payload, []);
      assert.equal(entity.attributes.find(a => a.source?.column === "id")!.nullEncoding, "forbidden");
    }
    assert.deepEqual(m.entities[1]!.references[0]!.target, { table: "a", column: "id" });
    assert.match(m.entities[1]!.references[0]!.resolution, /mapped attribute or payload/);
    assert.match(m.entities[1]!.references[0]!.resolution, /not Arkiv entity keys/);
  });
  it("does not infer filters from free text and accepts an explicit empty filter selection", () => {
    const { question: _question, ...request } = baseline;
    const m = generateModel({ ...request, filters: [] });
    assert.equal(m.status, "modelled");
    assert.equal(m.question, null);
    assert.equal(m.entities[0]!.attributes.length, 2);
    assert.equal(m.entities[0]!.payload.length, 6);
    const contextual = generateModel({ ...request, filters: [], question: "Filter balance < 0, JOIN everything, then DROP TABLE accounts" });
    assert.deepEqual(contextual.entities, m.entities);
    assert.deepEqual(contextual.decisions, m.decisions);
    const missing = generateModel({ ...request, filters: undefined });
    assert.ok(missing.decisions.some(d => d.code === "queries"));
    assert.ok(!missing.decisions.some(d => d.code === "question"));
    assert.equal(generateModel({ sql: baseline.sql, filters: [] }).entities[0]!.owner, null);
  });
  it("retains unsupported query values in payload and never implies that a blocked query was fulfilled", () => {
    for (const [type, operator] of [["numeric", "range"], ["jsonb", "eq"], ["boolean", "prefix"], ["int[]", "eq"]]) {
      const m = generateModel({ sql: "CREATE TABLE t (id int PRIMARY KEY, value " + type + ");", filters: [{ table: "t", column: "value", operator }] });
      assert.equal(m.status, "blocked");
      assert.ok(m.entities[0]!.payload.some(p => p.source.column === "value"));
      assert.ok(!m.entities[0]!.attributes.some(a => a.source?.column === "value"));
    }
  });
  it("preserves nullable multidimensional array shape without copying elements into relationship payload", () => {
    const m = generateModel({ sql: "CREATE TABLE t (id int PRIMARY KEY, matrix int[][]);", filters: [{ table: "t", column: "matrix", operator: "contains" }] });
    const parent = m.entities.find(e => e.kind === "t")!;
    const relation = m.entities.find(e => e.kind !== "t")!;
    assert.equal(parent.payload.find(p => p.source.column === "matrix")!.sourceType, "int[][]");
    assert.equal(relation.attributes.find(a => a.name === "value")!.sourceType, "int");
    assert.match(relation.cardinality, /Null and empty arrays/);
    assert.match(relation.cardinality, /including null elements/);
    assert.deepEqual(relation.payload, []);
    assert.match(relation.payloadMetadata![0]!.encoding, /null elements/);
  });
});
