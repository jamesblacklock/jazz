declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: any;
    }
    interface IntrinsicElements {
      [key: string]: IntrinsicAttributes & HtmlTagComponentProps<any>;
    }
  }
}

type SetterOptions = { dirty?: boolean, quiet?: boolean };
type Setter<T> = (value: T, options?: SetterOptions) => void

export class State {
  target: HTMLElement;
  component: UITagNode;
  dirty: boolean = false;
  private state: Record<keyof any, any> = {};
  private effectCleanup: Record<keyof any, () => void> = {};
  private deps: Record<keyof any, any[]|undefined> = {};
  private nextState: Record<keyof any, any> = {};
  private quiet: Set<string> = new Set;
  private frame: number = 0;
  private renderOptions: RenderOptions;
  private parentNode?: VNode | null;

  constructor(target: HTMLElement, component: UITagNode, parentNode: VNode | null | undefined, renderOptions: RenderOptions) {
    this.target = target;
    this.component = component;
    this.parentNode = parentNode;
    this.renderOptions = renderOptions;
  }
  use<T>(name: string, value: T | (() => T), deps?: any[]): [T, Setter<T>] {
    return this.useInternal(name, value, deps, true, false);
  }
  useCallback<T>(name: string, callback: (() => T), deps: any[]): T {
    return this.useInternal(name, callback, deps, false, false)[0];
  }
  useEffect(name: string, effect: (() => (() => void) | void), deps: any[]): void {
    this.useInternal(name, effect, deps, true, true);
  }
  cleanup() {
    for (const effect in this.effectCleanup) {
      this.effectCleanup[effect]();
    }
  }
  private useInternal<T>(name: string, value: T | (() => T), deps: any[] | undefined, call: boolean, effect: boolean): [T, Setter<T>] {
    const depsChanged = this.depsChanged(name, deps);
    if (!(name in this.state) || depsChanged) {
      if (effect) {
        this.effectCleanup[name]?.();
      }
      if (call && value instanceof Function) {
        value = value();
      }
      if (effect && value instanceof Function) {
        this.effectCleanup[name] = value;
      }
      this.state[name] = value;
      this.deps[name] = deps;
    }
    if (depsChanged) {
      this.set(name, value, { dirty: true });
    }
    return [this.state[name], this.set.bind(this, name)];
  }
  private set(name: string, value: any, options?: SetterOptions) {
    const nans = Number.isNaN(value) && Number.isNaN(this.state[name]);
    if (!nans && value !== this.state[name] || options?.dirty) {
      if (options?.quiet) {
        this.quiet.add(name);
      } else {
        this.quiet.delete(name);
      }
      this.nextState[name] = value;
      this.render();
    } else {
      delete this.nextState[name];
    }
  }
  private depsChanged(name: string, deps?: any[]) {
    if (deps?.length !== this.deps[name]?.length) {
      return true;
    }
    for (let i=0; i<(deps?.length ?? 0); i++) {
      if (deps?.[i] !== this.deps[name]?.[i]) {
        return true;
      }
    }
    return false;
  }
  private render() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      let quiet = true;
      for (const key in this.nextState) {
        this.state[key] = this.nextState[key];
        quiet = quiet && this.quiet.has(key);
      }
      this.nextState = {};
      this.quiet = new Set;
      if (!quiet) {
        this.dirty = true;
        renderInternal(this.renderOptions, this.target, this.component, null, this.parentNode);
      }
    });
  }
}

type VNode = {
  rc: number;
  cc: number;
  key?: any;
  tag?: string | UINodeFunction;
  nodes?: VNode[];
  props?: Props;
  state?: State;
  html?: HTMLElement | Text;
  elements?: HTMLElement[];
  content?: UINode;
};
export type DebugInfo = { renderCount: number, debug?: boolean };
export type Props = Record<keyof any, any>;
export type UINodeFunction = <T extends Props>(props: T, state: State, debugInfo: DebugInfo) => UINode;
export type UITagNode<T extends Props = Props> = {
  tag: string | UINodeFunction;
  props?: T;
  key?: any;
};
export type SingleUINode = undefined | null | false | number | string | UINodeFunction | UITagNode;

export type UINode = SingleUINode | SingleUINode[];

function findNode(parentVNode: VNode, content: UITagNode, nodesOut: VNode[]): VNode | undefined {
  const match = parentVNode.nodes!.find(node =>
    node.key === content.key && node.tag === content.tag && node.rc < parentVNode.rc
  );
  if (match) {
    match.rc++;
    nodesOut.push(match);
  }
  return match;
}

function contentNotEqual(l: any, r: any) {
  if (!(Array.isArray(l) && Array.isArray(r))) {
    if (typeof l === "object" && typeof r === "object") {
      return propsNotEqual(l?.props, r?.props);
    }
    return l !== r;
  }
  if (l.length !== r.length) {
    return true;
  }
  for (let i=0; i<l.length; i++) {
    if (contentNotEqual(l[i], r[i])) {
      return true;
    }
  }
  return false;
}
function recordNotEqual(l: Record<keyof any, any>, r: Record<keyof any, any>) {
  const keys = Array.from(new Set([...Object.keys(l ?? {}), ...Object.keys(r ?? {})]));
  if (keys.length < 1 || keys.length > 100) {
    return l !== r;
  }
  for (const k of keys) {
    if (l?.[k] !== r?.[k]) {
      return true;
    }
  }
  return false;
}
function propsNotEqual(l: Props | undefined, r: Props | undefined) {
  const propNames = Array.from(new Set([...Object.keys(l ?? {}), ...Object.keys(r ?? {})]));
  for (const k of propNames) {
    if (k === "content") {
      if (contentNotEqual(l?.content, r?.content)) {
        return true;
      }
    } else if (k === "style") {
      if (recordNotEqual(l?.style, r?.style)) {
        return true;
      }
    } else if (l?.[k] !== r?.[k]) {
      return true;
    }
  }
  return false;
}

function htmlNodeChanged(node: VNode, props?: Props) {
  if (propsNotEqual(node.props, props)) {
    node.cc++;
    return true;
  }
  return false;
}

function removeNode(node: VNode) {
  if (node.html) {
    node.html.remove();
    VNODES.delete(node.html);
  } else {
    node.state!.cleanup();
    node.elements!.forEach(e => e.remove());
    VNODES.delete(node);
  }
}

const VNODES = new Map<VNode | Node, VNode>;
// (window as any).VNODES = VNODES;
function renderInternal(
  options: RenderOptions,
  target: HTMLElement,
  content: UINode,
  nodes?: VNode[] | null,
  nodeKey?: VNode | null,
  elements?: HTMLElement[] | null,
  key?: any,
) {
  let nodeKey2 = nodeKey ?? target;
  let parentVNode = VNODES.get(nodeKey2);
  if (!parentVNode) {
    parentVNode = { nodes: [], rc: 0, cc: 0, key };
    VNODES.set(nodeKey2, parentVNode);
  }
  if (!nodes) {
    parentVNode.rc++;
    nodes = [];
  }
  if (content instanceof Function) {
    content = [{ tag: content }];
  } else if (!Array.isArray(content)) {
    content = [content];
  }
  for (let child of content as UINode[]) {
    if (child == null || child === false) {
      continue;
    }
    if (Array.isArray(child)) {
      renderInternal(options, target, child, nodes, nodeKey, elements);
      continue;
    }
    if (child instanceof Function) {
      child = { tag: child };
    }
    let node = findNode(parentVNode, child as UITagNode, nodes);
    if (typeof child === "string" || typeof child === "number") {
      if (node) {
        if (node.content !== child) {
          node.html!.textContent = node.content = child.toString();
        }
      } else {
        node = { html: document.createTextNode(child.toString()), content: child, rc: parentVNode.rc, cc: 0 };
        nodes.push(node);
      }
      target.appendChild(node.html!);
      continue;
    }
    const { tag, key, props } = child;
    if (tag instanceof Function) {
      if (node) {
        node.state!.target = target;
        node.state!.component = child;
      } else {
        node = { tag, key, state: new State(target, child, nodeKey, options), rc: parentVNode.rc, cc: 0 };
        nodes.push(node);
      }
      node.content = (tag as UINodeFunction)(props ?? {}, node.state!, { debug: options.debug, renderCount: node.rc });
      node.elements = [];
      renderInternal(options, target, node.content, null, node, node.elements, key);
      if (elements) {
        elements.push(...node.elements);
      }
      continue;
    }
    if (node) {
      node.state!.component = child;
    } else {
      const element = document.createElement(tag);
      node = { tag, key, state: new State(element, child, null, options), rc: parentVNode.rc, cc: 0, html: element };
      nodes.push(node);
      node.html!.remove();
    }
    if (elements) {
      elements.push(node.html as HTMLElement);
    }
    if (node.state!.dirty || htmlNodeChanged(node, props)) {
      node.state!.dirty = false;
      node.props = props;
      HtmlTagComponent(props ?? {}, node.state!, node.html as HTMLElement, { debug: options.debug, renderCount: node.rc });
      renderInternal(options, node.html as HTMLElement, props?.content, null, null, elements, key);
    }
  }
  parentVNode.nodes!.forEach(n => n.rc < parentVNode.rc && removeNode(n));
  for(const n of nodes) {
    if (n.html) {
      target.appendChild(n.html!);
    }
  }
  parentVNode.nodes = nodes;
}

export type RenderOptions = {
  debug?: boolean;
};

export default function renderUI(target: HTMLElement, content: any, options?: RenderOptions) {
  renderInternal(options || {}, target, content);
}

renderUI.fragment = () => null;
renderUI.createElement = function<P extends {}>(
  tag: string | UINodeFunction,
  props: P & { content?: UINode, key?: any } | null, 
  ...children: any[]
): UINode {
  if (tag === renderUI.fragment) {
    return children;
  }
  const { key, content, ...restProps } = props ?? {};
  return {
    tag,
    key,
    props: { ...restProps, content: [content, ...children] },
  };
}

export type RefObject<T = any> = { current?: T };
export type RefFunction<T = any> = ((current: T) => void)
export type Ref<T = any> = RefObject<T> | RefFunction<T>;
type EventsMap = Partial<Record<keyof HTMLElementEventMap, EventListenerOrEventListenerObject>>;
type StyleMap = Partial<Record<keyof CSSStyleDeclaration, string | number>>;
type HtmlTagComponentProps<T extends keyof HTMLElementTagNameMap> = {
  class?: string;
  className?: string;
  events?: EventsMap;
  style?: StyleMap;
  id?: string;
  ref?: Ref<HTMLElementTagNameMap[T]>;
};
function HtmlTagComponent<T extends keyof HTMLElementTagNameMap>(
  props: HtmlTagComponentProps<T>,
  state: State,
  e: HTMLElementTagNameMap[T],
  debugInfo: DebugInfo,
) {
  const { events = {}, style, id, ref, className } = props;
  const [attachedEvents] = state.use<EventsMap>("events", {});
  if (id) {
    e.id = id
  } else {
    e.removeAttribute("id")
  }
  if (props.class ?? className) {
    e.className = props.class ?? className ?? "";
  } else {
    e.removeAttribute("class");
  }
  const eventNames = Array.from(new Set([...Object.keys(events), ...Object.keys(attachedEvents)])) as (keyof EventsMap)[];
  for (const event of eventNames) {
    if(events[event] !== attachedEvents[event]) {
      if (attachedEvents[event]) {
        e.removeEventListener(event, attachedEvents[event]);
        delete attachedEvents[event]
      }
      if(events[event]) {
        e.addEventListener(event, events[event]);
        attachedEvents[event] = events[event];
      }
    }
  }
  e.removeAttribute("style");
  for (const prop in style) {
    if (style[prop as any]) {
      e.style[prop as any] = style[prop as any]!.toString();
    }
  }
  if (ref) {
    if (ref instanceof Function) {
      ref(e);
    } else {
      ref.current = e;
    }
  }
  
  if (debugInfo.debug) {
    e.setAttribute("data-render-count", debugInfo.renderCount.toString());
  }

  return e;
}
