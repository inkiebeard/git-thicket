import Prism from "prismjs";
// Load order matters: each of these registers into the shared Prism.languages
// registry, and several grammars extend an earlier one rather than starting
// from scratch (jsx extends markup+javascript, tsx extends jsx+typescript,
// cpp extends c, and go/java/c/csharp/ruby/php/kotlin all extend clike) — a
// dependency has to already be registered before the thing that extends it
// runs, or it errors/produces a broken grammar.
import "prismjs/components/prism-markup"; // HTML/XML/SVG; also a dependency of jsx/tsx/markdown
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-markup-templating"; // dependency of php
import "prismjs/components/prism-php";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-makefile";

export type SyntaxLang =
  | "markup"
  | "css"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp"
  | "csharp"
  | "ruby"
  | "php"
  | "kotlin"
  | "swift"
  | "bash"
  | "json"
  | "yaml"
  | "toml"
  | "sql"
  | "markdown"
  | "docker"
  | "makefile";

const EXT_TO_LANG: Record<string, SyntaxLang> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  pyw: "python",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  md: "markdown",
  markdown: "markdown",
  html: "markup",
  htm: "markup",
  xhtml: "markup",
  xml: "markup",
  svg: "markup",
  css: "css",
  mk: "makefile",
};

// A handful of common files are identified by name, not extension.
const BASENAME_TO_LANG: Record<string, SyntaxLang> = {
  makefile: "makefile",
};

export function languageForPath(path: string): SyntaxLang | null {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (base.startsWith("dockerfile")) return "docker";
  if (BASENAME_TO_LANG[base]) return BASENAME_TO_LANG[base];
  const match = /\.([a-zA-Z0-9]+)$/.exec(base);
  if (!match) return null;
  return EXT_TO_LANG[match[1]] ?? null;
}

export interface HighlightedToken {
  text: string;
  /** Space-separated Prism CSS classes, e.g. "token keyword" — null for
   * plain, unstyled text. */
  className: string | null;
}

// Tokenizing a multi-megabyte file for a hover-diff view isn't worth the
// CPU/memory cost — fall back to plain text past this size.
const MAX_HIGHLIGHT_CHARS = 2_000_000;

interface FlatToken {
  text: string;
  className: string | null;
}

function flattenToken(token: string | Prism.Token, classChain: string[], out: FlatToken[]) {
  if (typeof token === "string") {
    if (token.length > 0) {
      out.push({ text: token, className: classChain.length ? `token ${classChain.join(" ")}` : null });
    }
    return;
  }

  const alias = token.alias ? (Array.isArray(token.alias) ? token.alias : [token.alias]) : [];
  const nextChain = [...classChain, token.type, ...alias];
  const content = token.content;

  if (typeof content === "string") {
    if (content.length > 0) out.push({ text: content, className: `token ${nextChain.join(" ")}` });
  } else if (Array.isArray(content)) {
    for (const child of content) flattenToken(child, nextChain, out);
  } else if (content) {
    flattenToken(content, nextChain, out);
  }
}

// Splits a flat, in-order list of styled text segments into per-line arrays,
// so a token whose text spans several lines (a block comment, a template
// literal) contributes correctly-styled fragments to each of those lines
// instead of one span with an embedded "\n" that would break the layout.
function toLines(flat: FlatToken[]): HighlightedToken[][] {
  const lines: HighlightedToken[][] = [[]];
  for (const seg of flat) {
    const parts = seg.text.split("\n");
    parts.forEach((part, i) => {
      if (part.length > 0) lines[lines.length - 1].push({ text: part, className: seg.className });
      if (i < parts.length - 1) lines.push([]);
    });
  }
  return lines;
}

/** Tokenizes an entire file's text and returns one token array per source
 * line (0-indexed). Returns null when highlighting isn't applicable —
 * unsupported language, empty content, or content too large to bother with. */
export function tokenizeLines(code: string, lang: SyntaxLang | null): HighlightedToken[][] | null {
  if (!lang || code.length === 0 || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const grammar = Prism.languages[lang];
  if (!grammar) return null;

  try {
    const tokens = Prism.tokenize(code, grammar);
    const flat: FlatToken[] = [];
    for (const token of tokens) flattenToken(token, [], flat);
    return toLines(flat);
  } catch {
    return null;
  }
}
