import { PLACEHOLDER } from "./constants";

export type AstNode = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

export type Placeholder = {
  start: number;
  end: number;
  /** `{ SHADOW_STYLE }` needs to be expanded to `{ SHADOW_STYLE: "..." }`. */
  shorthand: boolean;
};

function isNode(value: unknown): value is AstNode {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as AstNode).type === "string"
  );
}

function isPlaceholder(value: unknown): value is AstNode {
  return (
    isNode(value) && value.type === "Identifier" && value.name === PLACEHOLDER
  );
}

/**
 * Whether an identifier in `parent[key]` is a variable reference, as opposed to
 * a property name, label or module specifier sharing the same name.
 */
function isReference(parent: AstNode | undefined, key: string): boolean {
  switch (parent?.type) {
    case "MemberExpression":
    case "Property":
    case "PropertyDefinition":
    case "MethodDefinition":
      return (key !== "property" && key !== "key") || !!parent.computed;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ExportSpecifier":
      return false;
    default:
      return true;
  }
}

/**
 * Collects every reference to the placeholder global in a parsed chunk, sorted
 * by position.
 */
export function findPlaceholders(ast: AstNode): Placeholder[] {
  const found: Placeholder[] = [];

  const visit = (node: AstNode, parent: AstNode | undefined, key: string) => {
    if (node.type === "Identifier") {
      if (node.name === PLACEHOLDER && isReference(parent, key))
        found.push({ start: node.start, end: node.end, shorthand: false });
      return;
    }

    if (
      node.type === "Property" &&
      node.shorthand &&
      parent?.type === "ObjectExpression" &&
      isPlaceholder(node.value)
    ) {
      found.push({
        start: node.value.start,
        end: node.value.end,
        shorthand: true
      });
      return;
    }

    for (const [childKey, child] of Object.entries(node)) {
      if (Array.isArray(child)) {
        for (const item of child) if (isNode(item)) visit(item, node, childKey);
      } else if (isNode(child)) {
        visit(child, node, childKey);
      }
    }
  };

  visit(ast, undefined, "");

  return found.sort((a, b) => a.start - b.start);
}
