export type * from "./htmlTypes";
import { compileTemplate } from "./compiler";
import type {
  EventsMap,
  HtmlAProps,
  HtmlContentComponentProps,
  HtmlInputProps,
  StyleMap,
} from "./htmlTypes";

export type RenderOptions = {
  debug?: boolean;
};

type AnyRecord = Record<keyof any, any>;

class Binding<P> {
  f: (arg0: any, arg1: any, arg2: any) => P;
  args: [any, any, any];
  constructor(f: Binding<P>["f"], args: Binding<P>["args"]) {
    this.f = f;
    this.args = args;
  }
  call() {
    return this.f.call(null, ...this.args);
  }
  clone() {
    return new Binding(this.f, [...this.args]);
  }
}

class Props<P extends AnyRecord> {
  value: P;
  binding: Binding<P> | null | undefined = null;
  constructor(props: P) {
    this.value = props;
    this.binding = null;
  }
  update(newValue?: P): boolean {
    const props = newValue ?? this.binding?.call();
    if (props == null) {
      return false;
    }
    if (!Props.propsMatch(this.value, props)) {
      Object.assign(this.value, props);
      return true;
    }
    return false;
  }
  static propsMatch(l: AnyRecord | undefined, r: AnyRecord | undefined, depth: number = 0): boolean {
    if (l === r) {
      return true;
    }
    const propNames = Array.from(new Set([...Reflect.ownKeys(l ?? {}), ...Reflect.ownKeys(r ?? {})]));
    const limit = 30;
    if (propNames.length >= limit) {
      return false;
    }
    for (const k of propNames) {
      if (depth > 0 && l?.[k]?.constructor === Object && l?.[k]?.constructor === Object) {
        if (!Props.propsMatch(l?.[k], r?.[k], depth-1)) {
          return false;
        }
      } else if (l?.[k] !== r?.[k]) {
        // THIS IS A HACK!!!!
        if (l?.[k] instanceof Function && r?.[k] instanceof Function && l[k].toString() === r[k].toString()) {
          continue;
        }
        return false;
      }
    }
    return true;
  }
}

interface WeakRef<T> {
  value: T | null;
}

export abstract class Component<P extends AnyRecord = {}, S extends AnyRecord = {}> {
  props: Props<P>;
  internalState: InternalState<S>;
  state: State<S>;
  desc: WeakRef<Component<any, any>>[] = [];
  weakRef: WeakRef<Component<P, S>> | null = null;
  updating: boolean = false;
  display = { _visible: false };
  get visible() { return this.display._visible }
  template?: string;
  imports?: Record<string, ComponentConstructor<AnyRecord>>;
  domParent?: HTMLElement;
  renderOptions: RenderOptions = {};
  domNode?: HTMLElement | Text;
  rc: number = 0;
  nodes: Component[] | null = null;
  children: Component[] = [];

  constructor(props: P, state: S) {
    this.props = new Props(props);
    this.internalState = new InternalState<S>(this, state);
    this.state = this.internalState;
  }
  bind<Q extends AnyRecord, R extends AnyRecord>(other: Component<Q, R>, f: (props: Q, state: State<R>) => P) {
    this.unbind();
    let props, state, isForeachItem;
    if (other instanceof ForeachItem) {
      let c = other.componentContext;
      while (c instanceof ForeachItem) { c = c.componentContext }
      props = c.props;
      state = c.state;
      isForeachItem = true
    } else {
      props = other.props;
      state = other.state;
    }
    this.props.binding = new Binding(f, [props.value, state, null]);
    this.weakRef = { value: this };
    other.desc.push(this.weakRef);
    if (isForeachItem) {
      return;
    }
    if (this.visible) {
      this.update();
    }
  }
  bindForeachContext(foreachItem?: ForeachItem) {
    if (foreachItem && this.props.binding) {
      this.props.binding.args[2] = foreachItem.context.bindings;
      foreachItem.desc.push({ value: this });
    }
  }
  unbind() {
    if (this.weakRef) {
      this.props.binding = null;
      this.weakRef.value = null;
    }
  }
  update(newProps?: P, newState?: S): boolean {
    if (!this.visible) {
      return false;
    }
    const propsChanged = this.props.update(newProps) || this instanceof ForeachItem;
    if (propsChanged || this.internalState.props.update(newState) || this.rc === 0) {
      if (this.updating) {
        return false;
      }
      this.updating = true;
      if (propsChanged) {
        this.onPropsChanged();
      }
      let desc: WeakRef<Component>[] = [];
      for (const c of this.desc) {
        if (!c.value) {
          continue;
        }
        desc.push(c);
        if (c.value.update()) {
          requestRender(c.value);
        }
      }
      this.desc = desc;
      this.updating = false;
      return true;
    }
    return false;
  }
  render(): Component[] { return this.children; }
  onPropsChanged(): void {}
  setVisible(visible: boolean) {
    this.display._visible = visible;
  }
  clone(index?: number, foreachItem?: ForeachItem): Component {
    let clone: Component;
    if (this instanceof HtmlComponent) {
      clone = new HtmlComponent(this.tag);
    } else if (this instanceof TextComponent) {
      clone = new TextComponent(this.props.value.textContent);
    } else if (this instanceof If) {
      clone = new If();
    } else if (this instanceof Foreach) {
      clone = new Foreach(this.itemName, this.indexName, this.componentContext);
    } else if (this instanceof ForeachItem) {
      let context = this.context;
      if (foreachItem) {
        context = cloneForeachContext(foreachItem?.context);
        context.bindings[this.itemName] = { ...this.context.bindings[this.itemName] };
        index = undefined;
      }
      const foreachClone = new ForeachItem(this.componentContext, context, this.itemName, index);
      foreachItem = foreachClone;
      clone = foreachClone;
    } else {
      clone = new Clone();
    }
    clone.props.binding = this.props.binding?.clone();
    clone.domParent = this.domParent;
    clone.renderOptions = this.renderOptions;
    clone.display = this.display;
    for (const child of this.children) {
      const childClone = child.clone(index, foreachItem);
      if (this instanceof If && this.elseChildren.has(child)) {
        (clone as If).elseChildren.add(childClone);
      }
      clone.children.push(childClone);
    }
    clone.bindForeachContext(foreachItem);
    return clone;
  }
}

class Clone extends Component<any, any> {
  constructor() {
    super({}, {});
  }
}

export type ComponentConstructor<P extends AnyRecord> = { new(): Component<P> }

// type SetterOptions = { dirty?: boolean, quiet?: boolean };
// type Setter<T> = (value: T, options?: SetterOptions) => void

export interface State<T extends AnyRecord> {
  set: Setter<T>;
  readonly value: T;
}

let renderQueueTimer: number | null = null;
let renderQueue: Component[] = [];

function requestRender(n: Component) {
  renderQueue.push(n);
  if (renderQueueTimer === null) {
    renderQueueTimer = requestAnimationFrame(() => {
      const rendered = new Set;
      for (const node of renderQueue) {
        if (rendered.has(node)) {
          continue;
        }
        rendered.add(node);
        render(node);
        // while (renderState.changedDuringRender.size > 0) {
        //   const reRender = renderState.changedDuringRender;
        //   renderState = {r: Symbol(), options, changedDuringRender: new Set};
        //   for (const node of reRender) {
        //     node.state!.commit();
        //     render(renderState, node, node.component);
        //     renderState = {r: Symbol(), options, changedDuringRender: renderState.changedDuringRender};
        //   }
        // }
        updateHtml(node);
      }
      renderQueueTimer = null;
      renderQueue = [];
    });
  }
}

type Setter<T extends AnyRecord> = {
  [K in keyof T]: (newValue: T[K]) => void;
};

class InternalState<T extends AnyRecord> implements State<T> {
  props: Props<T>;
  nextValue: T | null;
  value: T;
  component: Component<any, T>;
  // target?: HTMLElement;
  // dirty: boolean = false;
  // forceRender = false;
  // private state: Record<keyof any, any> = {};
  // private effectCleanup: Record<keyof any, () => void> = {};
  // private deps: Record<keyof any, any[]|null> = {};
  // private nextState: Record<keyof any, any> = {};
  // private quiet: Set<string|number> = new Set;
  // private renderOptions: RenderOptions;
  // private node?: VNode | null;
  set: Setter<T>;

  constructor(component: Component<any, T>, value: T/*node: VNode, renderOptions: RenderOptions*/) {
    // this.node = node;
    // this.renderOptions = renderOptions ?? {};
    this.props = new Props(value);
    this.value = this.props.value;
    this.nextValue = null;
    this.component = component;
    this.set = {} as Setter<T>;
    for (const name in value) {
      const q = this.internalSetField.bind(this, name);
      this.set[name as keyof T] = this.internalSetField.bind(this, name);
    }
  }
  setAll(newValue: T) {
    // this.nextValue = newValue;
    this.component.update(undefined, newValue);
  }
  internalSetField<K extends keyof T>(field: K, newValue: T[K]) {
    this.component.update(undefined, { ...this.value, [field]: newValue });
  }
  // use<T>(name: string|number, value: T | (() => T)): [T, Setter<T>] {
  //   return this.useInternal(name, value, null, true, false) as [T, Setter<T>];
  // }
  // useRef<T>(name: string|number, value?: T): RefObject<T> {
  //   return this.useInternal(name, { current: value }, null, false, false)[0];
  // }
  // useCallback<T>(name: string|number, callback: (() => T), deps: any[]): T {
  //   return this.useInternal(name, callback, deps, false, false)[0];
  // }
  // useEffect(name: string|number, effect: (() => (() => void) | void), deps: any[]): void {
  //   this.useInternal(name, effect, deps, true, true);
  // }
  // cleanup() {
  //   for (const effect in this.effectCleanup) {
  //     this.effectCleanup[effect]();
  //   }
  // }
  // private useInternal<T>(name: string|number, value: T | (() => T), deps: any[] | null, call: boolean, effect: boolean): [T, Setter<T> | null] {
  //   const depsChanged = this.depsChanged(name, deps);
  //   if (!(name in this.state) || depsChanged) {
  //     if (effect) {
  //       this.effectCleanup[name]?.();
  //     }
  //     if (call && value instanceof Function) {
  //       value = value();
  //     }
  //     if (effect && value instanceof Function) {
  //       this.effectCleanup[name] = value;
  //     }
  //     this.state[name] = value;
  //     this.deps[name] = deps;
  //   }
  //   if (depsChanged) {
  //     this.set(name, value, { dirty: true });
  //   }
  //   return [this.state[name], deps ? null : this.set.bind(this, name)];
  // }
  // private set(name: string|number, value: any, options?: SetterOptions) {
  //   const nans = Number.isNaN(value) && Number.isNaN(this.state[name]);
  //   if (!nans && value !== this.state[name] || options?.dirty) {
  //     this.forceRender = this.forceRender || !!options?.dirty;
  //     if (options?.quiet) {
  //       this.quiet.add(name);
  //     } else {
  //       this.quiet.delete(name);
  //     }
  //     this.nextState[name] = value;
  //     requestRender(this.node!, this.renderOptions);
  //   } else {
  //     delete this.nextState[name];
  //   }
  //   this.dirty = this.forceRender || Object.keys(this.nextState).length > this.quiet.size;
  // }
  // private depsChanged(name: string|number, deps: any[] | null) {
  //   if (deps?.length !== this.deps[name]?.length) {
  //     return true;
  //   }
  //   for (let i=0; i<(deps?.length ?? 0); i++) {
  //     if (deps?.[i] !== this.deps[name]?.[i]) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }
  // commit() {
  //   let quiet = !this.forceRender;
  //   for (const key in this.nextState) {
  //     this.state[key] = this.nextState[key];
  //     quiet = quiet && this.quiet.has(key);
  //   }
  //   this.nextState = {};
  //   this.quiet = new Set;
  //   this.forceRender = false;
  //   return !quiet;
  // }
}

function* reversed<T>(arr: T[]): Generator<T> {
  for (let i=arr.length-1; i>=0; --i) {
    yield arr[i];
  }
}

function updateHtml(
  component: Component,
  nextSibling: Node | null = null,
  checkSiblings: boolean = false,
): Node | null {
  if (!component.visible) {
    removeNode(component);
    return nextSibling;
  }
  if (component.domNode) {
    const contained = component.domParent!.contains(component.domNode);
    const siblingOk = !checkSiblings || component.domNode.nextSibling === nextSibling;
    if (!contained || !siblingOk) {
      component.domParent!.insertBefore(component.domNode, checkSiblings ? nextSibling : null);
    }
  }
  let childCheckSiblings = !!(component.domNode || checkSiblings);
  let lastInserted: Node | null = component.domNode ? null : nextSibling;
  for (const childNode of reversed(component.nodes ?? [])) {
    const isPortalChild = false; // childNode.domParent !== (node.domNode ?? node.domParent);
    const res = updateHtml(childNode, lastInserted, childCheckSiblings && !isPortalChild);
    if (!isPortalChild) {
      lastInserted = res ?? lastInserted;
      childCheckSiblings = true;
    }
  }

  return component.domNode ?? lastInserted;
}

function removeNode(component: Component) {
  // node.state?.cleanup();
  // node.portalChildren.forEach(removeNode);
  if (component.domNode) {
    component.domNode.remove();
    return;
  }
  component.nodes?.forEach(removeNode);
}

function render(component: Component) {
  if (!component.visible) {
    return;
  }

  if (component instanceof TextComponent) {
    const textContent: string = component.props.value.textContent.toString();
    if (!component.domNode) {
      component.domNode = document.createTextNode(textContent);
    }
    if (textContent !== component.domNode.textContent) {
      component.domNode.textContent = textContent;
    }
  } else {
    if (component instanceof HtmlComponent) {
      if (!component.domNode) {
        component.domNode = document.createElement(component.tag);
      }
      component.updateHtml();
    }
    if (!component.nodes || component instanceof If) {
      let rendered: Component[];
      if (component.template) {
        rendered = compileTemplate(component);
      } else {
        rendered = component.render();
      }
      component.nodes = rendered;
      const isForeach = component instanceof Foreach;
      for (const child of component.nodes) {
        child.domParent = component.domNode as HTMLElement ?? component.domParent;
        child.renderOptions = component.renderOptions;
        if (!(component instanceof If)) {
          child.display = component.display;
        }
        if (isForeach) {
          continue;
        }
        child.update();
        render(child);
      }
      component.update();
    }

    if (component instanceof Foreach) {
      const nodes = component.nodes ?? [];
      while (nodes.length > component.items.length) {
        const node = nodes.pop()!;
        removeNode(node);
      }
      const child = component.children[0] as ForeachItem;
      for (let i = 0; i < component.items.length; i++) {
        let clone;
        if (i < nodes.length) {
          clone = nodes[i];
          // clone.bindForeachContext(component);
        } else {
          clone = child.clone(i);
        }
        if (i >= nodes.length) {
          nodes.push(clone);
        }
      }
      component.nodes = nodes;

      for (const node of component.nodes) {
        render(node);
        node.update();
      }
    }
  // const renderedNodes: VNode[] = [];
  // const portalChildren: VNode[] = [];
  // for (const childComponent of component.content) {
  //   const childNode = getNode(node, childComponent, renderedNodes);
  //   if (childComponent.domParent) {
  //     portalChildren.push(childNode);
  //   }
  //   if (nodeChanged(childNode, childComponent)) {
  //     render(state, childNode, childComponent);
  //   }
  //   portalChildren.push(...childNode.portalChildren);
  // }
  // for (const n of node.nodes) {
  //   if (n.r !== node.r) {
  //     removeNode(n);
  //   }
  // }
  // node.nodes = renderedNodes;
  // node.portalChildren = portalChildren;
  }

  component.rc++;
}

// export function createPortal(node: UINode, domParent: HTMLElement, key?: any): UINode {
//   return { type: () => node, key, domParent, content: null, props: null };
// }


type HtmlComponentFunction = {
  (component: HtmlComponent): void;
};

const htmlComponent: HtmlComponentFunction = function htmlComponent(component) {
  const props = component.props.value;
  const e = component.domNode! as HTMLElement;
  const { events = {}, style, id, /*ref,*/ className } = props;
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
  const eventNames = Array.from(new Set([...Object.keys(events), ...Object.keys(component.attachedEvents)])) as (keyof EventsMap<any>)[];
  for (const event of eventNames) {
    // THIS IS A HACK!!!!
    if(events[event]?.toString() !== component.attachedEvents[event]?.toString()) {
      if (component.attachedEvents[event]) {
        e.removeEventListener(event, component.attachedEvents[event] as any as EventListener);
        delete component.attachedEvents[event];
      }
      if(events[event]) {
        e.addEventListener(event, events[event] as any as EventListener);
        component.attachedEvents[event] = events[event] as any;
      }
    }
  }
  if (!Props.propsMatch(style, component.savedStyle)) {
    component.savedStyle = style;
    e.removeAttribute("style");
    for (const prop in style) {
      if (style[prop as any]) {
        e.style[prop as any] = style[prop as any]!.toString();
      }
    }
  }
  // if (ref) {
  //   if (ref instanceof Function) {
  //     ref(e);
  //   } else {
  //     ref.current = e;
  //   }
  // }

  if (component.renderOptions.debug) {
    e.setAttribute("data-render-count", (component.rc + 1).toString());
  }

  return props.content;
}

const HTML_COMPONENT: { [K in keyof HTMLElementTagNameMap]?: HtmlComponentFunction } = {
  a(component: HtmlComponent) {
  const props = component.props.value;
  const e = component.domNode! as HTMLElement;
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
    htmlComponent(component);
  },
  input(component: HtmlComponent) {
  const props = component.props.value;
  const e = component.domNode! as HTMLElement;
    const { value } = props as HtmlInputProps;
    const input = e as HTMLInputElement;
    if (value !== undefined) {
      input.value = value;
    }
    htmlComponent(component);
  },
};

export class HtmlComponent extends Component<HtmlContentComponentProps<any>> {
  readonly tag: keyof HTMLElementTagNameMap;
  attachedEvents: EventsMap<any> = {};
  savedStyle: StyleMap | undefined = undefined;

  constructor(tag: keyof HTMLElementTagNameMap) {
    super({}, {});
    this.tag = tag;
  }
  updateHtml() {
    (HTML_COMPONENT[this.tag] ?? htmlComponent)(this);
  }
}
export class TextComponent extends Component<{ textContent: string | number }> {
  constructor(textContent: string | number = "") {
    super({ textContent }, {});
  }
  render() { return [] }
}

export class If extends Component<{ cond: boolean }> {
  constructor() {
    super({ cond: false }, {});
  }
  elseChildren = new Set<Component>;
  setVisible(visible: boolean) {
    super.setVisible(visible);
    this.visibilityChanged();
  }
  visibilityChanged() {
    for (const child of this.children) {
      child.setVisible(this.visible && this.props.value.cond !== this.elseChildren.has(child));
      if (!child.visible) {
        removeNode(child);
      }
    }
  }
  onPropsChanged() {
    this.visibilityChanged();
  }
  render() {
    this.visibilityChanged();
    return this.children.filter(child => child.visible);
  }
}

type ForeachContext = { init: boolean, bindings: { [key: string]: { items: any[], index: number | null, indexName?: string } } };

function cloneForeachContext(context: ForeachContext, itemName?: string, index?: number) {
  const result: ForeachContext = { init: index != null, bindings: {} };
  for (const name in context.bindings) {
    result.bindings[name] = { ...context.bindings[name] };
  }
  if (itemName !== undefined && index !== undefined) {
    result.bindings[itemName].index = index;
  }
  return result;
}

export class Foreach<T> extends Component<{ items: Iterable<T> }> {
  itemName: string;
  indexName?: string;
  items: T[] = [];
  context: ForeachContext;
  componentContext: Component;

  constructor(itemName: string, indexName: string | undefined, componentContext: Component) {
    super({ items: [] }, {});
    this.itemName = itemName;
    this.indexName = indexName;
    this.context = { init: false, bindings: {} };
    if (componentContext instanceof ForeachItem) {
      this.context.bindings = { ...componentContext.context.bindings };
    }
    this.context.bindings[this.itemName] = { items: this.items, index: null, indexName }
    if (indexName) {
      delete this.context.bindings[indexName];
    }
    this.componentContext = componentContext;
  }
  onPropsChanged() {
    this.items.splice(0, this.items.length);
    this.items.push(...(this.props.value.items ?? []));
  }
  render() {
    const child = this.children[0] as ForeachItem;
    child.context.bindings[this.itemName].items = this.items;
    child.display = this.display;
    child.domParent = this.domParent;
    child.renderOptions = this.renderOptions;
    return [];
  }
}

export class ForeachItem extends Component {
  context: ForeachContext;
  componentContext: Component;
  itemName: string;
  constructor(componentContext: Component, foreachContext: ForeachContext, itemName: string, index?: number) {
    super({}, {});
    this.componentContext = componentContext;
    this.itemName = itemName;
    this.context = cloneForeachContext(foreachContext, itemName, index);
  }
}

const DOM_ROOTS = new Map<Node, Component>;

export function mountComponent(domTarget: HTMLElement, node: Component<any, any>, options: RenderOptions = {}) {
  DOM_ROOTS.set(domTarget, node);
  node.domParent = domTarget;
  node.renderOptions = options;
  node.setVisible(true);
  requestRender(node);
}

export default {
  mountComponent,
};
