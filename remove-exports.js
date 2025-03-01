// Extracted from the remix repo
// https://github.com/remix-run/remix/blob/ede2012949a784722d8989124dff5a34ae90c008/packages/remix-dev/vite/remove-exports.ts
import babelGenerate from "@babel/generator";
import { parse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";

const traverse = babelTraverse.default;
const generate = babelGenerate.default;

export { generate, parse, t, traverse };
function getIdentifier(path) {
  let parentPath = path.parentPath;
  if (parentPath.type === "VariableDeclarator") {
    let variablePath = parentPath;
    let name = variablePath.get("id");
    return name.node.type === "Identifier" ? name : null;
  }
  if (parentPath.type === "AssignmentExpression") {
    let variablePath = parentPath;
    let name = variablePath.get("left");
    return name.node.type === "Identifier" ? name : null;
  }
  if (path.node.type === "ArrowFunctionExpression") {
    return null;
  }
  return path.node.id && path.node.id.type === "Identifier"
    ? path.get("id")
    : null;
}
function isIdentifierReferenced(ident) {
  let binding = ident.scope.getBinding(ident.node.name);
  if (binding === null || binding === void 0 ? void 0 : binding.referenced) {
    // Functions can reference themselves, so we need to check if there's a
    // binding outside the function scope or not.
    if (binding.path.type === "FunctionDeclaration") {
      return !binding.constantViolations
        .concat(binding.referencePaths)
        // Check that every reference is contained within the function:
        .every((ref) =>
          ref.findParent(
            (parent) =>
              parent ===
              (binding === null || binding === void 0 ? void 0 : binding.path)
          )
        );
    }
    return true;
  }
  return false;
}
export const removeExports = (
  source,
  exportsToRemove,
  generateOptions = {}
) => {
  let document = parse(source, { sourceType: "module" });
  let referencedIdentifiers = new Set();
  let removedExports = new Set();
  let markImport = (path) => {
    let local = path.get("local");
    if (isIdentifierReferenced(local)) {
      referencedIdentifiers.add(local);
    }
  };
  let markFunction = (path) => {
    let identifier = getIdentifier(path);
    if (
      (identifier === null || identifier === void 0
        ? void 0
        : identifier.node) &&
      isIdentifierReferenced(identifier)
    ) {
      referencedIdentifiers.add(identifier);
    }
  };
  traverse(document, {
    VariableDeclarator(variablePath) {
      if (variablePath.node.id.type === "Identifier") {
        let local = variablePath.get("id");
        if (isIdentifierReferenced(local)) {
          referencedIdentifiers.add(local);
        }
      } else if (variablePath.node.id.type === "ObjectPattern") {
        let pattern = variablePath.get("id");
        let properties = pattern.get("properties");
        properties.forEach((p) => {
          let local = p.get(
            p.node.type === "ObjectProperty"
              ? "value"
              : p.node.type === "RestElement"
              ? "argument"
              : (function () {
                  throw new Error("invariant");
                })()
          );
          if (isIdentifierReferenced(local)) {
            referencedIdentifiers.add(local);
          }
        });
      } else if (variablePath.node.id.type === "ArrayPattern") {
        let pattern = variablePath.get("id");
        let elements = pattern.get("elements");
        elements.forEach((element) => {
          var _a, _b;
          let local;
          if (
            ((_a = element.node) === null || _a === void 0
              ? void 0
              : _a.type) === "Identifier"
          ) {
            local = element;
          } else if (
            ((_b = element.node) === null || _b === void 0
              ? void 0
              : _b.type) === "RestElement"
          ) {
            local = element.get("argument");
          } else {
            return;
          }
          if (isIdentifierReferenced(local)) {
            referencedIdentifiers.add(local);
          }
        });
      }
    },
    FunctionDeclaration: markFunction,
    FunctionExpression: markFunction,
    ArrowFunctionExpression: markFunction,
    ImportSpecifier: markImport,
    ImportDefaultSpecifier: markImport,
    ImportNamespaceSpecifier: markImport,
    ExportNamedDeclaration(path) {
      var _a;
      let shouldRemove = false;
      // Handle re-exports: export { preload } from './foo'
      path.node.specifiers = path.node.specifiers.filter((spec) => {
        if (spec.exported.type !== "Identifier") {
          return true;
        }
        let { name } = spec.exported;
        for (let namedExport of exportsToRemove) {
          if (name === namedExport) {
            removedExports.add(namedExport);
            return false;
          }
        }
        return true;
      });
      let { declaration } = path.node;
      // When no re-exports are left, remove the path
      if (!declaration && path.node.specifiers.length === 0) {
        shouldRemove = true;
      }
      if (declaration && declaration.type === "VariableDeclaration") {
        declaration.declarations = declaration.declarations.filter(
          (declarator) => {
            for (let name of exportsToRemove) {
              if (declarator.id.name === name) {
                removedExports.add(name);
                return false;
              }
            }
            return true;
          }
        );
        if (declaration.declarations.length === 0) {
          shouldRemove = true;
        }
      }
      if (declaration && declaration.type === "FunctionDeclaration") {
        for (let name of exportsToRemove) {
          if (
            ((_a = declaration.id) === null || _a === void 0
              ? void 0
              : _a.name) === name
          ) {
            shouldRemove = true;
            removedExports.add(name);
          }
        }
      }
      if (shouldRemove) {
        path.remove();
      }
    },
  });
  if (removedExports.size === 0) {
    // No server-specific exports found so there's
    // no need to remove unused references
    return generate(document, generateOptions);
  }
  let referencesRemovedInThisPass;
  let sweepFunction = (path) => {
    let identifier = getIdentifier(path);
    if (
      (identifier === null || identifier === void 0
        ? void 0
        : identifier.node) &&
      referencedIdentifiers.has(identifier) &&
      !isIdentifierReferenced(identifier)
    ) {
      ++referencesRemovedInThisPass;
      if (
        t.isAssignmentExpression(path.parentPath.node) ||
        t.isVariableDeclarator(path.parentPath.node)
      ) {
        path.parentPath.remove();
      } else {
        path.remove();
      }
    }
  };
  let sweepImport = (path) => {
    let local = path.get("local");
    if (referencedIdentifiers.has(local) && !isIdentifierReferenced(local)) {
      ++referencesRemovedInThisPass;
      path.remove();
      if (path.parent.specifiers.length === 0) {
        path.parentPath.remove();
      }
    }
  };
  // Traverse again to remove unused references. This happens at least once,
  // then repeats until no more references are removed.
  do {
    referencesRemovedInThisPass = 0;
    traverse(document, {
      Program(path) {
        path.scope.crawl();
      },
      // eslint-disable-next-line no-loop-func
      VariableDeclarator(variablePath) {
        if (variablePath.node.id.type === "Identifier") {
          let local = variablePath.get("id");
          if (
            referencedIdentifiers.has(local) &&
            !isIdentifierReferenced(local)
          ) {
            ++referencesRemovedInThisPass;
            variablePath.remove();
          }
        } else if (variablePath.node.id.type === "ObjectPattern") {
          let pattern = variablePath.get("id");
          let beforeCount = referencesRemovedInThisPass;
          let properties = pattern.get("properties");
          properties.forEach((property) => {
            let local = property.get(
              property.node.type === "ObjectProperty"
                ? "value"
                : property.node.type === "RestElement"
                ? "argument"
                : (function () {
                    throw new Error("invariant");
                  })()
            );
            if (
              referencedIdentifiers.has(local) &&
              !isIdentifierReferenced(local)
            ) {
              ++referencesRemovedInThisPass;
              property.remove();
            }
          });
          if (
            beforeCount !== referencesRemovedInThisPass &&
            pattern.get("properties").length < 1
          ) {
            variablePath.remove();
          }
        } else if (variablePath.node.id.type === "ArrayPattern") {
          let pattern = variablePath.get("id");
          let beforeCount = referencesRemovedInThisPass;
          let elements = pattern.get("elements");
          elements.forEach((e) => {
            var _a, _b;
            let local;
            if (
              ((_a = e.node) === null || _a === void 0 ? void 0 : _a.type) ===
              "Identifier"
            ) {
              local = e;
            } else if (
              ((_b = e.node) === null || _b === void 0 ? void 0 : _b.type) ===
              "RestElement"
            ) {
              local = e.get("argument");
            } else {
              return;
            }
            if (
              referencedIdentifiers.has(local) &&
              !isIdentifierReferenced(local)
            ) {
              ++referencesRemovedInThisPass;
              e.remove();
            }
          });
          if (
            beforeCount !== referencesRemovedInThisPass &&
            pattern.get("elements").length < 1
          ) {
            variablePath.remove();
          }
        }
      },
      FunctionDeclaration: sweepFunction,
      FunctionExpression: sweepFunction,
      ArrowFunctionExpression: sweepFunction,
      ImportSpecifier: sweepImport,
      ImportDefaultSpecifier: sweepImport,
      ImportNamespaceSpecifier: sweepImport,
    });
  } while (referencesRemovedInThisPass);
  return generate(document, generateOptions);
};
