// Filter query language: Todoist-subset grammar over tasks.
//
// Grammar (keywords case-insensitive):
//   expr   := and (('|' | ',') and)*          -- ',' is a synonym for '|'
//   and    := not ('&' not)*
//   not    := '!' not | '(' expr ')' | term
//   term   := 'today' | 'tomorrow' | 'overdue' | 'no date' | 'no labels'
//           | 'no priority'                    -- same as p4
//           | 'due before: <phrase>' | 'due after: <phrase>'  -- exclusive bounds
//           | '<N> days'                       -- today <= due <= today+N
//           | 'p1'..'p4' | '#Project' | '@label'
// Date phrases after before:/after: use the quick-add vocabulary
// (today/tomorrow/weekdays/next week/in N days/YYYY-MM-DD/D.M).
//
// Documented semantics:
// - Tasks with no due date never match any date term (only 'no date' and
//   their negations, e.g. '!today', match them).
// - 'overdue' is date-only: dueDate < today. dueTime is ignored — the
//   evaluator has no clock, only a 'today' string.
// - before:/after: are exclusive: 'due before: tomorrow' means due <= today.
// - Project/label names are single tokens (no spaces or &|!(),) and are
//   compared case-insensitively.
// - isCompleted is intentionally ignored: excluding completed tasks is the
//   caller's job; the evaluator only answers the predicate.
import { matchDate } from "../parser/quick-add";

export type FilterableTask = {
  dueDate: string | null;
  dueTime: string | null;
  priority: 1 | 2 | 3 | 4;
  isCompleted: boolean;
  projectName: string;
  labelNames: string[];
};

export type FilterAst =
  | { op: "and" | "or"; left: FilterAst; right: FilterAst }
  | { op: "not"; child: FilterAst }
  | { op: "on" | "before" | "after"; phrase: string[] }
  | { op: "days"; n: number }
  | { op: "noDate" }
  | { op: "noLabels" }
  | { op: "overdue" }
  | { op: "priority"; p: 1 | 2 | 3 | 4 }
  | { op: "project" | "label"; name: string };

type Token = { text: string; pos: number };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  // Split "before:tomorrow" into "before:" + "tomorrow".
  const spaced = query.replace(/\b(before|after):(?=\S)/gi, "$1: ");
  const re = /[()!&|,]|[^\s()!&|,]+/g;
  for (let m = re.exec(spaced); m; m = re.exec(spaced)) {
    tokens.push({ text: m[0] === "," ? "|" : m[0], pos: m.index });
  }
  return tokens;
}

// Any leap year: parse-time validation only checks the phrase is well-formed;
// the real date is resolved against opts.today at evaluation time.
const REF_TODAY = "2024-01-01";

class ParseError extends Error {}

function fail(msg: string, tok?: Token): never {
  throw new ParseError(tok ? `${msg} at "${tok.text}" (position ${tok.pos})` : msg);
}

function parse(tokens: Token[]): FilterAst {
  let i = 0;
  const peek = () => tokens[i]?.text;

  function parseOr(): FilterAst {
    let left = parseAnd();
    while (peek() === "|") {
      i++;
      left = { op: "or", left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): FilterAst {
    let left = parseNot();
    while (peek() === "&") {
      i++;
      left = { op: "and", left, right: parseNot() };
    }
    return left;
  }

  function parseNot(): FilterAst {
    if (peek() === "!") {
      i++;
      return { op: "not", child: parseNot() };
    }
    if (peek() === "(") {
      const open = tokens[i++];
      const child = parseOr();
      if (peek() !== ")") fail("unclosed parenthesis", open);
      i++;
      return child;
    }
    return parseTerm();
  }

  function parseTerm(): FilterAst {
    const tok = tokens[i];
    if (!tok) fail("unexpected end of query");
    if ("()!&|".includes(tok.text)) fail("expected a filter term", tok);
    const w = tok.text.toLowerCase();
    const next = tokens[i + 1]?.text.toLowerCase();

    if (w[0] === "#" || w[0] === "@") {
      if (tok.text.length === 1) fail("missing name", tok);
      i++;
      return { op: w[0] === "#" ? "project" : "label", name: tok.text.slice(1) };
    }
    const p = /^p([1-4])$/.exec(w);
    if (p) {
      i++;
      return { op: "priority", p: Number(p[1]) as 1 | 2 | 3 | 4 };
    }
    if (w === "today" || w === "tomorrow") {
      i++;
      return { op: "on", phrase: [w] };
    }
    if (w === "overdue") {
      i++;
      return { op: "overdue" };
    }
    if (w === "no" && (next === "date" || next === "labels" || next === "priority")) {
      i += 2;
      if (next === "date") return { op: "noDate" };
      if (next === "labels") return { op: "noLabels" };
      return { op: "priority", p: 4 };
    }
    if (w === "due" && (next === "before:" || next === "after:")) {
      i += 2;
      const words = tokens.slice(i).map((t) => t.text);
      const match = words.length ? matchDate(words, 0, REF_TODAY) : null;
      if (!match) fail(`expected a date after "due ${next}"`, tok);
      const phrase = words.slice(0, match.length);
      i += match.length;
      return { op: next === "before:" ? "before" : "after", phrase };
    }
    if (/^\d+$/.test(w) && next && /^days?$/.test(next)) {
      i += 2;
      return { op: "days", n: Number(w) };
    }
    fail("unknown token", tok);
  }

  const ast = parseOr();
  if (i < tokens.length) fail("unexpected token", tokens[i]);
  return ast;
}

export function parseFilter(query: string): { ast: FilterAst } | { error: string } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { error: "empty query" };
  try {
    return { ast: parse(tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { error: e.message };
    throw e;
  }
}

const DAY = 86_400_000;

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

// null when the phrase can't land on a real date for this year, e.g.
// "29.2" evaluated when neither this year nor next is a leap year.
function resolve(phrase: string[], today: string): string | null {
  const match = matchDate(phrase, 0, today);
  return match && match.length === phrase.length ? match.date : null;
}

export function evaluateFilter(ast: FilterAst, task: FilterableTask, opts: { today: string }): boolean {
  switch (ast.op) {
    case "and":
      return evaluateFilter(ast.left, task, opts) && evaluateFilter(ast.right, task, opts);
    case "or":
      return evaluateFilter(ast.left, task, opts) || evaluateFilter(ast.right, task, opts);
    case "not":
      return !evaluateFilter(ast.child, task, opts);
    case "on":
      return task.dueDate !== null && task.dueDate === resolve(ast.phrase, opts.today);
    case "before": {
      const date = resolve(ast.phrase, opts.today);
      return date !== null && task.dueDate !== null && task.dueDate < date;
    }
    case "after": {
      const date = resolve(ast.phrase, opts.today);
      return date !== null && task.dueDate !== null && task.dueDate > date;
    }
    case "days":
      return (
        task.dueDate !== null &&
        task.dueDate >= opts.today &&
        task.dueDate <= addDays(opts.today, ast.n)
      );
    case "noDate":
      return task.dueDate === null;
    case "noLabels":
      return task.labelNames.length === 0;
    case "overdue":
      return task.dueDate !== null && task.dueDate < opts.today;
    case "priority":
      return task.priority === ast.p;
    case "project":
      return task.projectName.toLowerCase() === ast.name.toLowerCase();
    case "label":
      return task.labelNames.some((l) => l.toLowerCase() === ast.name.toLowerCase());
  }
}
