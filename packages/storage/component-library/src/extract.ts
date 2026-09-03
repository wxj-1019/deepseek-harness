/**
 * Pure static extraction of component records from one `.tsx` source text.
 * Nothing here evaluates components: the TypeScript parser only builds a
 * syntax tree, so CSS imports and JSX never execute.
 * @module @deepseek-ai/dsh-component-library/src/extract
 */

import ts from 'typescript'
import type { ComponentProp } from './types.ts'

/** One component discovered in a single source file. */
export interface ExtractedComponent {
  /** Exported component name. */
  readonly name: string
  /** Leading JSDoc summary, `''` when the declaration carries none. */
  readonly jsdoc: string
  /** The JSDoc `@example` block body, `''` when absent. */
  readonly example: string
  /** Props resolved from the component's props type. */
  readonly props: readonly ComponentProp[]
  /** False when the props type was too dynamic to resolve into members. */
  readonly propsInferred: boolean
  /** Raw props type text kept when {@link ExtractedComponent.propsInferred} is false. */
  readonly rawProps: string
}

/** Match one PascalCase exported component declaration. */
const COMPONENT_NAME = /^[A-Z]/

/** Match every `--dsw-*` custom property reference in a CSS module text. */
const DSW_TOKEN = /--dsw-[a-z0-9-]+/g

/**
 * Collect the sorted unique `--dsw-*` token names one CSS module references.
 * @param cssText - raw stylesheet text.
 * @returns sorted unique token names.
 */
export function extractCssTokenRefs(cssText: string): string[] {
  return [...new Set(cssText.match(DSW_TOKEN) ?? [])].sort()
}

/** One named type declaration visible inside the scanned file. */
type LocalTypeDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration

/** One candidate source for a component's props type, in resolution order. */
type PropsCandidate = ts.TypeNode | LocalTypeDeclaration

/** Read the resolved summary and `@example` body off one declaration's JSDoc. */
function readJsdoc(node: ts.Node, source: ts.SourceFile): { jsdoc: string; example: string } {
  const jsdocNode = ts.getJSDocCommentsAndTags(node).findLast(ts.isJSDoc)
  if (jsdocNode === undefined) return { jsdoc: '', example: '' }
  const render = (comment: string | readonly ts.JSDocComment[] | undefined): string =>
    typeof comment === 'string'
      ? comment.trim()
      : (comment ?? []).map(part => part.getText(source)).join('').trim()
  let example = ''
  for (const tag of jsdocNode.tags ?? []) {
    if (tag.tagName.getText(source) === 'example') example = render(tag.comment)
  }
  return { jsdoc: render(jsdocNode.comment), example }
}

/** Resolve one property signature into the record's prop shape. */
function toProp(member: ts.TypeElement, source: ts.SourceFile): ComponentProp | undefined {
  if (!ts.isPropertySignature(member) || member.type === undefined) return undefined
  return {
    name: member.name.getText(source),
    type: member.type.getText(source),
    required: member.questionToken === undefined,
  }
}

/**
 * Resolve one props candidate to its members list. Returns `undefined` when
 * the type is too dynamic for checker-free analysis — unions, conditionals,
 * intersections with unresolvable operands, mapped types, heritage clauses —
 * in which case only the raw text remains trustworthy.
 */
function resolveMembers(
  candidate: PropsCandidate,
  source: ts.SourceFile,
  types: ReadonlyMap<string, LocalTypeDeclaration>,
): readonly ts.TypeElement[] | undefined {
  if (ts.isInterfaceDeclaration(candidate)) {
    if (candidate.heritageClauses !== undefined && candidate.heritageClauses.length > 0) return undefined
    return [...candidate.members]
  }
  if (ts.isTypeAliasDeclaration(candidate)) return resolveMembers(candidate.type, source, types)
  if (ts.isTypeLiteralNode(candidate)) return [...candidate.members]
  if (ts.isParenthesizedTypeNode(candidate)) return resolveMembers(candidate.type, source, types)
  if (ts.isTypeReferenceNode(candidate)) {
    const named = types.get(candidate.typeName.getText(source))
    return named === undefined ? undefined : resolveMembers(named, source, types)
  }
  return undefined
}

/** The function-like node that carries the props parameter. */
function propsParameter(
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
): ts.ParameterDeclaration | undefined {
  if (ts.isFunctionDeclaration(declaration)) return declaration.parameters.at(0)
  const initializer = declaration.initializer
  if (initializer === undefined) return undefined
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer.parameters.at(0)
  return undefined
}

/** Render one candidate's type text (the alias's right-hand side, not its statement). */
function rawTextOf(candidate: PropsCandidate, source: ts.SourceFile): string {
  if (ts.isTypeAliasDeclaration(candidate)) return candidate.type.getText(source)
  return candidate.getText(source)
}

/**
 * Resolve one component's props per the documented order: the `<Name>Props`
 * type when one exists, else the first parameter's own annotation, else an
 * exported `Props` type. The first candidate that fully resolves wins; when
 * some candidate exists but none resolves, the record keeps the first
 * candidate's raw text and `propsInferred: false`.
 */
function resolveProps(
  componentName: string,
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
  source: ts.SourceFile,
  types: ReadonlyMap<string, LocalTypeDeclaration>,
): Pick<ExtractedComponent, 'props' | 'propsInferred' | 'rawProps'> {
  const candidates: PropsCandidate[] = []
  const namedProps = types.get(`${componentName}Props`)
  if (namedProps !== undefined) candidates.push(namedProps)
  const parameter = propsParameter(declaration)
  if (parameter?.type !== undefined) candidates.push(parameter.type)
  const exportedProps = types.get('Props')
  if (exportedProps !== undefined && exportedProps !== namedProps) candidates.push(exportedProps)

  for (const candidate of candidates) {
    const members = resolveMembers(candidate, source, types)
    if (members === undefined) continue
    const props: ComponentProp[] = []
    let renderable = true
    for (const member of members) {
      const prop = toProp(member, source)
      if (prop === undefined) {
        renderable = false
        break
      }
      props.push(prop)
    }
    if (renderable) return { props, propsInferred: true, rawProps: '' }
  }
  // No annotated parameter and no named props type: the component takes none.
  const first = candidates.at(0)
  if (first === undefined) return { props: [], propsInferred: true, rawProps: '' }
  return { props: [], propsInferred: false, rawProps: rawTextOf(first, source) }
}

/** True when one declaration statement carries the export keyword. */
function hasExportModifier(statement: ts.FunctionDeclaration | ts.VariableStatement): boolean {
  return ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
}

/**
 * Extract every exported PascalCase component from one `.tsx` source text.
 * @param fileName - name used for the parser's source file identity.
 * @param sourceText - raw file contents.
 * @returns one entry per exported component declaration, in source order.
 */
export function extractComponents(fileName: string, sourceText: string): ExtractedComponent[] {
  // setParentNodes: ts.getJSDocCommentsAndTags walks parents, so the public
  // JSDoc API returns nothing without them.
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const types = new Map<string, LocalTypeDeclaration>()
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      types.set(statement.name.getText(source), statement)
    }
  }

  const components: ExtractedComponent[] = []
  const visit = (
    componentName: string,
    declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
    jsdocHost: ts.Node,
  ): void => {
    if (!COMPONENT_NAME.test(componentName)) return
    components.push({
      name: componentName,
      ...readJsdoc(jsdocHost, source),
      ...resolveProps(componentName, declaration, source, types),
    })
  }
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && hasExportModifier(statement)) {
      visit(statement.name.getText(source), statement, statement)
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const initializer = declaration.initializer
        // A component const is callable: an arrow/function expression, or a
        // wrapper call such as `memo(...)`/`forwardRef(...)`. Literal-valued
        // PascalCase constants (MAX, VERSION) are not components.
        if (initializer === undefined) continue
        if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer) && !ts.isCallExpression(initializer)) continue
        visit(declaration.name.getText(source), declaration, statement)
      }
    }
  }
  return components
}
