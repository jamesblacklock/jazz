import ENTITIES from "./htmlEntities";
import { Component, COMPONENT_MAP, ForeachItemComponent } from "./index";

type Directive = {
  type: "directive";
} & ({
  directive: "if";
  expr: string;
  ast: Ast;
  elseAst?: Ast;
} | {
  directive: "children";
} | {
  directive: "foreach";
  itemName: string;
  indexName?: string;
  expr: string;
  ast: Ast;
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
  while (remaining[offset] && !remaining.slice(offset, offset + 2).match(/^(?:[<\{\}@]|\/\/)/)) {
    offset++;
  }
  const match = remaining.slice(0, offset);
  const entitiesSplit = match.replaceAll(/[\s\n]+/g, " ").split(/(?<=&\w+;)|(?=&\w+;)/);
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
      value = remaining.match(/^("(?:\\"|[^"])*")/)?.[1];
      if (value === undefined) {
        throw new Error("syntax error");
      }
      remaining = remaining.slice(value.length);
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
  if (tag[0].toLowerCase() === tag[0] && !(tag in TAGS!)) {
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

function parseDirective(remaining: string, allowElseIf = false): [Directive, string] {
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

    if (directive === "if" || (allowElseIf && directive === "elseif")) {
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
      full = remaining.match(/^}[\s\n]*(?=@elseif\b)/)?.[0];
      if (full) {
        remaining = remaining.slice(full.length);
        let elseIf;
        [elseIf, remaining] = parseDirective(remaining, true);
        elseAst = [elseIf];
      } else {
        full = remaining.match(/^\}[\s\n]*@else[\s\n]*{/)?.[0];
        if (full) {
          [elseAst, remaining] = parseTemplate(remaining.slice(full.length), true);
          if (remaining[0] !== '}') {
            throw new Error("syntax error");
          }
        }
        remaining = remaining.slice(1);
      }

      result = { type: "directive", directive: "if", expr: script.expr, ast, elseAst };
    } else if (directive === "foreach") {
      let itemName, indexName;
      [full, itemName, indexName] = remaining.match(/^\{[\s\n]*(\w+)(?:[\s\n]*,[\s\n]*(\w+))?[\s\n]+in[\s\n]+/) ?? [];
      if (!full) {
        throw new Error("syntax error");
      }
      let script;
      [script, remaining] = parseScript(remaining.slice(full.length), 0);
      full = remaining.match(/^[\s\n]*\{/)?.[0];
      if (!full) {
        throw new Error("syntax error");
      }

      let ast;
      [ast, remaining] = parseTemplate(remaining.slice(full.length), true);
      if (remaining[0] !== '}') {
        throw new Error("syntax error");
      }

      remaining = remaining.slice(1);
      result = { type: "directive", directive: "foreach", itemName, indexName, expr: script.expr, ast };
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
    if (remaining.slice(0, 2) === '//') {
      const comment = remaining.match(".*")![0];
      remaining = remaining.slice(comment.length);
    } else if (remaining[0] === '<') {
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

export function compileTemplate(component: Component<any, any, any>): Component[] {
  initTags();

  const ast = parse(component.config.template!);
  const nodes = [];
  if (component instanceof Component) {
    for (const astNode of ast) {
      nodes.push(...buildComponent(astNode, component));
    }
  } else {
    for (const astNode of ast) {
      nodes.push(...buildComponent(astNode, component));
    }
  }
  return nodes;
}

function parse(template: string): Ast {
  return parseTemplate(template)[0];
}

type HtmlComponentConstructor = {
  (tag: keyof HTMLElementTagNameMap): Component<any, any, any>;
}

let TAGS: { [K in keyof HTMLElementTagNameMap]?: HtmlComponentConstructor } | null = null;

function initTags() {
  if (TAGS === null) {
    TAGS = {
      // void elements
      area: Component.newHtmlComponent,
      base: Component.newHtmlComponent,
      br: Component.newHtmlComponent,
      col: Component.newHtmlComponent,
      embed: Component.newHtmlComponent,
      hr: Component.newHtmlComponent,
      img: Component.newHtmlComponent,
      input: Component.newHtmlInputComponent,
      link: Component.newHtmlComponent,
      meta: Component.newHtmlComponent,
      source: Component.newHtmlComponent,
      track: Component.newHtmlComponent,
      wbr: Component.newHtmlComponent,
    
      // text elements
      script: Component.newHtmlComponent,
      style: Component.newHtmlComponent,
      textarea: Component.newHtmlComponent,
      title: Component.newHtmlComponent,
    
      // normal elements
      a: Component.newHtmlAnchorComponent,
      abbr: Component.newHtmlComponent,
      address: Component.newHtmlComponent,
      article: Component.newHtmlComponent,
      aside: Component.newHtmlComponent,
      audio: Component.newHtmlComponent,
      b: Component.newHtmlComponent,
      bdi: Component.newHtmlComponent,
      bdo: Component.newHtmlComponent,
      blockquote: Component.newHtmlComponent,
      body: Component.newHtmlComponent,
      button: Component.newHtmlComponent,
      canvas: Component.newHtmlComponent,
      caption: Component.newHtmlComponent,
      cite: Component.newHtmlComponent,
      code: Component.newHtmlComponent,
      colgroup: Component.newHtmlComponent,
      data: Component.newHtmlComponent,
      datalist: Component.newHtmlComponent,
      dd: Component.newHtmlComponent,
      del: Component.newHtmlComponent,
      details: Component.newHtmlComponent,
      dfn: Component.newHtmlComponent,
      dialog: Component.newHtmlComponent,
      div: Component.newHtmlComponent,
      dl: Component.newHtmlComponent,
      dt: Component.newHtmlComponent,
      em: Component.newHtmlComponent,
      fieldset: Component.newHtmlComponent,
      figcaption: Component.newHtmlComponent,
      figure: Component.newHtmlComponent,
      footer: Component.newHtmlComponent,
      form: Component.newHtmlComponent,
      h1: Component.newHtmlComponent,
      h2: Component.newHtmlComponent,
      h3: Component.newHtmlComponent,
      h4: Component.newHtmlComponent,
      h5: Component.newHtmlComponent,
      h6: Component.newHtmlComponent,
      head: Component.newHtmlComponent,
      header: Component.newHtmlComponent,
      hgroup: Component.newHtmlComponent,
      html: Component.newHtmlComponent,
      i: Component.newHtmlComponent,
      iframe: Component.newHtmlComponent,
      ins: Component.newHtmlComponent,
      kbd: Component.newHtmlComponent,
      label: Component.newHtmlComponent,
      legend: Component.newHtmlComponent,
      li: Component.newHtmlComponent,
      main: Component.newHtmlComponent,
      map: Component.newHtmlComponent,
      mark: Component.newHtmlComponent,
      menu: Component.newHtmlComponent,
      meter: Component.newHtmlComponent,
      nav: Component.newHtmlComponent,
      noscript: Component.newHtmlComponent,
      object: Component.newHtmlComponent,
      ol: Component.newHtmlComponent,
      optgroup: Component.newHtmlComponent,
      option: Component.newHtmlComponent,
      output: Component.newHtmlComponent,
      p: Component.newHtmlComponent,
      picture: Component.newHtmlComponent,
      pre: Component.newHtmlComponent,
      progress: Component.newHtmlComponent,
      q: Component.newHtmlComponent,
      rp: Component.newHtmlComponent,
      rt: Component.newHtmlComponent,
      ruby: Component.newHtmlComponent,
      s: Component.newHtmlComponent,
      samp: Component.newHtmlComponent,
      search: Component.newHtmlComponent,
      section: Component.newHtmlComponent,
      select: Component.newHtmlComponent,
      slot: Component.newHtmlComponent,
      small: Component.newHtmlComponent,
      span: Component.newHtmlComponent,
      strong: Component.newHtmlComponent,
      sub: Component.newHtmlComponent,
      summary: Component.newHtmlComponent,
      sup: Component.newHtmlComponent,
      table: Component.newHtmlComponent,
      tbody: Component.newHtmlComponent,
      td: Component.newHtmlComponent,
      template: Component.newHtmlComponent,
      tfoot: Component.newHtmlComponent,
      th: Component.newHtmlComponent,
      thead: Component.newHtmlComponent,
      time: Component.newHtmlComponent,
      tr: Component.newHtmlComponent,
      u: Component.newHtmlComponent,
      ul: Component.newHtmlComponent,
      var: Component.newHtmlComponent,
      video: Component.newHtmlComponent,
    } as const;
  }
}

function buildComponent(node: AstNode, componentContext: Component<any, any, any>): Component[] {
  let args = "$props, $state";
  let bindings = "";
  const usedBindings = new Set;
  let propsComponent = componentContext;
  if (componentContext.type === "ForeachItem") {
    args += ", $foreach"
    for (const itemName in componentContext.config.data.context.bindings) {
      bindings += `let ${itemName} = $foreach.${itemName}.items[$foreach.${itemName}.index]; `;
      usedBindings.add(itemName);
      if (componentContext.config.data.context.bindings[itemName].indexName) {
        bindings += `let ${componentContext.config.data.context.bindings[itemName].indexName} = $foreach.${itemName}.index; `;
        usedBindings.add(itemName);
      }
    }
    propsComponent = COMPONENT_MAP.get((componentContext as unknown as ForeachItemComponent).config.data.componentContext)!;
  }
  for (const propName in propsComponent.state.value) {
    if (!usedBindings.has(propName)) {
      bindings += `let ${propName} = $state.value.${propName}; `;
      usedBindings.add(propName);
    }
  }
  for (const propName in propsComponent.props.value) {
    if (!usedBindings.has(propName)) {
      bindings += `let ${propName} = $props.${propName}; `;
      usedBindings.add(propName);
    }
  }

  let component: Component<any, any, any>;
  if (typeof node === "string") {
    component = Component.newTextComponent(node);
  } else if (node.type === "script") {
    const script: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { textContent: (${node.expr}).toString() }; }`);
    component = Component.newTextComponent("");
    component.bind(componentContext, script);
  } else if (node.type === "directive" && node.directive === "if") {
    const f: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { cond: (${node.expr}) }; }`);
    let ifComponent = Component.newIfComponent();
    ifComponent.bind(componentContext, f);
    for (const child of node.ast) {
      ifComponent.children.push(...buildComponent(child, componentContext));
    }
    for (const child of node.elseAst ?? []) {
      const elseChild = buildComponent(child, componentContext);
      ifComponent.children.push(...elseChild);
      elseChild.forEach(e => ifComponent.config.data.elseChildren.add(e.id));
    }
    component = ifComponent;
  } else if (node.type === "directive" && node.directive === "foreach") {
    const f: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { items: (${node.expr}) }; }`);
    const foreachComponent = Component.newForeachComponent(node.itemName, node.indexName, componentContext);
    foreachComponent.bind(componentContext, f);
    const foreachItem = Component.newForeachItemComponent(componentContext, foreachComponent.config.data.context, foreachComponent.config.data.itemName);
    for (const child of node.ast) {
      foreachItem.children.push(...buildComponent(child, foreachItem));
    }
    foreachComponent.children = [foreachItem];
    component = foreachComponent;
  } else if (node.type === "directive" && node.directive === "children") {
    return componentContext.children ?? [];
  } else {
    if (node.tag[0] === node.tag[0].toLowerCase()) {
      const tag = node.tag as keyof HTMLElementTagNameMap;
      component = TAGS![tag]!(tag);
    } else {
      const Constructor = componentContext.config.imports?.[node.tag];
      if (!Constructor) {
        throw new Error(`import missing: ${node.tag}`);
      }
      component = Constructor();
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
          script = script + `"${name}": ${value.expr}, `;
        }
      }
      if (isBinding) {
        script = `(${args}) => { ${bindings}return { ${script} }; }`;
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
