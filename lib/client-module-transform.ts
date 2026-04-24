import ts from 'typescript';

const LOADER_EXPORT_NAMES = new Set(['getStaticProps', 'getServerSideProps']);
export const MATCHA_CLIENT_QUERY = 'matcha-client';

export function transformRoutesModuleForClient(sourceText: string, filename: string) {
  const sourceFile = createSourceFile(filename, sourceText);
  const nextStatements: ts.Statement[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      nextStatements.push(rewriteRoutesImport(statement));
      continue;
    }

    if (isExportedRoutesDeclaration(statement)) {
      nextStatements.push(stripRouteLoaderProperties(statement));
      continue;
    }

    nextStatements.push(statement);
  }

  return printSourceFile(sourceFile, nextStatements);
}

export function transformRouteModuleForClient(sourceText: string, filename: string) {
  const sourceFile = createSourceFile(filename, sourceText);
  const filteredStatements = sourceFile.statements
    .map(removeLoaderExports)
    .filter((statement): statement is ts.Statement => Boolean(statement));

  const declarationOwners = new Map<string, number>();
  const statementInfos = filteredStatements.map((statement, index) => {
    const declarations = collectDeclaredNames(statement);
    for (const name of declarations) {
      declarationOwners.set(name, index);
    }

    return {
      index,
      statement,
      declarations,
      references: collectRuntimeReferences(statement),
      isImport: ts.isImportDeclaration(statement),
      isTypeOnly: isTypeOnlyStatement(statement),
      isRoot: isRootStatement(statement),
    };
  });

  const keptIndexes = new Set<number>();
  const queue: number[] = [];

  for (const info of statementInfos) {
    if (!info.isImport && (info.isTypeOnly || info.isRoot)) {
      keptIndexes.add(info.index);
      queue.push(info.index);
    }
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    for (const reference of statementInfos[index].references) {
      const owner = declarationOwners.get(reference);
      if (owner === undefined || keptIndexes.has(owner)) {
        continue;
      }

      keptIndexes.add(owner);
      queue.push(owner);
    }
  }

  const keptReferences = new Set<string>();
  for (const index of keptIndexes) {
    for (const reference of statementInfos[index].references) {
      keptReferences.add(reference);
    }
  }

  const nextStatements = statementInfos.flatMap((info) => {
    if (info.isImport) {
      const nextImport = pruneImportStatement(info.statement as ts.ImportDeclaration, keptReferences);
      return nextImport ? [nextImport] : [];
    }

    return keptIndexes.has(info.index) ? [info.statement] : [];
  });

  return printSourceFile(sourceFile, nextStatements);
}

function createSourceFile(filename: string, sourceText: string) {
  return ts.createSourceFile(
    stripQuery(filename),
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFilename(filename)
  );
}

function scriptKindForFilename(filename: string) {
  const cleanFilename = stripQuery(filename);
  if (cleanFilename.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (cleanFilename.endsWith('.ts')) return ts.ScriptKind.TS;
  if (cleanFilename.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function stripQuery(filename: string) {
  const queryStart = filename.indexOf('?');
  return queryStart === -1 ? filename : filename.slice(0, queryStart);
}

function printSourceFile(sourceFile: ts.SourceFile, statements: ts.Statement[]) {
  const nextSourceFile = ts.factory.updateSourceFile(sourceFile, statements);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printFile(nextSourceFile);
}

function rewriteRoutesImport(statement: ts.ImportDeclaration) {
  if (!ts.isStringLiteral(statement.moduleSpecifier)) {
    return statement;
  }

  const modulePath = statement.moduleSpecifier.text;
  const importClause = statement.importClause;
  if (!importClause || importClause.isTypeOnly || !isRelativeModule(modulePath)) {
    return statement;
  }

  const nextImportClause = ts.factory.updateImportClause(
    importClause,
    importClause.isTypeOnly,
    importClause.name,
    filterLoaderNamedImports(importClause.namedBindings)
  );

  return ts.factory.updateImportDeclaration(
    statement,
    statement.modifiers,
    nextImportClause,
    ts.factory.createStringLiteral(withQuery(modulePath, MATCHA_CLIENT_QUERY)),
    statement.attributes
  );
}

function filterLoaderNamedImports(namedBindings: ts.NamedImportBindings | undefined) {
  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return namedBindings;
  }

  const elements = namedBindings.elements.filter((element) => !isLoaderImport(element));
  return ts.factory.updateNamedImports(namedBindings, elements);
}

function stripRouteLoaderProperties(statement: ts.VariableStatement) {
  const declarationList = ts.factory.updateVariableDeclarationList(
    statement.declarationList,
    statement.declarationList.declarations.map((declaration) => {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'routes' &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        const nextRoutes = declaration.initializer.elements.map((element) => {
          if (!ts.isObjectLiteralExpression(element)) {
            return element;
          }

          return ts.factory.updateObjectLiteralExpression(
            element,
            element.properties.filter((property) => !isLoaderRouteProperty(property))
          );
        });

        return ts.factory.updateVariableDeclaration(
          declaration,
          declaration.name,
          declaration.exclamationToken,
          declaration.type,
          ts.factory.updateArrayLiteralExpression(declaration.initializer, nextRoutes)
        );
      }

      return declaration;
    })
  );

  return ts.factory.updateVariableStatement(statement, statement.modifiers, declarationList);
}

function removeLoaderExports(statement: ts.Statement) {
  if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name && isLoaderName(statement.name.text)) {
    return undefined;
  }

  if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
    const declarations = statement.declarationList.declarations.filter((declaration) => {
      return !(ts.isIdentifier(declaration.name) && isLoaderName(declaration.name.text));
    });

    if (declarations.length === 0) {
      return undefined;
    }

    const declarationList = ts.factory.updateVariableDeclarationList(statement.declarationList, declarations);
    return ts.factory.updateVariableStatement(statement, statement.modifiers, declarationList);
  }

  if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    const elements = statement.exportClause.elements.filter((element) => !isLoaderExportSpecifier(element));
    if (elements.length === 0) {
      return undefined;
    }

    return ts.factory.updateExportDeclaration(
      statement,
      statement.modifiers,
      statement.isTypeOnly,
      ts.factory.updateNamedExports(statement.exportClause, elements),
      statement.moduleSpecifier,
      statement.attributes
    );
  }

  return statement;
}

function pruneImportStatement(statement: ts.ImportDeclaration, keptReferences: Set<string>) {
  const importClause = statement.importClause;
  if (!importClause) {
    return statement;
  }

  if (importClause.isTypeOnly) {
    return statement;
  }

  const defaultImport = importClause.name && keptReferences.has(importClause.name.text)
    ? importClause.name
    : undefined;

  let namedBindings = importClause.namedBindings;
  if (namedBindings && ts.isNamedImports(namedBindings)) {
    const elements = namedBindings.elements.filter((element) => keptReferences.has(element.name.text));
    namedBindings = elements.length > 0
      ? ts.factory.updateNamedImports(namedBindings, elements)
      : undefined;
  } else if (namedBindings && ts.isNamespaceImport(namedBindings) && !keptReferences.has(namedBindings.name.text)) {
    namedBindings = undefined;
  }

  if (!defaultImport && !namedBindings) {
    return undefined;
  }

  const nextImportClause = ts.factory.updateImportClause(
    importClause,
    importClause.isTypeOnly,
    defaultImport,
    namedBindings
  );

  return ts.factory.updateImportDeclaration(
    statement,
    statement.modifiers,
    nextImportClause,
    statement.moduleSpecifier,
    statement.attributes
  );
}

function collectDeclaredNames(statement: ts.Statement) {
  const names = new Set<string>();

  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) {
    if (statement.name) {
      names.add(statement.name.text);
    }
    return names;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, names);
    }
  }

  return names;
}

function collectBindingNames(name: ts.BindingName, names: Set<string>) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) {
      continue;
    }
    collectBindingNames(element.name, names);
  }
}

function collectRuntimeReferences(statement: ts.Statement) {
  const references = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      return;
    }

    if (ts.isIdentifier(node) && shouldCountIdentifier(node)) {
      references.add(node.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(statement);
  return references;
}

function shouldCountIdentifier(node: ts.Identifier) {
  const parent = node.parent;

  if (
    (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isEnumDeclaration(parent) || ts.isTypeParameterDeclaration(parent) || ts.isModuleDeclaration(parent)) &&
    parent.name === node
  ) {
    return false;
  }

  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === node) {
    return false;
  }

  if (
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isNamespaceExport(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakStatement(parent) ||
    ts.isContinueStatement(parent)
  ) {
    return false;
  }

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return false;
  }

  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node) {
    return false;
  }

  if (ts.isShorthandPropertyAssignment(parent)) {
    return true;
  }

  if (ts.isJsxAttribute(parent) && parent.name === node) {
    return false;
  }

  return true;
}

function isExportedRoutesDeclaration(statement: ts.Statement): statement is ts.VariableStatement {
  if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
    return false;
  }

  return statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'routes');
}

function isLoaderRouteProperty(property: ts.ObjectLiteralElementLike) {
  return (
    ts.isPropertyAssignment(property) &&
    ts.isIdentifier(property.name) &&
    isLoaderName(property.name.text)
  );
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
    : false;
}

function isRootStatement(statement: ts.Statement) {
  if (ts.isImportDeclaration(statement)) {
    return false;
  }

  if (isTypeOnlyStatement(statement)) {
    return true;
  }

  if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) {
    return true;
  }

  if (hasExportModifier(statement)) {
    return true;
  }

  return collectDeclaredNames(statement).size === 0;
}

function isTypeOnlyStatement(statement: ts.Statement) {
  return ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement);
}

function isLoaderImport(element: ts.ImportSpecifier) {
  return isLoaderName(element.name.text) || isLoaderName(element.propertyName?.text);
}

function isLoaderExportSpecifier(element: ts.ExportSpecifier) {
  return isLoaderName(element.name.text) || isLoaderName(element.propertyName?.text);
}

function isLoaderName(value: string | undefined) {
  return value ? LOADER_EXPORT_NAMES.has(value) : false;
}

function isRelativeModule(modulePath: string) {
  return modulePath.startsWith('./') || modulePath.startsWith('../');
}

function withQuery(modulePath: string, query: string) {
  return modulePath.includes('?') ? `${modulePath}&${query}` : `${modulePath}?${query}`;
}
