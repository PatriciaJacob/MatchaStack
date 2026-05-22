import path from 'node:path';
import ts from 'typescript';

export interface ModuleDirectiveInfo {
  useClient: boolean;
  useServer: boolean;
  exports: string[];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((modifier) => modifier.kind === kind));
}

function getDeclarationExportNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      return ['default'];
    }

    return statement.name ? [statement.name.text] : [];
  }

  if (ts.isVariableStatement(statement)) {
    const names: string[] = [];

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        names.push(declaration.name.text);
      }
    }

    return names;
  }

  if (ts.isExportAssignment(statement)) {
    return ['default'];
  }

  if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    return statement.exportClause.elements.map((element) => element.name.text);
  }

  return [];
}

export function analyzeModule(code: string, fileName: string): ModuleDirectiveInfo {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let useClient = false;
  let useServer = false;
  const exports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === 'use client') {
        useClient = true;
        continue;
      }

      if (statement.expression.text === 'use server') {
        useServer = true;
        continue;
      }
    }

    break;
  }

  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword) && !ts.isExportAssignment(statement) && !ts.isExportDeclaration(statement)) {
      continue;
    }

    for (const name of getDeclarationExportNames(statement)) {
      exports.add(name);
    }
  }

  return {
    useClient,
    useServer,
    exports: [...exports],
  };
}

export function stripModuleDirectives(
  code: string,
  fileName: string,
  directives: readonly string[],
): string {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const removals: Array<{ start: number; end: number }> = [];
  const directiveSet = new Set(directives);

  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      break;
    }

    if (directiveSet.has(statement.expression.text)) {
      removals.push({ start: statement.getStart(sourceFile), end: statement.end });
    }
  }

  return removals
    .reverse()
    .reduce((nextCode, removal) => {
      return `${nextCode.slice(0, removal.start)}${nextCode.slice(removal.end)}`;
    }, code);
}

export function toModuleId(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}
