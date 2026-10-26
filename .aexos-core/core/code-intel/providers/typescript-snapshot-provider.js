'use strict';

const path = require('path');
const { CodeIntelProvider } = require('./provider-interface');
const { sha256 } = require('../brownfield/contract');
const { computeFindingId, computeRelationshipId, lineColumnAt } = require('../brownfield/evidence');
const { SUPPORTED_EXTENSIONS } = require('../brownfield/snapshot');

const PROVIDER_VERSION = '1.0.0';
const SECRET_VALUE_PATTERN = /(?:AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/:@]+:[^\s/@]+@|(?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*['"]?[^'"\s,}]{8,})/i;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const SERVER_PACKAGES = new Set(['express', 'fastify', 'koa', '@koa/router', 'hapi', '@hapi/hapi']);

function loadTypeScript() {
  try {
    const frameworkRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const resolved = require.resolve('typescript', { paths: [frameworkRoot] });
    return require(resolved);
  } catch (_error) {
    return null;
  }
}

function scriptKind(ts, filePath) {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (['.ts', '.mts', '.cts'].includes(extension)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isExported(ts, node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function identifierText(node) {
  return node?.name && typeof node.name.text === 'string' ? node.name.text : null;
}

function safeMetadata(value) {
  return typeof value === 'string' && !SECRET_VALUE_PATTERN.test(value) ? value : null;
}

function lexicalBindings(ts, sourceFile) {
  // Deliberately do not extend createCompilerHost: its defaults consult disk.
  // Each program knows one already-authorized source, with no module/lib lookup.
  const host = {
    getSourceFile: (name) => name === sourceFile.fileName ? sourceFile : undefined,
    getDefaultLibFileName: () => '',
    writeFile: () => { throw new Error('Snapshot compiler cannot emit files.'); },
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    directoryExists: () => false,
    fileExists: (name) => name === sourceFile.fileName,
    readFile: (name) => name === sourceFile.fileName ? sourceFile.text : undefined,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNames: (names) => names.map(() => undefined),
    resolveTypeReferenceDirectives: (names) => names.map(() => undefined),
  };
  const program = ts.createProgram([sourceFile.fileName], {
    noLib: true, noResolve: true, noEmit: true, types: [], allowJs: true,
    target: ts.ScriptTarget.Latest,
  }, host);
  const checker = program.getTypeChecker();
  // Invalid duplicate declarations can produce distinct recovered symbols.
  // A recovered binding is not sufficient evidence for a server identity.
  const bindingErrors = Boolean(sourceFile.bindDiagnostics?.length);
  const symbolAt = (node) => checker.getSymbolAtLocation(node);
  const written = new Set();
  const writeTarget = (node) => {
    if (ts.isIdentifier(node)) {
      const symbol = symbolAt(node);
      if (symbol) written.add(symbol);
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)
      || ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) writeTarget(node.expression);
    else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(writeTarget);
    else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          const symbol = checker.getShorthandAssignmentValueSymbol(property);
          if (symbol) written.add(symbol);
        } else if (ts.isPropertyAssignment(property)) writeTarget(property.initializer);
        else if (ts.isSpreadAssignment(property)) writeTarget(property.expression);
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      writeTarget(node.left);
    }
  };
  const scan = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) writeTarget(node.left);
    else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) writeTarget(node.operand);
    else if ((ts.isForOfStatement(node) || ts.isForInStatement(node))
      && !ts.isVariableDeclarationList(node.initializer)) writeTarget(node.initializer);
    ts.forEachChild(node, scan);
  };
  scan(sourceFile);
  return {
    symbolAt,
    // Any write invalidates identity, even in a later closure: execution order
    // is unknown. Prefer an explicit omission over speculative flow analysis.
    stable: (symbol) => Boolean(!bindingErrors && symbol && symbol.declarations?.length === 1 && !written.has(symbol)),
  };
}

class TypeScriptSnapshotProvider extends CodeIntelProvider {
  constructor(options = {}) {
    super('typescript-snapshot', options);
    this.snapshot = options.snapshot || null;
    this.ts = options.typescript === undefined ? loadTypeScript() : options.typescript;
    this.version = this.ts?.version || null;
    this._last = null;
  }

  isAvailable() {
    return Boolean(this.ts && this.snapshot?.entries instanceof Map);
  }

  _sourceRef(source, sourceFile, node) {
    const startOffset = node.getStart(sourceFile, false);
    const endOffset = node.end;
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = sourceFile.getLineAndCharacterOfPosition(endOffset);
    return {
      sourceId: source.id,
      path: source.path,
      sha256: source.sha256,
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
      startOffset,
      endOffset,
      spanHash: sha256(Buffer.from(source.text.slice(startOffset, endOffset), 'utf8')),
    };
  }

  _finding(kind, name, sourceRef, extra = {}) {
    const finding = {
      kind,
      name,
      assertionLevel: extra.assertionLevel || 'observed-syntax',
      confidence: extra.confidence || 'high',
      extractorId: 'typescript-snapshot',
      extractorVersion: PROVIDER_VERSION,
      sourceRefs: extra.sourceRefs || [sourceRef],
      limitations: extra.limitations || ['Static syntax only; runtime reachability was not evaluated.'],
      ...(extra.attributes ? { attributes: extra.attributes } : {}),
    };
    finding.id = computeFindingId(finding);
    return finding;
  }

  _fullRef(entry) {
    const end = lineColumnAt(entry.text, entry.text.length);
    return {
      sourceId: entry.id, path: entry.path, sha256: entry.sha256,
      startLine: 1, startColumn: 1, endLine: end.line, endColumn: end.column,
      startOffset: 0, endOffset: entry.text.length,
      spanHash: sha256(Buffer.from(entry.text, 'utf8')),
    };
  }

  _parseManifest(entry, findings, relationships, diagnostics) {
    let manifest;
    try { manifest = JSON.parse(entry.text); } catch (_error) {
      diagnostics.push({ code: 'INVALID_JSON_MANIFEST', path: entry.path });
      return;
    }
    const fullRef = this._fullRef(entry);
    findings.push(this._finding('architecture.package-manifest', path.posix.dirname(entry.path), fullRef, {
      attributes: {
        packageName: safeMetadata(manifest.name),
        workspaceDeclaration: Array.isArray(manifest.workspaces) || Boolean(manifest.workspaces?.packages),
      },
    }));
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const declarations = manifest[field];
      if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) continue;
      for (const dependency of Object.keys(declarations).sort()) {
        const range = String(declarations[dependency]);
        if (!safeMetadata(dependency) || !safeMetadata(range)) {
          diagnostics.push({ code: 'POTENTIAL_SECRET_METADATA_SUPPRESSED', path: entry.path });
          continue;
        }
        const finding = this._finding('dependency.manifest-declaration', dependency, fullRef, {
          attributes: { group: field, range },
          limitations: ['Declared range only; installation, resolution, currency, and vulnerability status were not checked.'],
        });
        findings.push(finding);
        const relationship = {
          kind: 'declares-dependency',
          fromFindingId: finding.id,
          to: dependency,
          resolution: 'external-declaration',
          sourceRefs: finding.sourceRefs,
        };
        relationship.id = computeRelationshipId(relationship);
        relationships.push(relationship);
      }
    }
  }

  _parseDataDocument(entry, findings, diagnostics) {
    let document;
    try { document = JSON.parse(entry.text); } catch (_error) {
      diagnostics.push({ code: 'INVALID_JSON_DOCUMENT', path: entry.path });
      return;
    }
    const fullRef = this._fullRef(entry);
    if (path.posix.basename(entry.path) === 'openapi.json' && document.paths
      && typeof document.paths === 'object' && !Array.isArray(document.paths)) {
      for (const routePath of Object.keys(document.paths).sort()) {
        if (!safeMetadata(routePath)) {
          diagnostics.push({ code: 'POTENTIAL_SECRET_METADATA_SUPPRESSED', path: entry.path });
          continue;
        }
        const declaration = document.paths[routePath];
        if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) continue;
        for (const method of Object.keys(declaration).filter((value) => HTTP_METHODS.has(value)).sort()) {
          findings.push(this._finding('api.openapi-path', `${method.toUpperCase()} ${routePath}`, fullRef, {
            limitations: ['OpenAPI document syntax only; deployment and handler binding were not verified.'],
          }));
        }
      }
      return;
    }
    if (entry.path.endsWith('.schema.json')) {
      const fields = document.properties && typeof document.properties === 'object'
        ? Object.keys(document.properties).filter(safeMetadata).sort() : [];
      findings.push(this._finding('data.json-schema-declaration',
        safeMetadata(document.$id) || path.posix.basename(entry.path), fullRef, {
          attributes: { fields },
          limitations: ['JSON Schema declaration only; storage, migration, and runtime validation were not tested.'],
        }));
    }
  }

  _resolveImport(sourcePath, specifier) {
    if (!specifier.startsWith('.')) return { resolution: 'external-declaration', target: specifier };
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
    const candidates = [base, ...[...SUPPORTED_EXTENSIONS].map((extension) => `${base}${extension}`),
      ...[...SUPPORTED_EXTENSIONS].map((extension) => `${base}/index${extension}`)]
      .filter((candidate) => this.snapshot.entries.has(candidate));
    const unique = [...new Set(candidates)].sort();
    if (unique.length === 1) return { resolution: 'resolved-local', target: unique[0] };
    if (unique.length > 1) return { resolution: 'ambiguous', candidates: unique };
    return { resolution: 'unresolved', target: base };
  }

  _analyzeSource(entry, findings, relationships, diagnostics) {
    if (SECRET_VALUE_PATTERN.test(entry.text)) {
      diagnostics.push({ code: 'POTENTIAL_SECRET_FILE_SUPPRESSED', path: entry.path });
      return;
    }
    const ts = this.ts;
    const sourceFile = ts.createSourceFile(
      entry.path,
      entry.text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(ts, entry.path),
    );
    const parseErrors = sourceFile.parseDiagnostics || [];
    if (parseErrors.length) {
      diagnostics.push({ code: 'PARSE_ERROR', path: entry.path });
      return;
    }
    const importedServers = new Map();
    const importedNames = new Set();
    const serverReceivers = new Map();
    const receiverNames = new Set();
    const bindings = lexicalBindings(ts, sourceFile);
    const imports = [];
    const declarationNames = [];
    const functionStack = [];
    const isTest = /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec))\.[cm]?[jt]sx?$/.test(entry.path);

    const collectServerImports = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && SERVER_PACKAGES.has(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        const recordImport = (identifier, typeOnly) => {
          importedNames.add(identifier.text);
          const symbol = bindings.symbolAt(identifier);
          if (!typeOnly && bindings.stable(symbol)) importedServers.set(symbol, node.moduleSpecifier);
        };
        if (clause?.name) recordImport(clause.name, clause.isTypeOnly);
        for (const element of clause?.namedBindings?.elements || []) {
          recordImport(element.name, clause.isTypeOnly || element.isTypeOnly);
        }
      }
      ts.forEachChild(node, collectServerImports);
    };
    collectServerImports(sourceFile);

    const recordDeclaration = (node, declarationKind) => {
      const name = identifierText(node);
      if (!name) return;
      declarationNames.push({ name, node });
      if (isExported(ts, node)) {
        findings.push(this._finding(`api.exported-${declarationKind}`, name,
          this._sourceRef(entry, sourceFile, node), {
            limitations: ['Exported syntax does not by itself establish a supported public API.'],
          }));
      }
      if (['interface', 'type'].includes(declarationKind)) {
        const members = node.members || (ts.isTypeLiteralNode(node.type) ? node.type.members : []);
        const fields = [...members].map((member) => identifierText(member)).filter(Boolean).sort();
        findings.push(this._finding(`data.${declarationKind}-declaration`, name,
          this._sourceRef(entry, sourceFile, node), {
            attributes: { fields },
            limitations: ['Declaration only; no deployed database or runtime validation is claimed.'],
          }));
      }
    };

    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        imports.push({ specifier, node: node.moduleSpecifier });
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, node: node.moduleSpecifier });
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
        && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)
        && importedNames.has(node.initializer.expression.text)) {
        const importNode = importedServers.get(bindings.symbolAt(node.initializer.expression));
        const receiverSymbol = bindings.symbolAt(node.name);
        receiverNames.add(node.name.text);
        if (importNode && bindings.stable(receiverSymbol)) {
          serverReceivers.set(receiverSymbol, { declaration: node, importNode });
        } else {
          diagnostics.push({ code: 'AMBIGUOUS_SERVER_FACTORY', path: entry.path });
        }
      }

      if (ts.isFunctionDeclaration(node)) recordDeclaration(node, 'function');
      else if (ts.isClassDeclaration(node)) recordDeclaration(node, 'class');
      else if (ts.isInterfaceDeclaration(node)) recordDeclaration(node, 'interface');
      else if (ts.isTypeAliasDeclaration(node)) recordDeclaration(node, 'type');
      else if (ts.isEnumDeclaration(node)) recordDeclaration(node, 'enum');

      const functionLike = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
        || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
      if (functionLike) functionStack.push(identifierText(node) || 'anonymous-function');

      if (ts.isIfStatement(node) && functionStack.length) {
        findings.push(this._finding('domain.guard-clause', functionStack.at(-1),
          this._sourceRef(entry, sourceFile, node.expression), {
            confidence: 'medium',
            limitations: ['A syntactic predicate was observed; business meaning and runtime reachability are unknown.'],
          }));
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        diagnostics.push({ code: 'DYNAMIC_IMPORT_UNRESOLVED', path: entry.path });
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && receiverNames.has(node.expression.expression.text)
        && HTTP_METHODS.has(node.expression.name.text)) {
        const binding = serverReceivers.get(bindings.symbolAt(node.expression.expression));
        if (!binding || binding.declaration.end >= node.pos) {
          diagnostics.push({ code: 'AMBIGUOUS_SERVER_RECEIVER', path: entry.path });
          ts.forEachChild(node, visit);
          return;
        }
        const route = node.arguments[0];
        if (route && ts.isStringLiteral(route)) {
          const refs = [node, binding.declaration, binding.importNode]
            .map((item) => this._sourceRef(entry, sourceFile, item));
          findings.push(this._finding('api.http-route', `${node.expression.name.text.toUpperCase()} ${route.text}`,
            this._sourceRef(entry, sourceFile, node), {
              confidence: 'medium',
              sourceRefs: refs,
              limitations: ['Known imported server receiver and literal route only; registration and reachability were not executed.'],
            }));
        } else diagnostics.push({ code: 'DYNAMIC_ROUTE_UNRESOLVED', path: entry.path });
      }

      ts.forEachChild(node, visit);
      if (functionLike) functionStack.pop();
    };
    visit(sourceFile);

    for (const item of imports) {
      const sourceRef = this._sourceRef(entry, sourceFile, item.node);
      const finding = this._finding('dependency.static-specifier', item.specifier, sourceRef, {
        limitations: ['Literal syntax only; module loading and runtime resolution were not executed.'],
      });
      findings.push(finding);
      const resolution = this._resolveImport(entry.path, item.specifier);
      const relationship = {
        kind: 'static-module-edge',
        fromFindingId: finding.id,
        to: resolution.target || null,
        resolution: resolution.resolution,
        ...(resolution.candidates ? { candidates: resolution.candidates } : {}),
        sourceRefs: [sourceRef],
      };
      relationship.id = computeRelationshipId(relationship);
      relationships.push(relationship);
      if (['ambiguous', 'unresolved'].includes(resolution.resolution)) {
        diagnostics.push({ code: resolution.resolution === 'ambiguous' ? 'AMBIGUOUS_MODULE' : 'UNRESOLVED_MODULE', path: entry.path });
      }
    }
    if (isTest) {
      const refNode = sourceFile.statements[0] || sourceFile;
      findings.push(this._finding('tests.test-file-present', path.posix.basename(entry.path),
        this._sourceRef(entry, sourceFile, refNode), {
          limitations: ['Test syntax is present; tests were not executed and coverage is unknown.'],
        }));
    }
    return declarationNames;
  }

  async analyzeCodebase() {
    if (!this.isAvailable()) return { status: 'unavailable', reason: 'TYPESCRIPT_ANALYZER_UNAVAILABLE' };
    const findings = [];
    const relationships = [];
    const diagnostics = [];
    const symbols = new Map();
    for (const entry of [...this.snapshot.entries.values()].sort((left, right) => left.path.localeCompare(right.path))) {
      if (entry.status !== 'analyzed' || entry.text === null) continue;
      if (path.posix.basename(entry.path) === 'package.json') {
        this._parseManifest(entry, findings, relationships, diagnostics);
        continue;
      }
      if (path.posix.basename(entry.path) === 'openapi.json' || entry.path.endsWith('.schema.json')) {
        this._parseDataDocument(entry, findings, diagnostics);
        continue;
      }
      if (!SUPPORTED_EXTENSIONS.has(path.posix.extname(entry.path).toLowerCase())) continue;
      const declarations = this._analyzeSource(entry, findings, relationships, diagnostics) || [];
      for (const declaration of declarations) {
        if (!symbols.has(declaration.name)) symbols.set(declaration.name, []);
        symbols.get(declaration.name).push({ entry, node: declaration.node });
      }
    }
    for (const [name, declarations] of symbols) {
      if (declarations.length < 2) continue;
      const refs = declarations.map(({ entry, node }) => {
        const sourceFile = this.ts.createSourceFile(entry.path, entry.text, this.ts.ScriptTarget.Latest, true,
          scriptKind(this.ts, entry.path));
        return this._sourceRef(entry, sourceFile, node);
      }).sort((left, right) => `${left.path}:${left.startOffset}`.localeCompare(`${right.path}:${right.startOffset}`));
      const finding = {
        kind: 'risk.duplicate-symbol',
        name,
        assertionLevel: 'observed-syntax',
        confidence: 'high',
        extractorId: 'typescript-snapshot',
        extractorVersion: PROVIDER_VERSION,
        sourceRefs: refs,
        limitations: ['Duplicate syntax does not establish a runtime collision.'],
      };
      finding.id = computeFindingId(finding);
      findings.push(finding);
    }
    findings.sort((left, right) => left.id.localeCompare(right.id));
    relationships.sort((left, right) => left.id.localeCompare(right.id));
    diagnostics.sort((left, right) => `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
    this._last = { findings, relationships, diagnostics };
    return this._last;
  }

  async findDefinition(symbol) {
    if (!this._last) await this.analyzeCodebase();
    const matches = this._last?.findings.filter((finding) => finding.name === symbol) || [];
    return matches.length ? matches.map((finding) => finding.sourceRefs[0]) : null;
  }

  async findReferences(symbol) {
    return this.findDefinition(symbol);
  }

  async analyzeDependencies() {
    if (!this._last) await this.analyzeCodebase();
    return this._last ? { nodes: [], edges: this._last.relationships } : null;
  }

  async getProjectStats() {
    const sources = this.snapshot?.sources || [];
    return {
      files: sources.length,
      lines: 0,
      languages: sources.reduce((counts, source) => ({
        ...counts,
        [source.language]: (counts[source.language] || 0) + 1,
      }), {}),
    };
  }
}

module.exports = {
  PROVIDER_VERSION,
  TypeScriptSnapshotProvider,
  loadTypeScript,
};
