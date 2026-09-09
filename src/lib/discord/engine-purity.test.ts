import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

test("capture and matching engine import graph stays portable", () => {
  const visited = new Set<string>();
  const forbidden = new Set([
    "window",
    "document",
    "navigator",
    "location",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "process",
    "require",
    "eval",
    "globalThis",
    "self",
  ]);
  function walk(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier;
        if (spec && ts.isStringLiteral(spec)) {
          const name = spec.text;
          assert.ok(
            name.startsWith("@/lib/") || name.startsWith("."),
            `${file}: external import ${name}`,
          );
          const target = name.startsWith("@/")
            ? path.resolve("src", name.slice(2))
            : path.resolve(path.dirname(file), name);
          walk(`${target}.ts`);
        }
      }
      assert.ok(
        !(
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ),
        `${file}: dynamic import`,
      );
      if (ts.isIdentifier(node))
        assert.ok(
          !forbidden.has(node.text),
          `${file}: nonportable ${node.text}`,
        );
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const root of [
    "discord/transcript",
    "discord/match",
    "discord/trade-desk",
    "match/transcript-blocks",
  ])
    walk(path.resolve(`src/lib/${root}.ts`));
  assert.ok(visited.size >= 10);
});
