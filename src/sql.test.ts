/**
 * sql.test.ts — the parser against DDL people actually write.
 *
 * The cases that matter are the ones where a tolerant regex would quietly
 * produce a WRONG column and the tool would then price a model that is not the
 * user's schema. Those are worse than a parse error, so each one gets a test.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parseSchema } from "./sql.ts";

const col = (t: ReturnType<typeof parseSchema>["tables"][number], name: string) =>
  t.columns.find((c) => c.name === name);

describe("the workshop seed", () => {
  const sql = `
    CREATE TABLE users (
      id            SERIAL PRIMARY KEY,
      wallet        TEXT,
      display_name  TEXT,
      reputation    NUMERIC(6,2) DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE listings (
      id          SERIAL PRIMARY KEY,
      seller_id   INTEGER REFERENCES users(id),
      title       TEXT,
      price_eur   NUMERIC(10,2),
      status      TEXT,              -- 'open' | 'sold'
      expires_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `;
  const { tables, issues } = parseSchema(sql);

  it("reads both tables and every column", () => {
    assert.deepEqual(tables.map((t) => t.name), ["users", "listings"]);
    assert.equal(tables[0]!.columns.length, 5);
    assert.equal(tables[1]!.columns.length, 7);
    assert.deepEqual(issues, []);
  });

  it("keeps NUMERIC(10,2) in one piece instead of splitting on its comma", () => {
    const price = col(tables[1]!, "price_eur")!;
    assert.equal(price.baseType, "numeric");
    assert.deepEqual(price.params, [10, 2]);
  });

  it("reads the inline foreign key", () => {
    assert.deepEqual(col(tables[1]!, "seller_id")!.references, { table: "users", column: "id" });
  });

  it("reads the primary key and the defaults", () => {
    assert.equal(col(tables[0]!, "id")!.isPrimaryKey, true);
    assert.equal(col(tables[0]!, "reputation")!.hasDefault, true);
    assert.equal(col(tables[1]!, "title")!.hasDefault, false);
  });

  it("does not let a trailing -- comment leak into a column type", () => {
    // `status TEXT, -- 'open' | 'sold'` is where a naive split eats the comment.
    const status = col(tables[1]!, "status")!;
    assert.equal(status.baseType, "text");
    assert.equal(status.type, "text");
  });
});

describe("table-level constraints", () => {
  const { tables } = parseSchema(`
    CREATE TABLE memberships (
      user_id INT NOT NULL,
      org_id  INT NOT NULL,
      role    VARCHAR(32),
      PRIMARY KEY (user_id, org_id),
      FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_org FOREIGN KEY (org_id) REFERENCES orgs(id),
      CHECK (role <> '')
    );
  `);

  it("does not turn a constraint clause into a column", () => {
    assert.deepEqual(
      tables[0]!.columns.map((c) => c.name),
      ["user_id", "org_id", "role"],
    );
  });

  it("applies a composite primary key declared after the columns", () => {
    assert.equal(col(tables[0]!, "user_id")!.isPrimaryKey, true);
    assert.equal(col(tables[0]!, "org_id")!.isPrimaryKey, true);
    assert.equal(col(tables[0]!, "role")!.isPrimaryKey, false);
  });

  it("applies both table-level foreign keys, named and unnamed", () => {
    assert.deepEqual(col(tables[0]!, "user_id")!.references, { table: "users", column: "id" });
    assert.deepEqual(col(tables[0]!, "org_id")!.references, { table: "orgs", column: "id" });
  });
});

describe("types people actually write", () => {
  const { tables } = parseSchema(`
    CREATE TABLE things (
      a CHARACTER VARYING(255),
      b DOUBLE PRECISION,
      c TEXT[],
      d TIMESTAMP WITH TIME ZONE,
      e JSONB NOT NULL,
      f BYTEA,
      g BOOLEAN DEFAULT false,
      h UUID
    );
  `);
  const t = tables[0]!;

  it("keeps multi-word types whole", () => {
    assert.equal(col(t, "a")!.baseType, "character varying");
    assert.deepEqual(col(t, "a")!.params, [255]);
    assert.equal(col(t, "b")!.baseType, "double precision");
    assert.equal(col(t, "d")!.baseType, "timestamp with time zone");
  });

  it("flags arrays, because attributes have no array type", () => {
    assert.equal(col(t, "c")!.isArray, true);
    assert.equal(col(t, "c")!.baseType, "text");
  });

  it("reads NOT NULL without swallowing it into the type", () => {
    assert.equal(col(t, "e")!.baseType, "jsonb");
    assert.equal(col(t, "e")!.notNull, true);
    assert.equal(col(t, "g")!.notNull, false);
  });
});

describe("input that is not just CREATE TABLE", () => {
  it("says what it skipped instead of pretending it read everything", () => {
    const { tables, issues } = parseSchema(`
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE INDEX idx_a ON a(id);
      ALTER TABLE a ADD COLUMN b TEXT;
    `);
    assert.equal(tables.length, 1);
    assert.equal(issues.length, 2);
    assert.match(issues[0]!.message, /CREATE INDEX/);
    assert.match(issues[1]!.message, /ALTER TABLE/);
  });

  it("does not report a keyword that appears inside a table body", () => {
    // `check (...)` and a column literally named "alter table" bait would both
    // trip a naive scan of the whole file.
    const { issues } = parseSchema(`
      CREATE TABLE a (
        id INT PRIMARY KEY,
        note TEXT DEFAULT 'alter table is not a statement here'
      );
    `);
    assert.deepEqual(issues, []);
  });

  it("survives a quoted identifier and a schema qualifier", () => {
    const { tables } = parseSchema(`CREATE TABLE public."Order Lines" ("Qty" INT);`);
    assert.equal(tables[0]!.name, "public.Order Lines");
    assert.equal(tables[0]!.columns[0]!.name, "Qty");
  });

  it("reports an unclosed statement rather than reading half a table", () => {
    const { tables, issues } = parseSchema(`CREATE TABLE broken (id INT`);
    assert.equal(tables.length, 0);
    assert.match(issues[0]!.message, /closing parenthesis/);
  });

  it("returns nothing, and no crash, for input that is not SQL at all", () => {
    const { tables, issues } = parseSchema("my app has users and listings");
    assert.deepEqual(tables, []);
    assert.equal(issues.length, 1);
  });
});

describe("SQL lexical boundaries", () => {
  it("does not lose columns after quoted punctuation", () => {
    const parsed = parseSchema('CREATE TABLE t ("a,b" text DEFAULT \')\', status int, note text DEFAULT $tag$-- ( ,$tag$);');
    assert.deepEqual(parsed.issues, []);
    assert.deepEqual(parsed.tables[0]!.columns.map(c => c.name), ['a,b', 'status', 'note']);
  });
  it("preserves distinct namespaces and bounded arrays", () => {
    const parsed = parseSchema('CREATE TABLE a.t (tags int[3]); CREATE TABLE b.t (tags text[]);');
    assert.deepEqual(parsed.tables.map(t => t.name), ['a.t', 'b.t']);
    assert.ok(parsed.tables.every(t => t.columns[0]!.isArray));
    assert.equal(parsed.tables[0]!.columns[0]!.type, "int[3]");
  });
  it("preserves all declared array dimensions and bounds without treating them as value validation", () => {
    const parsed = parseSchema("CREATE TABLE t (matrix int[3][4], flexible numeric(20,8)[][], spaced text [ 2 ] [ ]);");
    assert.deepEqual(parsed.issues, []);
    assert.deepEqual(parsed.tables[0]!.columns.map(c => c.type), ["int[3][4]", "numeric(20,8)[][]", "text[2][]"]);
    assert.deepEqual(parsed.tables[0]!.columns.map(c => c.baseType), ["int", "numeric", "text"]);
    assert.ok(parsed.tables[0]!.columns.every(c => c.isArray));
  });
  it("reports unsupported statements and unclosed input", () => {
    for (const sql of ['CREATE FUNCTION f() RETURNS void;', "CREATE TABLE t (v text DEFAULT 'bad);", '/* unclosed']) {
      assert.ok(parseSchema(sql).issues.length);
    }
  });
  it("does not interpret quoted constraint words", () => {
    const parsed = parseSchema("/* outer /* inner */ outer */ CREATE TABLE t (v text DEFAULT 'primary key not null unique');");
    assert.deepEqual(parsed.issues, []);
    assert.equal(parsed.tables[0]!.columns[0]!.isPrimaryKey, false);
    assert.equal(parsed.tables[0]!.columns[0]!.notNull, false);
  });
});
