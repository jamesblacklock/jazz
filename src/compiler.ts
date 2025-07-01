import ENTITIES from "./htmlEntities";
import { AnyComponent, Component, HtmlAnchorConfig, HtmlComponentConfig, HtmlInputConfig, System } from "./index";

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

export function compileTemplate(component: AnyComponent): AnyComponent[] {
  initTags();

  const ast = parse(component.template!);
  const nodes = [];
  for (const astNode of ast) {
    nodes.push(...buildComponent(astNode, component));
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
      area: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "area" })),
      base: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "base" })),
      br: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "br" })),
      col: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "col" })),
      embed: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "embed" })),
      hr: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "hr" })),
      img: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "img" })),
      input: () => System.createHtmlComponent(HtmlInputConfig),
      link: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "link" })),
      meta: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "meta" })),
      source: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "source" })),
      track: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "track" })),
      wbr: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "wbr" })),

      // text elements
      script: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "script" })),
      style: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "style" })),
      textarea: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "textarea" })),
      title: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "title" })),

      // normal elements
      a: () => System.createHtmlComponent(HtmlAnchorConfig),
      abbr: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "abbr" })),
      address: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "address" })),
      article: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "article" })),
      aside: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "aside" })),
      audio: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "audio" })),
      b: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "b" })),
      bdi: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "bdi" })),
      bdo: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "bdo" })),
      blockquote: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "blockquote" })),
      body: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "body" })),
      button: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "button" })),
      canvas: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "canvas" })),
      caption: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "caption" })),
      cite: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "cite" })),
      code: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "code" })),
      colgroup: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "colgroup" })),
      data: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "data" })),
      datalist: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "datalist" })),
      dd: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "dd" })),
      del: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "del" })),
      details: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "details" })),
      dfn: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "dfn" })),
      dialog: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "dialog" })),
      div: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "div" })),
      dl: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "dl" })),
      dt: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "dt" })),
      em: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "em" })),
      fieldset: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "fieldset" })),
      figcaption: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "figcaption" })),
      figure: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "figure" })),
      footer: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "footer" })),
      form: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "form" })),
      h1: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h1" })),
      h2: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h2" })),
      h3: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h3" })),
      h4: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h4" })),
      h5: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h5" })),
      h6: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "h6" })),
      head: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "head" })),
      header: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "header" })),
      hgroup: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "hgroup" })),
      html: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "html" })),
      i: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "i" })),
      iframe: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "iframe" })),
      ins: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "ins" })),
      kbd: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "kbd" })),
      label: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "label" })),
      legend: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "legend" })),
      li: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "li" })),
      main: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "main" })),
      map: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "map" })),
      mark: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "mark" })),
      menu: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "menu" })),
      meter: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "meter" })),
      nav: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "nav" })),
      noscript: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "noscript" })),
      object: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "object" })),
      ol: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "ol" })),
      optgroup: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "optgroup" })),
      option: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "option" })),
      output: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "output" })),
      p: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "p" })),
      picture: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "picture" })),
      pre: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "pre" })),
      progress: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "progress" })),
      q: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "q" })),
      rp: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "rp" })),
      rt: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "rt" })),
      ruby: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "ruby" })),
      s: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "s" })),
      samp: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "samp" })),
      search: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "search" })),
      section: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "section" })),
      select: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "select" })),
      slot: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "slot" })),
      small: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "small" })),
      span: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "span" })),
      strong: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "strong" })),
      sub: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "sub" })),
      summary: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "summary" })),
      sup: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "sup" })),
      table: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "table" })),
      tbody: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "tbody" })),
      td: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "td" })),
      template: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "template" })),
      tfoot: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "tfoot" })),
      th: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "th" })),
      thead: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "thead" })),
      time: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "time" })),
      tr: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "tr" })),
      u: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "u" })),
      ul: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "ul" })),
      var: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "var" })),
      video: () => System.createHtmlComponent(HtmlComponentConfig({ tag: "video" })),
    } as const;
  }
}

function buildComponent(node: AstNode, componentContext: AnyComponent): AnyComponent[] {
  let args = "$props, $state";
  let bindings = "";
  const usedBindings = new Set;
  let propsComponent = componentContext;
  if (componentContext.componentType === "ForeachItem") {
    args += ", $foreach"
    const foreachItem = componentContext as AnyComponent<"ForeachItem">;
    for (const itemName in foreachItem.data.context.bindings) {
      bindings += `let ${itemName} = $foreach.${itemName}.items[$foreach.${itemName}.index]; `;
      usedBindings.add(itemName);
      if (foreachItem.data.context.bindings[itemName].indexName) {
        bindings += `let ${foreachItem.data.context.bindings[itemName].indexName} = $foreach.${itemName}.index; `;
        usedBindings.add(itemName);
      }
    }
    propsComponent = (componentContext as AnyComponent<"ForeachItem">).data.componentContext;
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

  let component: any;
  if (typeof node === "string") {
    component = System.createTextComponent(node);
  } else if (node.type === "script") {
    const script: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { textContent: (${node.expr}).toString() }; }`);
    component = System.createTextComponent("");
    component.bind(componentContext, script);
  } else if (node.type === "directive" && node.directive === "if") {
    const f: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { cond: (${node.expr}) }; }`);
    let ifComponent = System.createIfComponent();
    ifComponent.bind(componentContext, f);
    for (const child of node.ast) {
      ifComponent.children.push(...buildComponent(child, componentContext));
    }
    for (const child of node.elseAst ?? []) {
      const elseChild = buildComponent(child, componentContext);
      ifComponent.children.push(...elseChild);
      elseChild.forEach(e => ifComponent.data.elseChildren.add(e.id));
    }
    component = ifComponent;
  } else if (node.type === "directive" && node.directive === "foreach") {
    const f: (value: any, state: any) => any = eval(`(${args}) => { ${bindings}return { items: (${node.expr}) }; }`);
    const foreachComponent = System.createForeachComponent(node.itemName, node.indexName, componentContext);
    foreachComponent.bind(componentContext, f);
    const foreachItem = System.createForeachItemComponent(componentContext, foreachComponent.data.context, foreachComponent.data.itemName);
    for (const child of node.ast) {
      foreachItem.children.push(...buildComponent(child, foreachItem));
    }
    foreachComponent.children = [foreachItem];
    foreachComponent.data.foreachItemComponent = foreachItem;
    component = foreachComponent;
  } else if (node.type === "directive" && node.directive === "children") {
    return componentContext.children ?? [];
  } else {
    if (node.tag[0] === node.tag[0].toLowerCase()) {
      const tag = node.tag as keyof HTMLElementTagNameMap;
      component = TAGS![tag]!(tag);
    } else {
      const Constructor = componentContext.imports?.[node.tag];
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
