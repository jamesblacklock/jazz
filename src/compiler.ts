import ENTITIES from "./htmlEntities";
import { Component, HtmlComponent, TextComponent, If, Foreach, ForeachContext } from "./index";

type Directive = {
  type: "directive";
} & ({
  directive: "if";
  expr: string;
  ast: Ast;
  elseAst?: Ast;
} | {
  directive: "children";
});

interface Script {
  type: "script";
  expr: string;
}

type AstNode = string | Directive | E | Script;
type Ast = AstNode[];

interface E {
  type: "element";
  tag: string;
  ast: Ast;
  props: { [key: string]: string | Script };
}

function parseText(remaining: string) {
  let offset = 0;
  while (remaining[offset] && !remaining[offset].match(/[<\{\}@]/)) {
    offset++;
  }
  const match = remaining.slice(0, offset).replaceAll(/[\s\n]+/g, " ");
  const entitiesSplit = match.split(/(?<=&\w+;)|(?=&\w+;)/);
  let result = "";
  for (let piece of entitiesSplit) {
    if (piece.match(/^&\w+;$/)) {
      piece = ENTITIES[piece as keyof typeof ENTITIES] ?? piece;
    }
    result += piece;
  }
  return [result === " " ? "" : result, remaining.slice(match.length)];
}

function parseProps(remaining: string) {
  const props: E["props"] = {};
  while (remaining[0] !== '>' && remaining[0] !== '/') {
    let [full, name] = remaining.match(/^[\s\n]*(\w+)[\s\n]*=[\s\n]*/) ?? [];
    if (!full) {
      throw new Error("syntax error");
    }
    remaining = remaining.slice(full.length);
    let value;
    if (remaining[0] === '"') {
      value = remaining.match(/^"((?:\\"|[^"])*)"/)?.[1];
      if (value === undefined) {
        throw new Error("syntax error");
      }
      remaining = remaining.slice(value.length + 2);
    } else {
      if (remaining[0] !== '{') {
        throw new Error("syntax error");
      }
      [value, remaining] = parseScript(remaining);
    }
    props[name] = value;
    const spaces = remaining.match(/^[\s\n]*/)?.[0] ?? "";
    remaining = remaining.slice(spaces.length);
  }
  return [props, remaining] as const;
}

function parseElement(remaining: string): [E, string] {
  let full, tag;
  [full, tag] = remaining.match(/^<[\s\n]*(\w*)[\s\n]*/)!;
  if (!tag) {
    throw new Error("syntax error");
  }

  remaining = remaining.slice(full.length);

  let props;
  [props, remaining] = parseProps(remaining);
  let selfClose;
  if (remaining[0] === '/') {
    selfClose = true;
    if (remaining[1] !== '>') {
      throw new Error("syntax error");
    }
    remaining = remaining.slice(2);
  } else {
    remaining = remaining.slice(1);
  }
  let ast: Ast = [];
  if (!selfClose) {
    [ast, remaining] = parseTemplate(remaining, true);
    const close = remaining.match(`^</[\\s\\n]*${tag}[\\s\\n]*>`)?.[0];
    if (!close) {
      throw new Error("syntax error");
    }
    remaining = remaining.slice(close.length);
  }
  return [{ type: "element", tag, ast, props }, remaining] as const;
}

function parseScript(remaining: string, initialOffset = 1): [Script, string] {
  let braceDepth = 1;
  let offset = initialOffset;
  while (remaining[offset] && braceDepth > 0) {
    if (remaining[offset] === '{') {
      braceDepth++;
    } else if (remaining[offset] === '}') {
      braceDepth--;
    }
    offset++;
  }
  const match = remaining.slice(initialOffset, offset - 1);
  if (braceDepth > 0) {
    throw new Error("syntax error");
  }
  return [{ expr: match, type: "script" }, remaining.slice(match.length + 1 + initialOffset)] as const;

}

function parseDirective(remaining: string): [Directive, string] {
  let braceEnclosed = remaining[0] === '{';
  let full, directive;
  if (braceEnclosed) {
    full = remaining.match(/^\{[\s\n]*/)![0];
    remaining = remaining.slice(full.length);
  }

  [full, directive] = remaining.match(/^@(\w+)\b[\s\n]*/) ?? [];
  if (!full) {
    throw new Error("syntax error");
  }
  remaining = remaining.slice(full.length);

  let result: Directive;
  if (directive === "children") {
    result = { type: "directive", directive: "children" };
  } else {
    if (remaining[0] !== '{') {
      throw new Error("syntax error");
    }

    if (directive === "if") {
      let script;
      [script, remaining] = parseScript(remaining);
      full = remaining.match(/^[\s\n]*\{/)?.[0];
      if (!full) {
        throw new Error("syntax error");
      }

      let ast;
      [ast, remaining] = parseTemplate(remaining.slice(full.length), true);
      if (remaining[0] !== '}') {
        throw new Error("syntax error");
      }

      let elseAst;
      full = remaining.match(/^\}[\s\n]*@else[\s\n]*{/)?.[0];
      if (full) {
        [elseAst, remaining] = parseTemplate(remaining.slice(full.length), true);
        if (remaining[0] !== '}') {
          throw new Error("syntax error");
        }
      }
      remaining = remaining.slice(1);
      result = { type: "directive", directive: "if", expr: script.expr, ast, elseAst };
    } else {
      throw new Error("syntax error");
    }
  }

  if (braceEnclosed) {
    full = remaining.match(/^[\s\n]*\}/)?.[0];
    if (!full) {
      throw new Error("syntax error");
    }
    remaining = remaining.slice(full.length);
  }

  return [result, remaining];
}

function parseTemplate(template: string, inElement: boolean = false): [Ast, string] {
  const ast: Ast = [];
  let remaining = template;
  let result;
  while (remaining.length > 0) {
    if (remaining.slice(0, 2) === '</' || remaining[0] === '}') {
      if (inElement) {
        break;
      }
      throw new Error("syntax error");
    }
    if (remaining[0] === '<') {
      [result, remaining] = parseElement(remaining);
      ast.push(result);
    } else if (remaining[0] === '{') {
      if (remaining.match(/^\{[\s\n]*@/)) {
        [result, remaining] = parseDirective(remaining);
      } else {
        [result, remaining] = parseScript(remaining);
      }
      ast.push(result);
    } else if (remaining[0] === '@') {
      [result, remaining] = parseDirective(remaining);
      ast.push(result);
    } else if (remaining[0]) {
      [result, remaining] = parseText(remaining);
      if (result) {
        ast.push(result);
      }
    }
  }
  return [ast, remaining] as const;
}

export function compileTemplate(component: Component): Component[] {
  const ast = parse(component.template!);
  if (ast.length !== 1) {
    throw new Error("component must have a single root");
  }
  return buildComponent(ast[0], component);
}

function parse(template: string): Ast {
  return parseTemplate(template)[0];
}

function buildComponent(node: AstNode, componentContext: Component): Component[] {
  let component: Component;
  if (typeof node === "string") {
    component = new TextComponent(node);
  } else if (node.type === "script") {
    const script: (value: any, state: any) => any = eval(`(props, state) => { return { textContent: (${node.expr}).toString() }; }`);
    component = new TextComponent("");
    component.bind(componentContext, script);
  } else if (node.type === "directive" && node.directive === "if") {
    const f: (value: any, state: any) => any = eval(`(props, state, $foreach) => { return { cond: (${node.expr}) }; }`);
    let ifComponent = new If();
    ifComponent.bind(componentContext, f);
    for (const child of node.ast) {
      ifComponent.children.push(...buildComponent(child, componentContext));
    }
    for (const child of node.elseAst ?? []) {
      const elseChild = buildComponent(child, componentContext);
      ifComponent.children.push(...elseChild);
      elseChild.forEach(e => ifComponent.elseChildren.add(e));
    }
    component = ifComponent;
  } else if (node.type === "directive" && node.directive === "children") {
    return componentContext.children;
  } else {
    if (node.tag[0] === node.tag[0].toLowerCase()) {
      component = new HtmlComponent(node.tag as keyof HTMLElementTagNameMap);
    } else {
      const Constructor = componentContext.imports?.[node.tag];
      if (!Constructor) {
        throw new Error(`import missing: ${node.tag}`);
      }
      component = new Constructor();
    }
    for (const child of node.ast) {
      component.children.push(...buildComponent(child, componentContext));
    }
    if (Object.keys(node.props).length > 0) {
      let script = "";
      let isBinding = false;
      for (const name in node.props) {
        const value = node.props[name];
        if (typeof value === "string") {
          script += `"${name}": (${value}), `
        } else {
          isBinding = true;
          script = script + `"${name}": (${value.expr}), `;
        }
      }
      if (isBinding) {
        script = `(props, state) => { return { ${script} }; }`;
        const f = eval(script);
        component.bind(componentContext, f);
      } else {
        const props = eval(`({ ${script} })`);
        component.props.update(props);
      }
    }
  }

  return [component];
}
