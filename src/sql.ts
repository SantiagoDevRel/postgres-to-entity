/**
 * sql.ts — a small, deliberately narrow Postgres DDL reader.
 *
 * It reads `CREATE TABLE` and nothing else. That is a feature: a tolerant
 * regex that "mostly works" on arbitrary SQL is how a tool quietly mis-reads a
 * column and then prices a model that is not the user's. Anything it does not
 * understand is reported with a line number, never guessed at.
 *
 * No LLM, no network, no dependencies: this has to run instantly, offline, in a
 * room with dead wifi.
 */

/** A column, as written in the DDL. Nothing Arkiv-specific yet. */
export type Column = {
  readonly name: string;
  /** The type as written, lowercased: `varchar(255)`, `numeric(10,2)`, `text[]`. */
  readonly type: string;
  /** Base type without parameters or the array suffix: `varchar`, `numeric`. */
  readonly baseType: string;
  /** `varchar(255)` -> [255]; `numeric(10,2)` -> [10, 2]. */
  readonly params: readonly number[];
  readonly isArray: boolean;
  readonly notNull: boolean;
  readonly isPrimaryKey: boolean;
  readonly isUnique: boolean;
  readonly references?: { readonly table: string; readonly column: string };
  readonly hasDefault: boolean;
  /** 1-based line in the input, so an error can point at it. */
  readonly line: number;
};

export type Table = {
  readonly name: string;
  readonly columns: readonly Column[];
  readonly line: number;
  /** Source constraints need application-level equivalents, not silent removal. */
  readonly constraints?: readonly string[];
};

export type ParseIssue = {
  readonly line: number;
  readonly message: string;
};

export type ParsedSchema = {
  readonly tables: readonly Table[];
  /** Statements or clauses we skipped, so nothing is silently dropped. */
  readonly issues: readonly ParseIssue[];
};

/** Strips `--` line comments and block comments, preserving newlines and string literals. */
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      if (end < 0) throw new Error("Unclosed dollar-quoted string.");
      out += sql.slice(i, end + dollar[0].length);
      i = end + dollar[0].length;
    } else if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
    } else if (two === "/*") {
      i += 2;
      let nested = 1;
      while (i < sql.length && nested > 0) {
        if (sql.slice(i, i + 2) === "/*") { nested++; i += 2; continue; }
        if (sql.slice(i, i + 2) === "*/") { nested--; i += 2; continue; }
        if (sql[i] === "\n") out += "\n"; // keep line numbers honest
        i += 1;
      }
      if (nested) throw new Error("Unclosed SQL comment.");
      out += " ";
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]!;
      out += sql[i];
      i += 1;
      let closed = false;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === quote) {
          // '' and "" are escapes for the quote character itself.
          if (sql[i + 1] === quote) {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) throw new Error("Unclosed quoted SQL value or identifier.");
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Splits on commas at paren depth zero, so `numeric(10,2)` stays in one piece. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  const structural = maskQuoted(body);
  for (let i = 0; i < body.length; i += 1) {
    const ch = structural[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += body[i];
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const unquote = (raw: string) =>
  raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();

/** Same offsets, but quoted content cannot act as SQL punctuation or keywords. */
function maskQuoted(source: string): string {
  return source.replace(/(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\1|'(?:[^']|'')*'|"(?:[^"]|"")*"/g,
    (value) => value.replace(/[^\n]/g, " "));
}

/**
 * Words that can only follow a type, never be part of one. A type is read by
 * consuming words until one of these appears, which is what keeps
 * `character varying(255)`, `double precision` and `timestamp with time zone`
 * in one piece — a first attempt matched only the first word of each.
 */
const MODIFIER_WORDS = new Set([
  "not", "null", "primary", "key", "references", "default", "unique", "check",
  "constraint", "collate", "generated", "always", "identity", "stored", "as",
  "deferrable", "initially", "on", "delete", "update", "cascade", "restrict",
]);

/** Reads the type at the start of `rest`, returning it and how much it used. */
function readType(rest: string): { raw: string; length: number } {
  let i = 0;
  let words = 0;
  while (i < rest.length) {
    const wsMatch = /^\s*/.exec(rest.slice(i))!;
    const wordStart = i + wsMatch[0].length;
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest.slice(wordStart));
    if (!word) break;
    if (words > 0 && MODIFIER_WORDS.has(word[0].toLowerCase())) break;
    i = wordStart + word[0].length;
    words += 1;

    // Parameters close the type name: `varchar(255) NOT NULL` ends here.
    const paren = /^\s*\(/.exec(rest.slice(i));
    if (paren) {
      let depth = 0;
      let j = i + paren[0].length - 1;
      for (; j < rest.length; j += 1) {
        if (rest[j] === "(") depth += 1;
        else if (rest[j] === ")") {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      i = j;
      break;
    }
  }
  // Any number of array suffixes, with or without a size: `text[]`, `int[3][]`.
  const timezone = /^\s+(?:with|without)\s+time\s+zone\b/i.exec(rest.slice(i));
  if (timezone) i += timezone[0].length;
  let arrays = /^(\s*\[\s*\d*\s*\])+/.exec(rest.slice(i));
  if (arrays) i += arrays[0].length;
  return { raw: rest.slice(0, i).trim(), length: i };
}

/** Splits `public."Order Lines"` on the dot without cutting inside the quotes. */
function splitQualified(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "." && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** Table-level constraints we recognise and must not mistake for columns. */
const CONSTRAINT_STARTS =
  /^\s*(constraint\b|primary\s+key\b|foreign\s+key\b|unique\b|check\b|exclude\b)/i;

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

/**
 * Reads every `CREATE TABLE` in `sql`.
 *
 * Deliberately ignores everything else — indexes, views, functions, ALTER — but
 * records each skipped statement as an issue so the UI can say what it did not
 * read rather than pretending the input was fully understood.
 */
export function parseSchema(sql: string): ParsedSchema {
  let clean: string;
  try { clean = stripComments(sql); }
  catch (error) { return { tables: [], issues: [{ line: 1, message: String(error) }] }; }
  const structural = maskQuoted(clean);
  const tables: Table[] = [];
  const issues: ParseIssue[] = [];

  // The name may be quoted and may therefore contain spaces and dots, and it may
  // be schema-qualified. `[^\s(]+` silently truncated `public."Order Lines"`.
  const IDENT = String.raw`(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)`;
  const createRe = new RegExp(
    String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(${IDENT}(?:\s*\.\s*${IDENT})*)\s*\(`,
    "gi",
  );
  let match: RegExpExecArray | null;
  const consumed: Array<[number, number]> = [];

  while ((match = createRe.exec(clean)) !== null) {
    if (structural.slice(match.index, match.index + 6).toLowerCase() !== "create") continue;
    const openParen = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = openParen; i < clean.length; i += 1) {
      if (structural[i] === "(") depth += 1;
      else if (structural[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) {
      issues.push({
        line: lineOf(clean, match.index),
        message: `CREATE TABLE ${match[1]} is missing its closing parenthesis.`,
      });
      continue;
    }
    consumed.push([match.index, end]);

    const rawName = match[1]!;
    const name = splitQualified(rawName).map(unquote).join(".");
    const body = clean.slice(openParen + 1, end);

    const columns: Column[] = [];
    const constraints: string[] = [];
    // Table-level PRIMARY KEY / FOREIGN KEY arrive after the columns, so collect
    // them first and apply them once every column exists.
    const pkNames = new Set<string>();
    const fks = new Map<string, { table: string; column: string }>();

    for (const part of splitTopLevel(body)) {
      const text = part.trim();
      if (!text) continue;

      if (CONSTRAINT_STARTS.test(text)) {
        constraints.push(text);
        const constraint = text.replace(new RegExp("^constraint\\s+" + IDENT + "\\s+", "i"), "");
        const pk = /^primary\s+key\s*\(([^)]*)\)/i.exec(constraint);
        if (pk) for (const c of splitTopLevel(pk[1]!)) pkNames.add(unquote(c.trim()));

        const fk = new RegExp("^foreign\\s+key\\s*\\(([^)]*)\\)\\s*references\\s+(" + IDENT + "(?:\\s*\\.\\s*" + IDENT + ")*)\\s*(?:\\(([^)]*)\\))?", "i").exec(constraint);
        if (fk) {
          const locals = splitTopLevel(fk[1]!).map((c) => unquote(c.trim()));
          const target = splitQualified(fk[2]!).map(unquote).join(".");
          if (!fk[3]) {
            issues.push({ line: lineOf(clean, openParen), message: "REFERENCES requires explicit target columns; the primary key is not assumed to be id." });
            continue;
          }
          const targetCols = splitTopLevel(fk[3]).map((c) => unquote(c.trim()));
          if (locals.length !== targetCols.length) {
            issues.push({ line: lineOf(clean, openParen), message: "Foreign-key source and target column counts differ." });
            continue;
          }
          locals.forEach((local, i) =>
            fks.set(local, { table: target, column: targetCols[i] ?? targetCols[0] ?? "id" }),
          );
        }
        continue;
      }

      const nameMatch = /^("(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s+([\s\S]+)$/.exec(text);
      if (!nameMatch) {
        issues.push({
          line: lineOf(clean, openParen) ,
          message: `Could not read this as a column: ${text.slice(0, 60)}`,
        });
        continue;
      }
      const colName = unquote(nameMatch[1]!);
      const rest = nameMatch[2]!;

      // The type runs until the first modifier keyword, keeping parenthesised
      // parameters and array suffixes attached.
      const typeRead = readType(rest);
      const rawType = typeRead.raw;
      const modifiers = rest.slice(typeRead.length);
      const modifierStructure = maskQuoted(modifiers);
      if (!rawType || /^\s*\./.test(modifiers)) {
        issues.push({ line: lineOf(clean, openParen), message: "Unsupported or incomplete type for " + colName + ". Normalize this source type explicitly." });
      }

      const isArray = /\[\s*\d*\s*\]/.test(rawType);
      const typeNoArray = rawType.replace(/\[\s*\d*\s*\]/g, "").trim();
      const paramMatch = /\(([^)]*)\)/.exec(typeNoArray);
      const params = paramMatch
        ? paramMatch[1]!.split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n))
        : [];
      const baseType = typeNoArray.replace(/\s*\([^)]*\)/, "").trim().toLowerCase();

      const fkStart = modifierStructure.search(/\breferences\b/i);
      const inlineFk = fkStart < 0 ? null : new RegExp("^references\\s+(" + IDENT + "(?:\\s*\\.\\s*" + IDENT + ")*)\\s*(?:\\(([^)]*)\\))?", "i").exec(modifiers.slice(fkStart));
      if (fkStart >= 0 && !inlineFk?.[2]) {
        issues.push({ line: lineOf(clean, openParen), message: "REFERENCES requires explicit target columns; the primary key is not assumed to be id." });
      }

      columns.push({
        name: colName,
        type: typeNoArray.toLowerCase() + (rawType.match(/\[\s*\d*\s*\]/g) ?? []).map(suffix => suffix.replace(/\s/g, "")).join(""),
        baseType,
        params,
        isArray,
        notNull: /\bnot\s+null\b/i.test(modifierStructure),
        isPrimaryKey: /\bprimary\s+key\b/i.test(modifierStructure),
        isUnique: /\bunique\b/i.test(modifierStructure),
        ...(inlineFk
          ? {
              references: {
                table: splitQualified(inlineFk[1]!).map(unquote).join("."),
                column: inlineFk[2] ? unquote(inlineFk[2].trim()) : "id",
              },
            }
          : {}),
        hasDefault: /\bdefault\b/i.test(modifierStructure),
        line: lineOf(clean, openParen),
      });
      if (modifierStructure.trim()) {
        constraints.push(text);
      }
    }

    const withConstraints = columns.map((c) => ({
      ...c,
      isPrimaryKey: c.isPrimaryKey || pkNames.has(c.name),
      ...(c.references ?? fks.has(c.name) ? { references: c.references ?? fks.get(c.name)! } : {}),
    }));

    tables.push({ name, columns: withConstraints, line: lineOf(clean, match.index), constraints });
  }

  // Report other statements rather than dropping them in silence.
  let remainder = clean.split("");
  for (const [start, end] of consumed) for (let i = start; i <= end; i++) remainder[i] = clean[i] === "\n" ? "\n" : " ";
  for (const statement of remainder.join("").split(";")) {
    if (!statement.trim()) continue;
    issues.push({
      line: 1,
      message: `Unsupported or incomplete statement: ${statement.trim().slice(0, 100)} — only CREATE TABLE is read.`,
    });
  }

  return { tables, issues };
}
