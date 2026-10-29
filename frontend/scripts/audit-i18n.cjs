const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const rows = new Map();
function record(message, file) {
  if (!/[A-Za-z]/.test(message)) return;
  if (!rows.has(message)) rows.set(message, new Set());
  rows.get(message).add(path.relative('src', file));
}
function literalMessages(node, file) {
  if (ts.isStringLiteral(node)) record(node.text, file);
  if (ts.isConditionalExpression(node)) {
    literalMessages(node.whenTrue, file);
    literalMessages(node.whenFalse, file);
  }
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'i18n') walk(file); continue; }
    if (!/\.tsx?$/.test(file) || file.includes('.test.')) continue;
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'LocalizedText') {
        const attribute = node.attributes.properties.find(p => p.name?.getText(ast) === 'message');
        const value = attribute?.initializer;
        if (value && ts.isStringLiteral(value)) record(value.text, file);
        if (value && ts.isJsxExpression(value) && value.expression) literalMessages(value.expression, file);
      }
      if (ts.isCallExpression(node) && /^(?:translateUI|localizeAttribute|t|intl\.t)$/.test(node.expression.getText(ast)) && node.arguments[0]) literalMessages(node.arguments[0], file);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
walk('src');
const catalog = JSON.parse(fs.readFileSync('src/lib/i18n/fa.json', 'utf8'));
const translated = new Set(Object.keys(catalog).map(key => key.toLowerCase()));
const neutral = new Set(JSON.parse(fs.readFileSync('src/lib/i18n/neutral.json', 'utf8')));
const output = [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([message, files]) => ({ message, translated: translated.has(message.toLowerCase()), neutral: neutral.has(message), files: [...files] }));
fs.writeFileSync('src/lib/i18n/inventory.json', JSON.stringify(output, null, 2) + '\n');
const missing = output.filter(row => !row.translated && !row.neutral);
console.log({ messages: output.length, translated: output.filter(row => row.translated).length, neutral: output.filter(row => !row.translated && row.neutral).length, missing: missing.length });
for (const row of missing) console.log(`Missing: ${row.message}`);
if (process.argv.includes('--strict') && missing.length) process.exitCode = 1;
