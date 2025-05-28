export type * from "./jazz/htmlTypes";
export type * from "./jazz/uiTypes";
import type {
  EventsMap,
  HtmlAProps,
  HtmlContentComponentProps,
  HtmlInputProps,
  StyleMap,
} from "./jazz/htmlTypes";
import type {
  DebugInfo,
  Props,
  UIElement,
  UINode,
  Component,
  ComponentFunction,
  ComponentType,
  RenderOptions,
  RefObject,
} from "./jazz/uiTypes";

type VNode = {
  r?: Symbol;
  rc: number;
  component: Component;
  nodes: VNode[];
  domNode?: Text|HTMLElement;
  domParent: HTMLElement;
  state?: InternalState;
};

type SetterOptions = { dirty?: boolean, quiet?: boolean };
type Setter<T> = (value: T, options?: SetterOptions) => void

export interface State {
  use<T>(name: string|number, value: T | (() => T)): [T, Setter<T>];
  useRef<T>(name: string|number, value: T): RefObject<T>;
  useMemo<T>(name: string|number, value: (() => T), deps: any[]): T;
  useCallback<T>(name: string|number, callback: (() => T), deps: any[]): T;
  useEffect(name: string|number, effect: (() => (() => void) | void), deps: any[]): void;
}

class InternalState implements State {
  component?: Component;
  target?: HTMLElement;
  dirty: boolean = false;
  private forceRender = false;
  private state: Record<keyof any, any> = {};
  private effectCleanup: Record<keyof any, () => void> = {};
  private deps: Record<keyof any, any[]|null> = {};
  private nextState: Record<keyof any, any> = {};
  private quiet: Set<string|number> = new Set;
  private frame: number = 0;
  private renderOptions: RenderOptions;
  private node?: VNode | null;

  constructor(node: VNode, renderOptions: RenderOptions) {
    this.node = node;
    this.renderOptions = renderOptions ?? {};
  }
  use<T>(name: string|number, value: T | (() => T)): [T, Setter<T>] {
    return this.useInternal(name, value, null, true, false) as [T, Setter<T>];
  }
  useRef<T>(name: string|number, value: T): RefObject<T> {
    return this.useInternal(name, { current: value }, null, false, false)[0];
  }
  useMemo<T>(name: string|number, value: (() => T), deps: any[]): T {
    return this.useInternal(name, value, deps, true, false)[0];
  }
  useCallback<T>(name: string|number, callback: (() => T), deps: any[]): T {
    return this.useInternal(name, callback, deps, false, false)[0];
  }
  useEffect(name: string|number, effect: (() => (() => void) | void), deps: any[]): void {
    this.useInternal(name, effect, deps, true, true);
  }
  cleanup() {
    for (const effect in this.effectCleanup) {
      this.effectCleanup[effect]();
    }
  }
  private useInternal<T>(name: string|number, value: T | (() => T), deps: any[] | null, call: boolean, effect: boolean): [T, Setter<T> | null] {
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
    return [this.state[name], deps ? null : this.set.bind(this, name)];
  }
  private set(name: string|number, value: any, options?: SetterOptions) {
    const nans = Number.isNaN(value) && Number.isNaN(this.state[name]);
    if (!nans && value !== this.state[name] || options?.dirty) {
      this.forceRender = this.forceRender || !!options?.dirty;
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
    this.dirty = this.forceRender || Object.keys(this.nextState).length > this.quiet.size;
  }
  private depsChanged(name: string|number, deps: any[] | null) {
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
      if (this.commit()) {
        let renderState: RenderState = {r: Symbol(), options: this.renderOptions, changedDuringRender: new Set};
        render(renderState, this.node!, this.component!);
        while (renderState.changedDuringRender.size > 0) {
          const reRender = renderState.changedDuringRender;
          renderState = {r: Symbol(), options: this.renderOptions, changedDuringRender: new Set};
          for (const node of reRender) {
            cancelAnimationFrame(node.state!.frame);
            node.state!.commit();
            render(renderState, node, node.component);
            renderState = {r: Symbol(), options: this.renderOptions, changedDuringRender: renderState.changedDuringRender};
          }
        }
        updateHtml(this.node!);
      }
    });
  }
  private commit() {
    let quiet = !this.forceRender;
    for (const key in this.nextState) {
      this.state[key] = this.nextState[key];
      quiet = quiet && this.quiet.has(key);
    }
    this.nextState = {};
    this.quiet = new Set;
    this.forceRender = false;
    return !quiet;
  }
}

let currentComponentState: State | undefined;
let currentComponentStateIndex = 0;

export function useState<T>(value: T | (() => T)): [T, Setter<T>] {
  return currentComponentState!.use(currentComponentStateIndex++, value);
}
export function useRef<T>(value: T): RefObject<T> {
  return currentComponentState!.useRef(currentComponentStateIndex++, value);
}
export function useMemo<T>(value: (() => T), deps: any[]): T {
  return currentComponentState!.useMemo(currentComponentStateIndex++, value, deps);
}
export function useCallback<T>(callback: (() => T), deps: any[]): T {
  return currentComponentState!.useCallback(currentComponentStateIndex++, callback, deps);
}
export function useEffect(effect: (() => (() => void) | void), deps: any[]): void {
  return currentComponentState!.useEffect(currentComponentStateIndex++, effect, deps);
}

function isElement(a: any): a is UIElement {
  return "type" in a && (a.type instanceof Function || typeof a.type === "string")
}

function uiNodeToComponentArray(uiNode: UINode): Component[] {
  if (Array.isArray(uiNode)) {
    const components = [];
    for (const n of uiNode) {
      components.push(...uiNodeToComponentArray(n));
    }
    return components;
  }
  if (uiNode == false || uiNode === null || uiNode === undefined) {
    return [];
  }
  if (typeof uiNode === "string" || typeof uiNode === "number") {
    return [{ type: "TEXT", props: { textContent: uiNode.toString() } }];
  }
  if (isElement(uiNode)) {
    return [{ ...uiNode, content: uiNodeToComponentArray(uiNode.content) }];
  }
  console.warn("invalid UINode", uiNode);
  return [];
}

const DOM_ROOTS = new Map<Node, VNode>;

function propsNotEqual(l: Props | undefined, r: Props | undefined, depth: number = 0) {
  if (l === r) {
    return false;
  }
  const propNames = Array.from(new Set([...Reflect.ownKeys(l ?? {}), ...Reflect.ownKeys(r ?? {})]));
  let i = 0;
  const limit = 30;
  for (const k of propNames) {
    if (i++ >= limit) {
      return true;
    } else if (depth > 0 && l?.[k]?.constructor === Object && l?.[k]?.constructor === Object) {
      if (propsNotEqual(l?.[k], r?.[k], depth-1)) {
        return true;
      }
    } else if (l?.[k] !== r?.[k]) {
      return true;
    }
  }
  return false;
}

function contentNotEqual(l?: Component, r?: Component) {
  let changed = false;
  if (l?.changed) {
    changed = true;
  } else if (l?.type !== r?.type) {
    changed = true;
  } else if (propsNotEqual(l?.props, r?.props, 1)) {
    changed = true;
  } else if (l?.key !== r?.key) {
    changed = true;
  } else {
    const lContent = l?.content && (Array.isArray(l?.content) ? l.content : []);
    const rContent = r?.content && (Array.isArray(r?.content) ? r.content : []);
    if (lContent?.length !== rContent?.length) {
      changed = true;
    } else if (lContent?.length) {
      for (let i=0; i<lContent.length; i++) {
        if (contentNotEqual(lContent[i], rContent![i])) {
          changed = true;
          break;
        }
      }
    }
  }
  if (changed && l) {
    l.changed = true;
  }
  return changed;
}

function nodeChanged(node: VNode, component: Component) {
  return node.rc === 0 || node.state?.dirty || contentNotEqual(node.component, component);
}

function getNode(parentNode: VNode, component: Component, renderedNodes: VNode[]): VNode {
  let node = parentNode.nodes.find(node =>
    node.component.key === component.key && node.component.type === component.type && node.r !== parentNode.r
  );
  if (node) {
    node.r = parentNode.r;
  } else {
    node = {
      r: parentNode.r,
      rc: 0,
      component: { type: component.type, key: component.key },
      nodes: [],
      domParent: (parentNode.domNode ?? parentNode.domParent) as HTMLElement,
    };
  }
  renderedNodes.push(node);
  return node;
}

function* reversed<T>(arr: T[]): Generator<T> {
  for (let i=arr.length-1; i>=0; --i) {
    yield arr[i];
  }
}

function updateHtml(node: VNode, nextSibling?: Node | null): Node | null {
  const contained = node.domParent.contains(node.domNode ?? null);
  const siblingMatches = node.domNode?.nextSibling === nextSibling;
  if (node.domNode && !(contained && siblingMatches)) {
    node.domParent.insertBefore(node.domNode, nextSibling ?? null);
  }
  let lastInserted: Node | null = null;
  for (const childNode of reversed(node.nodes)) {
    lastInserted = updateHtml(childNode, lastInserted) ?? lastInserted;
  }

  return node.domNode ?? lastInserted;
}

function removeNode(node: VNode) {
  node.state?.cleanup();
  if (node.domNode) {
    node.domNode.remove();
    return;
  }
  node.nodes.forEach(removeNode);
}

type RenderState = {
  r: Symbol;
  options: RenderOptions;
  changedDuringRender: Set<VNode>;
}

function render(state: RenderState, node: VNode, component: Component) {
  node.r = state.r;
  const renderedNodes: VNode[] = [];
  if (component.type === "TEXT") {
    const textContent: string = (component.props?.textContent ?? "").toString();
    if (!node.domNode) {
      node.domNode = document.createTextNode(textContent);
    }
    if (textContent !== node.domNode.textContent) {
      node.domNode.textContent = textContent;
    }
  } else {
    if (typeof component.type === "string" && !node.domNode) {
      node.domNode = document.createElement(component.type);
    }
    if (!node.state) {
      node.state = new InternalState(node, state.options);
      node.state!.component = component;
    }
    if (nodeChanged(node, component)) {
      let componentFactory: ComponentFunction = typeof component.type === "string"
        ? (HTML_COMPONENT[component.type] ?? htmlComponent).bind(null, node.domNode as HTMLElement) as ComponentFunction
        : component.type;
      currentComponentState = node.state;
      currentComponentStateIndex = 0;
      node.state!.dirty = false;
      const renderedContent = componentFactory(
        {content: component.content, ...component.props},
        node.state!,
        { debug: state.options?.debug, renderCount: node.rc }
      );
      if (node.state!.dirty) {
        state.changedDuringRender.add(node);
      }
      component.content = uiNodeToComponentArray(renderedContent);
      for (const childComponent of component.content) {
        const childNode = getNode(node, childComponent, renderedNodes);
        if (nodeChanged(childNode, childComponent)) {
          render(state, childNode, childComponent);
        }
      }
    }
  }

  for (const n of node.nodes) {
    if (n.r !== node.r) {
      removeNode(n);
    }
  }

  node.nodes = renderedNodes;
  node.component = component;
  node.component.changed = false;
  node.rc++;
}

class Fragment {}
export const fragment = new Fragment;
export function createElement<P extends {}>(
  type: ComponentType,
  props: P & { key?: any } | null, 
  ...content: UINode[]
): UINode {
  const { key, ...restProps } = props ?? {};
  if (type instanceof Fragment) {
    return content;
  }
  return { type, key, props: restProps, content };
}

export function mountComponent(domTarget: HTMLElement, component: Component, options: RenderOptions = {}) {
  let node = DOM_ROOTS.get(domTarget);
  if (!node) {
    node = { rc: 0, component: { type: component.type, key: component.key }, nodes: [], domParent: domTarget };
    DOM_ROOTS.set(domTarget, node);
  }
  node.component = { type: component.type, key: component.key };
  render({r: Symbol(), options, changedDuringRender: new Set}, node, component);
  updateHtml(node);
}

export default {
  fragment,
  createElement,
  mountComponent,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
};

type HtmlComponentFunction = {
  (e: HTMLElement, props: HtmlContentComponentProps<any>, state: State, debugInfo: DebugInfo): UINode;
};

const htmlComponent: HtmlComponentFunction = function htmlComponent(e, props, state, debugInfo) {
  const { events = {}, style, id, ref, className } = props;
  const [attachedEvents] = state.use<EventsMap<any>>("events", {});
  const [savedStyle, setSavedStyle] = state.use<StyleMap | undefined>("style", undefined);
  if (id) {
    e.id = id;
  } else {
    e.removeAttribute("id");
  }
  if (props.class ?? className) {
    e.className = props.class ?? className ?? "";
  } else {
    e.removeAttribute("class");
  }
  const eventNames = Array.from(new Set([...Object.keys(events), ...Object.keys(attachedEvents)])) as (keyof EventsMap<any>)[];
  for (const event of eventNames) {
    if(events[event] !== attachedEvents[event]) {
      if (attachedEvents[event]) {
        e.removeEventListener(event, attachedEvents[event] as any as EventListener);
        delete attachedEvents[event];
      }
      if(events[event]) {
        e.addEventListener(event, events[event] as any as EventListener);
        attachedEvents[event] = events[event] as any;
      }
    }
  }
  if (propsNotEqual(style, savedStyle)) {
    setSavedStyle(style, { quiet: true });
    e.removeAttribute("style");
    for (const prop in style) {
      if (style[prop as any]) {
        e.style[prop as any] = style[prop as any]!.toString();
      }
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

  return props.content;
}

const HTML_COMPONENT: { [K in keyof HTMLElementTagNameMap]?: HtmlComponentFunction } = {
  a(e, props, state, debugInfo) {
    const { href, target } = props as HtmlAProps;
    const a = e as HTMLAnchorElement;
    if (href !== undefined) {
      a.href = href;
    } else {
      a.removeAttribute("href");
    }
    if (target !== undefined) {
      a.target = target;
    } else {
      a.removeAttribute("target");
    }
    return htmlComponent(e, props, state, debugInfo);
  },
  input(e, props, state, debugInfo) {
    const { value } = props as HtmlInputProps;
    const input = e as HTMLInputElement;
    if (value !== undefined) {
      input.value = value;
    }
    return htmlComponent(e, props, state, debugInfo);
  },
};
