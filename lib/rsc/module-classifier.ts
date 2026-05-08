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

function isServerLoaderStatement(statement: ts.Statement): boolean {
  const isTargetName = (name: string) => name === 'getStaticProps' || name === 'getServerSideProps';

  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return hasModifier(statement, ts.SyntaxKind.ExportKeyword) && Boolean(statement.name && isTargetName(statement.name.text));
  }

  if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
    return statement.declarationList.declarations.some((declaration) => {
      return ts.isIdentifier(declaration.name) && isTargetName(declaration.name.text);
    });
  }

  return false;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

export function stripServerCode(code: string, fileName: string): string {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const nextProperties: ts.ObjectLiteralElementLike[] = [];
        let removedServerSideProps = false;
        let hasServerSidePropsMarker = false;

        for (const property of node.properties) {
          const propertyName =
            (ts.isPropertyAssignment(property) ||
              ts.isShorthandPropertyAssignment(property) ||
              ts.isMethodDeclaration(property)) &&
            property.name
              ? getPropertyName(property.name)
              : null;

          if (propertyName === 'getStaticProps') {
            continue;
          }

          if (propertyName === 'getServerSideProps') {
            removedServerSideProps = true;
            continue;
          }

          if (propertyName === 'hasServerSideProps') {
            hasServerSidePropsMarker = true;
          }

          nextProperties.push(ts.visitNode(property, visit) as ts.ObjectLiteralElementLike);
        }

        if (removedServerSideProps && !hasServerSidePropsMarker) {
          nextProperties.push(
            ts.factory.createPropertyAssignment(
              ts.factory.createIdentifier('hasServerSideProps'),
              ts.factory.createTrue(),
            ),
          );
        }

        return ts.factory.updateObjectLiteralExpression(node, nextProperties);
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (file) => {
      const statements: ts.Statement[] = [];

      for (const statement of file.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text.startsWith('node:')
        ) {
          continue;
        }

        if (isServerLoaderStatement(statement)) {
          continue;
        }

        statements.push(ts.visitNode(statement, visit) as ts.Statement);
      }

      return ts.factory.updateSourceFile(file, statements);
    };
  };

  const transformed = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  const output = printer.printFile(transformed.transformed[0]);
  transformed.dispose();
  return output;
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
