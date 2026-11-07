const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function transpile(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const typed = new Map();
  let inBlockComment = false;

  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { output.push(''); continue; }
    if (line === '===') { inBlockComment = !inBlockComment; continue; }
    if (inBlockComment || line.startsWith('#')) { continue; }

    // Remove trailing comments outside quoted strings.
    line = stripLineComment(line);
    if (!line) continue;

    // Lxcn's null-like literal.
    line = line.replace(/\bnone\b/g, 'null');

    // Template interpolation uses {name}, while JavaScript uses ${name}.
    line = line.replace(/`([^`]*)`/g, (_, body) => '`' + body.replace(/\{([^{}]+)\}/g, '${$1}') + '`');

    // Type checks: value == (int) means "is value an int?"
    line = line.replace(/([A-Za-z_$][\w$]*)\s*==\s*\((int|double|char|string|bool)\)/g,
      'lx.isType($1, "$2")');

    // Casts: (int) expression. A bare (int) was handled above.
    line = line.replace(/\((int|double|char|string|bool)\)\s*([A-Za-z_$][\w$]*|\d+(?:\.\d+)?)/g,
      'lx.cast("$1", $2)');

    // Static typed declarations, including optionals.
    const typedDecl = line.match(/^(int|double|char|string|bool)\s+([A-Za-z_$][\w$]*)(\?)?\s*=\s*(.+)$/);
    if (typedDecl) {
      const [, type, name, optional, value] = typedDecl;
      typed.set(name, { type, optional: !!optional });
      output.push(`let ${name} = lx.declare("${type}", ${JSON.stringify(name)}, (${value}), ${!!optional});`);
      continue;
    }

    // const var name = value
    const constDecl = line.match(/^const\s+var\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (constDecl) { output.push(`const ${constDecl[1]} = ${constDecl[2]};`); continue; }

    // Dynamic variables. ver is block-scoped and has a TDZ; var has function scope.
    const verDecl = line.match(/^ver\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (verDecl) { output.push(`let ${verDecl[1]} = ${verDecl[2]};`); continue; }
    const varDecl = line.match(/^var\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (varDecl) { output.push(`var ${varDecl[1]} = ${varDecl[2]};`); continue; }

    // Re-check assignments to statically typed variables.
    const assignment = line.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (assignment && typed.has(assignment[1])) {
      const info = typed.get(assignment[1]);
      output.push(`${assignment[1]} = lx.assign("${info.type}", ${JSON.stringify(assignment[1])}, (${assignment[2]}), ${info.optional});`);
      continue;
    }

    // Block syntax.
    let m;
    if ((m = line.match(/^if\s+(.+?)\s+then$/))) { output.push(`if (${m[1]}) {`); continue; }
    if ((m = line.match(/^elseif\s+(.+?)\s+then$/))) { output.push(`} else if (${m[1]}) {`); continue; }
    if (/^else\s+then$/.test(line)) { output.push('} else {'); continue; }
    if (/^end$/.test(line)) { output.push('}'); continue; }
    if ((m = line.match(/^for\s+loop\s*\(\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)\s*do$/))) {
      output.push(`for (${m[1]}; ${m[2]}; ${m[3]}) {`); continue;
    }

    // Keep ordinary JS-like statements and append semicolons where safe.
    output.push(line);
  }
  return output.join('\n');
}

function stripLineComment(line) {
  let quote = null, escaped = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\\\' && quote) { escaped = true; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '#') return line.slice(0, i).trim();
  }
  return line;
}

function typeMatches(value, type) {
  switch (type) {
    case 'int': return Number.isInteger(value);
    case 'double': return typeof value === 'number';
    case 'char': return typeof value === 'string' && [...value].length === 1;
    case 'string': return typeof value === 'string';
    case 'bool': return typeof value === 'boolean';
    default: return false;
  }
}

function runLxcn(source, output) {
  const lx = {
    isType: (value, type) => typeMatches(value, type),
    cast: (type, value) => {
      let result;
      switch (type) {
        case 'int': result = Number.parseInt(value, 10); break;
        case 'double': result = Number(value); break;
        case 'char': result = String(value).slice(0, 1); break;
        case 'string': result = String(value); break;
        case 'bool': result = Boolean(value); break;
      }
      if ((type === 'int' || type === 'double') && Number.isNaN(result))
        throw new TypeError(`Cannot convert value to ${type}.`);
      return result;
    },
    declare: (type, name, value, optional) => {
      if (optional && value === null) return value;
      if (!typeMatches(value, type)) throw new TypeError(`Variable '${name}' expects ${type}, received ${value === null ? 'none' : typeof value}.`);
      return value;
    },
    assign: (type, name, value, optional) => {
      if (optional && value === null) return value;
      if (!typeMatches(value, type)) throw new TypeError(`Variable '${name}' expects ${type}, received ${value === null ? 'none' : typeof value}.`);
      return value;
    }
  };
  const safeConsole = { log: (...args) => output.appendLine(args.map(v => typeof v === 'string' ? v : formatValue(v)).join(' ')) };
  const context = { console: safeConsole, lx, Math, Number, String, Boolean, Array, Object };
  vm.createContext(context);
  const js = transpile(source);
  try {
    new vm.Script(js, { filename: 'program.lxcn' }).runInContext(context, { timeout: 3000 });
  } catch (err) {
    output.appendLine(`[Lxcn Error] ${err.name}: ${err.message}`);
    if (err.stack) output.appendLine(err.stack.split('\n').slice(1, 3).join('\n'));
  }
}
function formatValue(value) {
  if (value === null) return 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function activate(context) {
  const output = vscode.window.createOutputChannel('Lxcn');
  context.subscriptions.push(output);
  const run = vscode.commands.registerCommand('lxcn.runFile', async (uri) => {
    const editor = vscode.window.activeTextEditor;
    const target = uri || (editor && editor.document.uri);
    if (!target) { vscode.window.showWarningMessage('Open an Lxcn file to run it.'); return; }
    const document = await vscode.workspace.openTextDocument(target);
    const ext = path.extname(document.fileName).toLowerCase();
    if (!['.lx', '.lxc', '.lxcn'].includes(ext)) {
      vscode.window.showErrorMessage('Lxcn can only run .lx, .lxc or .lxcn files.');
      return;
    }
    output.clear();
    output.appendLine(`Lxcn · ${path.basename(document.fileName)}`);
    output.appendLine('--------------------------------');
    runLxcn(document.getText(), output);
    output.show(true);
  });
  context.subscriptions.push(run);
}
function deactivate() {}
module.exports = { activate, deactivate };
