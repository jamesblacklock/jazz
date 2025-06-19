export type * from "./htmlTypes";
// export type * from "./types";
import type {
  EventsMap,
  HtmlAProps,
  HtmlContentComponentProps,
  HtmlInputProps,
  StyleMap,
} from "./htmlTypes";
// import {
//   // DebugInfo,
//   // Fragment,
//   Props,
//   // UIElement,
//   // UINode,
//   Component,
//   // ComponentFunction,
//   ComponentType,
//   // RenderOptions,
//   // RefObject,
// } from "./types";

type AnyRecord = Record<keyof any, any>;

class Props<P extends AnyRecord> {
  value: P;
  binding: (() => P) | null = null;
  constructor(props: P) {
    this.value = props;
    this.binding = null;
  }
  update(newValue?: P): boolean {
    const props = newValue ?? this.binding?.();
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
  state: InternalState<S>;
  desc: WeakRef<Component>[] = [];
  weakRef: WeakRef<Component<P>> | null = null;
  constructor(props: P, state: S) {
    this.props = new Props(props);
    this.state = new InternalState(this, state);
  }
  bind<Q extends AnyRecord, R extends AnyRecord>(other: Component<Q, R>, f: (props: Q, state: State<R>) => P) {
    this.unbind();
    this.props.binding = f.bind(null, other.props.value, other.state);
    this.weakRef = { value: this };
    other.desc.push(this.weakRef);
    this.update();
  }
  unbind() {
    if (this.weakRef) {
      this.props.binding = null;
      this.weakRef.value = null;
    }
  }
  update(newProps?: P, newState?: S): boolean {
    if (this.props.update(newProps) || this.state.props.update(newState) || this.rc === 0) {
      const desc: WeakRef<Component>[] = [];
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
      return true;
    }
    return false;
  }
  abstract render(children: Component[]): Component | Component[];




  domParent?: HTMLElement;
  domNode?: HTMLElement | Text;
  rc: number = 0;
  remove?: boolean;
  nodes: Component[] | null = null;
  children: Component[] = [];
}

let globalComponentContext: Component<any, any> | null = null;

// export type Props = Record<keyof any, any> | undefined | null;
export type TextNodeProps = { textContent: string };
export type ComponentConstructor<P extends AnyRecord> = { new(): Component<P> }

type ComponentStringType = keyof HTMLElementTagNameMap | "TEXT" | "FRAGMENT";
export type ComponentType<P extends AnyRecord = AnyRecord> = ComponentConstructor<P> | ComponentStringType;
// export type UIElement<P extends Props = Props, T extends ComponentType = ComponentType> = {
//   type: T;
//   binding?: () => P;
//   // props: P;
//   content: UINode;
//   // domParent?: HTMLElement;
// };
// export type UITextNode = UITextNode[] | UIElement<TextNodeProps, "TEXT"> | (() => string);
// export type UINode = UINode[] | UIElement | UITextNode;
export type UINode<P extends AnyRecord = AnyRecord, T extends ComponentType = ComponentType> = {
  type: T;
  binding: any;
  // changed?: boolean;
  // key?: any;
};
// export type TextNode = 
// export type VNode<P extends AnyRecord = AnyRecord> = {
//   children: VNode[];
//   component: Component<P>;
// }

// type VNode = {
//   r?: Symbol;
//   rc: number;
//   component: Component;
//   nodes: VNode[];
//   portalChildren: VNode[];
//   domNode?: Text|HTMLElement;
//   domParent: HTMLElement;
//   state?: InternalState;
// };

// type SetterOptions = { dirty?: boolean, quiet?: boolean };
// type Setter<T> = (value: T, options?: SetterOptions) => void

export interface State<T extends AnyRecord> {
//   use<T>(name: string|number, value: T | (() => T)): [T, Setter<T>];
//   useRef<T>(name: string|number, value?: T): RefObject<T>;
//   useMemo<T>(name: string|number, value: (() => T), deps: any[]): T;
//   useCallback<T>(name: string|number, callback: (() => T), deps: any[]): T;
//   useEffect(name: string|number, effect: (() => (() => void) | void), deps: any[]): void;
  set(newValue: T): void;
  readonly value: T;
}

let renderQueueTimer: number | null = null;
let renderQueue: Component[] = [];

function requestRender(n: Component/*, options: RenderOptions*/) {
  renderQueue.push(n);
  if (renderQueueTimer === null) {
    renderQueueTimer = requestAnimationFrame(() => {
      const rendered = new Set;
      for (const node of renderQueue) {
        if (rendered.has(node)) {
          continue;
        }
        rendered.add(node);
        // if (node.state!.commit()) {
          // let renderState: RenderState = {r: Symbol(), options, changedDuringRender: new Set};
          render(/*renderState,*/ node/*, node.component*/);
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
        // }
      }
      renderQueueTimer = null;
      renderQueue = [];
    });
  }
}

class InternalState<T extends AnyRecord> implements State<T> {
  props: Props<T>;
  nextValue: T | null;
  value: T;
  component: Component;
//   target?: HTMLElement;
//   dirty: boolean = false;
//   forceRender = false;
//   private state: Record<keyof any, any> = {};
//   private effectCleanup: Record<keyof any, () => void> = {};
//   private deps: Record<keyof any, any[]|null> = {};
//   private nextState: Record<keyof any, any> = {};
//   private quiet: Set<string|number> = new Set;
//   private renderOptions: RenderOptions;
//   private node?: VNode | null;

  constructor(component: Component, value: T/*node: VNode, renderOptions: RenderOptions*/) {
    // this.node = node;
    // this.renderOptions = renderOptions ?? {};
    this.props = new Props(value);
    this.value = this.props.value;
    this.nextValue = null;
    this.component = component;
  }
  set(newValue: T) {
    // this.nextValue = newValue;
    this.component.update(undefined, newValue);
    // requestRender(this.component);
  }
//   use<T>(name: string|number, value: T | (() => T)): [T, Setter<T>] {
//     return this.useInternal(name, value, null, true, false) as [T, Setter<T>];
//   }
//   useRef<T>(name: string|number, value?: T): RefObject<T> {
//     return this.useInternal(name, { current: value }, null, false, false)[0];
//   }
//   useMemo<T>(name: string|number, value: (() => T), deps: any[]): T {
//     return this.useInternal(name, value, deps, true, false)[0];
//   }
//   useCallback<T>(name: string|number, callback: (() => T), deps: any[]): T {
//     return this.useInternal(name, callback, deps, false, false)[0];
//   }
//   useEffect(name: string|number, effect: (() => (() => void) | void), deps: any[]): void {
//     this.useInternal(name, effect, deps, true, true);
//   }
//   cleanup() {
//     for (const effect in this.effectCleanup) {
//       this.effectCleanup[effect]();
//     }
//   }
//   private useInternal<T>(name: string|number, value: T | (() => T), deps: any[] | null, call: boolean, effect: boolean): [T, Setter<T> | null] {
//     const depsChanged = this.depsChanged(name, deps);
//     if (!(name in this.state) || depsChanged) {
//       if (effect) {
//         this.effectCleanup[name]?.();
//       }
//       if (call && value instanceof Function) {
//         value = value();
//       }
//       if (effect && value instanceof Function) {
//         this.effectCleanup[name] = value;
//       }
//       this.state[name] = value;
//       this.deps[name] = deps;
//     }
//     if (depsChanged) {
//       this.set(name, value, { dirty: true });
//     }
//     return [this.state[name], deps ? null : this.set.bind(this, name)];
//   }
//   private set(name: string|number, value: any, options?: SetterOptions) {
//     const nans = Number.isNaN(value) && Number.isNaN(this.state[name]);
//     if (!nans && value !== this.state[name] || options?.dirty) {
//       this.forceRender = this.forceRender || !!options?.dirty;
//       if (options?.quiet) {
//         this.quiet.add(name);
//       } else {
//         this.quiet.delete(name);
//       }
//       this.nextState[name] = value;
//       requestRender(this.node!, this.renderOptions);
//     } else {
//       delete this.nextState[name];
//     }
//     this.dirty = this.forceRender || Object.keys(this.nextState).length > this.quiet.size;
//   }
//   private depsChanged(name: string|number, deps: any[] | null) {
//     if (deps?.length !== this.deps[name]?.length) {
//       return true;
//     }
//     for (let i=0; i<(deps?.length ?? 0); i++) {
//       if (deps?.[i] !== this.deps[name]?.[i]) {
//         return true;
//       }
//     }
//     return false;
//   }
//   commit() {
//     let quiet = !this.forceRender;
//     for (const key in this.nextState) {
//       this.state[key] = this.nextState[key];
//       quiet = quiet && this.quiet.has(key);
//     }
//     this.nextState = {};
//     this.quiet = new Set;
//     this.forceRender = false;
//     return !quiet;
//   }
}

// let currentComponentState: State | undefined;
// let currentComponentStateIndex = 0;

// export function useState<T>(value: T | (() => T)): [T, Setter<T>] {
//   return currentComponentState!.use(currentComponentStateIndex++, value);
// }
// export function useRef<T>(value?: T): RefObject<T> {
//   return currentComponentState!.useRef(currentComponentStateIndex++, value);
// }
// export function useMemo<T>(value: (() => T), deps: any[]): T {
//   return currentComponentState!.useMemo(currentComponentStateIndex++, value, deps);
// }
// export function useCallback<T>(callback: (() => T), deps: any[]): T {
//   return currentComponentState!.useCallback(currentComponentStateIndex++, callback, deps);
// }
// export function useEffect(effect: (() => (() => void) | void), deps: any[]): void {
//   return currentComponentState!.useEffect(currentComponentStateIndex++, effect, deps);
// }

// function isElement(a: any): a is UIElement {
//   return "type" in a && (a.type instanceof Function || typeof a.type === "string")
// }

// function uiNodeToComponentArray(uiNode: UINode): Component[] {
//   if (Array.isArray(uiNode)) {
//     const components = [];
//     for (const n of uiNode) {
//       components.push(...uiNodeToComponentArray(n));
//     }
//     return components;
//   }
//   if (uiNode === false || uiNode === null || uiNode === undefined) {
//     return [];
//   }
//   if (typeof uiNode === "string" || typeof uiNode === "number") {
//     return [{ type: "TEXT", props: { textContent: uiNode.toString() } }];
//   }
//   if (isElement(uiNode)) {
//     return [{ ...uiNode, content: uiNodeToComponentArray(uiNode.content) }];
//   }
//   console.warn("invalid UINode", uiNode);
//   return [];
// }

// function contentNotEqual(l?: Component, r?: Component) {
//   let changed = false;
//   if (l?.changed) {
//     changed = true;
//   } else if (l?.type !== r?.type) {
//     changed = true;
//   } else if (propsNotEqual(l?.props, r?.props, 1)) {
//     changed = true;
//   } else if (l?.key !== r?.key) {
//     changed = true;
//   } else {
//     const lContent = l?.content && (Array.isArray(l?.content) ? l.content : []);
//     const rContent = r?.content && (Array.isArray(r?.content) ? r.content : []);
//     if (lContent?.length !== rContent?.length) {
//       changed = true;
//     } else if (lContent?.length) {
//       for (let i=0; i<lContent.length; i++) {
//         if (contentNotEqual(lContent[i], rContent![i])) {
//           changed = true;
//           break;
//         }
//       }
//     }
//   }
//   if (changed && l) {
//     l.changed = true;
//   }
//   return changed;
// }

// function nodeChanged(component: Component): boolean {
//   if (component.rc === 0) {
//     return true;
//   }
//   if (!component.props.binding) {
//     return false;
//   }
//   return component.update();
// //   return node.rc === 0 || node.state?.dirty || contentNotEqual(node.component, component);
// }

// function getNode(parentNode: VNode, component: Component, renderedNodes: VNode[]): VNode {
//   let node = parentNode.nodes.find(node =>
//     node.component.key === component.key && node.component.type === component.type && node.r !== parentNode.r
//   );
//   if (node) {
//     node.r = parentNode.r;
//     if (component.domParent) {
//       node.domParent = component.domParent;
//     }
//   } else {
//     node = {
//       r: parentNode.r,
//       rc: 0,
//       component: { type: component.type, key: component.key },
//       nodes: [],
//       portalChildren: [],
//       domParent: (component.domParent ?? parentNode.domNode ?? parentNode.domParent) as HTMLElement,
//     };
//   }
//   renderedNodes.push(node);
//   return node;
// }

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
  if (component.remove) {
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
    const isPortalChild = false; //childNode.domParent !== (node.domNode ?? node.domParent);
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

// type RenderState = {
//   r: Symbol;
//   options: RenderOptions;
//   changedDuringRender: Set<VNode>;
// }

function render(/*state: RenderState, node: VNode,*/ component: Component) {
  if (component.remove) {
    return;
  }
  // const props = component.binding?.();

  // if (!props || !propsNotEqual(component.props, props)) {
  //   return;
  // }

  // if (component.type instanceof Function) {
  //   if (!component.props) {
  //     component.props = component.type.initProps?.() ?? {};
  //     if (props) {
  //       Object.assign(component.props, props);
  //     }
  //   }
    // component.node.domParent = component.domParent; // ?? parentNode.domNode ?? parentNode.domParent
  // } else if (component.node) {
  //   component.node.domParent = component.domParent;
  // }

//   node.r = state.r;
  if (component instanceof TextComponent) {
    // if (props) {
    //   component.props = props;
    // }
    const textContent: string = component.props.value.textContent.toString();
    if (!component.domNode) {
      component.domNode = document.createTextNode(textContent);
    }
    if (textContent !== component.domNode.textContent) {
      component.domNode.textContent = textContent;
    }
  // } else if (component.type === "FRAGMENT") {
  //   for (const child of component.children) {
  //     child.domParent = component.domParent;
  //     render(child);
  //   }
  } else {
    if (component instanceof HtmlComponent) {
      if (!component.domNode) {
        component.domNode = document.createElement(component.tag);
      }
      component.updateHtml();
    }
    if (!component.nodes) {
      globalComponentContext = component;
      let rendered = component.render(component.children);
      if (!Array.isArray(rendered)) {
        rendered = [rendered];
      }
      globalComponentContext = null;
      component.nodes = rendered;
      const skipRender = component instanceof If && !component.props.value.cond;
      for (const child of component.nodes) {
        child.domParent = component.domNode as HTMLElement ?? component.domParent;
        if (skipRender) {
          continue;
        }
        render(child);
      }
      component.update();
    }
    // for (const child of component.children) {
    //   child.domParent = component.domNode as HTMLElement;
    //   render(child);
    // }
    // if (!node.state) {
    //   node.state = new InternalState(node, state.options);
    // }
    // if (component.type === "FRAGMENT" || nodeChanged(component)) {
      // if (props) {
      //   Object.assign(component.props!, props);;
      // }
      if (component instanceof If) {
        for (const child of component.nodes) {
          child.remove = !component.props.value.cond;
          if (component.props.value.cond && !child.nodes) {
            render(child);
          }
        }
        // if (!component.props.value.cond) {
        //   renderNodes()
        // }
      }
      // if (component.rc === 0) {
      //   for (const node of component.nodes) {
      //     requestRender(node);
      //   }
      // }
//       let componentFactory: ComponentFunction = typeof component.type === "string"
//         ? (HTML_COMPONENT[component.type] ?? htmlComponent).bind(null, node.domNode as HTMLElement) as ComponentFunction
//         : component.type;
//       currentComponentState = node.state;
//       currentComponentStateIndex = 0;
//       node.state!.dirty = false;
//       const renderedContent = componentFactory(
//         {content: component.content, ...component.props},
//         node.state!,
//         { debug: state.options?.debug, renderCount: node.rc }
//       );
//       if (node.state!.dirty) {
//         state.changedDuringRender.add(node);
//       }
//       component.content = uiNodeToComponentArray(renderedContent);
//       const renderedNodes: VNode[] = [];
//       const portalChildren: VNode[] = [];
//       for (const childComponent of component.content) {
//         const childNode = getNode(node, childComponent, renderedNodes);
//         if (childComponent.domParent) {
//           portalChildren.push(childNode);
//         }
//         if (nodeChanged(childNode, childComponent)) {
//           render(state, childNode, childComponent);
//         }
//         portalChildren.push(...childNode.portalChildren);
//       }
//       for (const n of node.nodes) {
//         if (n.r !== node.r) {
//           removeNode(n);
//         }
//       }
//       node.nodes = renderedNodes;
//       node.portalChildren = portalChildren;
//     }
  }

//   node.component = component;
//   node.component.changed = false;
  component.rc++;
}

// export function createPortal(node: UINode, domParent: HTMLElement, key?: any): UINode {
//   return { type: () => node, key, domParent, content: null, props: null };
// }


type HtmlComponentFunction = {
  (component: HtmlComponent): void; //e: HTMLElement, props: HtmlContentComponentProps<any>, state: State, debugInfo: DebugInfo): UINode;
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
    if(events[event] !== component.attachedEvents[event]) {
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

  // if (debugInfo.debug) {
  //   e.setAttribute("data-render-count", debugInfo.renderCount.toString());
  // }

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

class HtmlComponent extends Component<HtmlContentComponentProps<any>> {
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
  render(children: Component[]) { return children; }
}
class TextComponent extends Component<{ textContent: string | number }> {
  constructor(textContent = "") {
    super({ textContent }, {});
  }
  render() { return [] }
}
class FragmentComponent extends Component<{}> {
  constructor() {
    super({}, {});
  }
  render(children: Component[]) { return children; }
}

export class If extends Component<{ cond: boolean }> {
  constructor() {
    super({ cond: false }, {});
  }
  render(children: Component[]) { return children; }
}

export const fragment = "FRAGMENT";

export function createElement<P extends AnyRecord>(
  type: ComponentType<P>,
  binding?: { binding?: (props: AnyRecord, state: State<AnyRecord>) => P },
  // props: P & { key?: any } | null, 
  ...children: (Component | ((props: AnyRecord, state: State<AnyRecord>) => string) | string)[]
): Component {
  // const { key, ...restProps } = props ?? {};
  // if (type instanceof Fragment) {
  //   return content;
  // }

  const component = type === "TEXT" ? (
    new TextComponent()
  ) : type === "FRAGMENT" ? (
    new FragmentComponent()
  ) : typeof type === "string" ? (
    new HtmlComponent(type)
  ) : (
    new type()
  );

  component.domParent = (globalComponentContext!.domNode as HTMLElement) ?? globalComponentContext!.domParent;

  const children0: Component[] = [];
  for (let child of children) {
    if (child instanceof Function) {
      const f = child;
      child = new TextComponent();
      child.bind(globalComponentContext!, (props: AnyRecord, state: State<AnyRecord>) => ({ textContent: f(props, state) }));
    } else if (typeof child === "string") {
      child = new TextComponent(child);
    }
    children0.push(child);
  }

  // const node: Component | undefined = nodes.length === 0 ? undefined : nodes.length === 1 ? nodes[0] : {
  //   type: "FRAGMENT",
  //   props: { children },
  //   rc: 0,
  // };
  if (binding?.binding) {
    component.bind(globalComponentContext!, binding?.binding as any);
  }

  component.children = children0;

  return component;
}

const DOM_ROOTS = new Map<Node, Component>;

export function mountComponent(domTarget: HTMLElement, node: Component/*, options: RenderOptions = {}*/) {
  // let node = DOM_ROOTS.get(domTarget);
  // if (!node) {
  //   node = {
  //     rc: 0,
  //     component: {
  //       type: component.type, 
  //       key: component.key
  //     },
  //     nodes: [],
  //     portalChildren: [],
  //     domParent: domTarget,
  //   };
  //   node.state = new InternalState(node, options);
  //   node.state.forceRender = true;
    DOM_ROOTS.set(domTarget, node);
  // }
  // node.component = { type: component.type, key: component.key };
  node.domParent = domTarget;
  requestRender(node/*, options*/);
  console.log(node);
  (window as any).c = node;
  (window as any).r = () => {
    requestRender(node/*, options*/);
    console.log(node);
  };
}

export default {
  fragment,
  createElement,
  mountComponent,
  If,
  // useState,
  // useRef,
  // useMemo,
  // useCallback,
  // useEffect,
};