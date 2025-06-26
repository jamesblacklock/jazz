export type * from "./htmlTypes";
import { compileTemplate } from "./compiler";
import type {
  EventsMap,
  HtmlAProps,
  HtmlComponentProps,
  HtmlInputProps,
  StyleMap,
} from "./htmlTypes";

function mapValues<
  In extends Readonly<Record<string, In[string]>>,
  Out extends Record<keyof In, OutField>,
  OutField
>(record: In, f: <K extends keyof In>(entry: In[K]) => OutField): Out {
  return Object.fromEntries(Object.entries(record).map(entry => [entry[0], f(entry[1])])) as Out;
}

export type RenderOptions = {
  debug?: boolean;
};

type AnyRecord = Record<keyof any, any>;

class Binding<P> {
  f: (arg0: any, arg1: any, arg2: any) => P;
  args: [any, any, any];
  source: ComponentId;
  constructor(source: ComponentId, f: Binding<P>["f"], args: Binding<P>["args"]) {
    this.source = source;
    this.f = f;
    this.args = args;
  }
  call() {
    return this.f.call(null, ...this.args);
  }
  clone() {
    return new Binding(this.source, this.f, [...this.args]);
  }
}

class Props<P extends AnyRecord> {
  value: P;
  binding: Binding<P> | null | undefined = null;
  dirty = false;

  constructor(props: P) {
    this.value = props;
    this.binding = null;
  }
  update(newValue?: P): boolean {
    const props = newValue ?? this.binding?.call();
    if (props == null) {
      return false;
    }
    const dirty = this.dirty;
    this.dirty = false;
    if (!Props.propsMatch(this.value, props, 1)) {
      Object.assign(this.value, props);
      return true;
    }
    return dirty;
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

type ComponentType = "Text"|"Html"|"Component"|"If"|"Foreach"|"ForeachItem";
type ComponentId = Symbol;

export class Component<P extends AnyRecord = {}, S extends AnyRecord = {}, D extends AnyRecord | undefined = undefined> {
  readonly name: string;
  domParent: HTMLElement | undefined;
  rc: number;
  nodes?: ComponentId[];
  children: Component<any, any, any>[];
  type: ComponentType;
  id: ComponentId;
  renderOptions: RenderOptions;
  display: { _visible: boolean };
  config: ComponentConfig<P, S, D>;
  props: Props<P>;
  state: State<S>;
  private bindingId?: ComponentId;
  private internalState: InternalState<S>;
  private desc: ComponentId[];
  private updating: boolean;
  private inserted: boolean;

  constructor(config: ComponentConfig<P, S, D>) {
    this.name = config.name;
    this.id = Symbol();
    COMPONENT_MAP.set(this.id, this);
    this.type = "Component";
    this.props = new Props<S>(config.props);
    this.internalState = new InternalState<S>(this.id, config.state);
    this.state = this.internalState;
    this.desc = [];
    this.updating = false;
    this.inserted = false;
    this.display = { _visible: false };
    // this.imports = mapValues(config.imports ?? {}, c => c.id);
    this.domParent = undefined;
    this.renderOptions = {};
    this.rc = 0;
    this.nodes = undefined;
    this.children = config.children ?? [];
    this.config = config;
    this.config.onCreated?.(this);
  }
  clone(index?: number, foreachItem?: ForeachItemComponent): Component<any, any, any> {
    const config = { ...this.config };
    if (this.config.data) {
      config.data = { ...this.config.data };
    }
    if (this.type === "Html") {
      (config.data as any).domNode = document.createElement((config.data as any).tag);
      (config.data as any).attachedEvents = {};
      (config.data as any).savedStyle = {};
    } else if (this.type === "Text") {
      (config.data as any).domNode = document.createTextNode(this.props.value.textContent.toString());
    }

    const clone = new Component(config);
    clone.type = this.type;
    clone.props.dirty = true;
    clone.domParent = this.domParent;
    clone.renderOptions = this.renderOptions;
    clone.display = this.display;
    clone.children = [];

    if (this.props.binding) {
      const source = COMPONENT_MAP.get(this.props.binding.source)!;
      clone.props.binding = this.props.binding.clone();
      clone.bindingId = Symbol();
      source.desc.push(clone.bindingId);
    }

    if (this.type === "ForeachItem") {
      const thisForeach = this as unknown as ForeachItemComponent;
      let context = thisForeach.config.data.context;
      if (foreachItem) {
        context = cloneForeachContext(foreachItem?.config.data.context);
        context.bindings[thisForeach.config.data.itemName] = { ...thisForeach.config.data.context.bindings[thisForeach.config.data.itemName] };
        index = undefined;
      }
      // clone.config.data!.componentContext = thisForeach.config.data.componentContext;
      // clone.config.data!.itemName = thisForeach.config.data.itemName;
      clone.config.data!.context = cloneForeachContext(context, thisForeach.config.data.itemName, index);
      foreachItem = clone as unknown as ForeachItemComponent;
    }

    for (const child of this.children ?? []) {
      const childClone = child.clone(index, foreachItem);
      if (this.type === "If" && (this as unknown as IfComponent).config.data.elseChildren.has(child.id)) {
        (clone as unknown as IfComponent).config.data.elseChildren.add(childClone.id);
      }
      clone.children.push(childClone);
    }

    clone.bindForeachContext(foreachItem);
    return clone;
  }
  static newTextComponent(textContent: string | number = ""): TextComponent {
    const component = new Component({
      name: "Text",
      props: { textContent },
      state: {},
      data: { domNode: new Text(textContent.toString()) },
      onUpdated(component: TextComponent) {
        component.config.data!.domNode.textContent = component.props.value.textContent.toString();
      },
    });
    component.type = "Text";
    return component;
  }
  static newIfComponent(): IfComponent {
    const component: IfComponent = new Component({
      name: "If",
      props: { cond: false },
      state: {},
      render(component: IfComponent) {
        component.config.data.visibilityChanged(component);
        return component.children;
      },
      onUpdated(component: IfComponent) {
        component.config.data.visibilityChanged(component);
      },
      data: {
        elseChildren: new Set,
        visibilityChanged(component: IfComponent) {
          for (const child of component.children) {
            child.setVisible(component.visible && component.props.value.cond !== component.config.data!.elseChildren.has(child.id));
          }
        }
      },
      children: [],
    });
    component.type = "If";
    return component;
  }
  static newForeachComponent<T>(itemName: string, indexName: string | undefined, componentContext: Component): ForeachComponent<T> {
    const component: ForeachComponent<T> = new Component({
      name: "Foreach",
      props: { items: [] as Iterable<T> },
      state: {},
      render(component: ForeachComponent<T>): Component[] {
        const child = component.children[0] as unknown as ForeachItemComponent;
        child.config.data.context.bindings[component.config.data.itemName].items = component.config.data.items;
        child.display = component.display;
        child.domParent = component.domParent;
        child.renderOptions = component.renderOptions;
        return [];
      },
      onUpdated(component: ForeachComponent<T>) {
        component.config.data.items.splice(0, component.config.data.items.length);
        component.config.data.items.push(...(component.props.value.items ?? []));
      },
      data: {
        itemName,
        indexName,
        context: { init: false, bindings: {} },
        componentContext: componentContext.id,
        items: [] as T[],
      },
    });
    component.type = "Foreach";
    if (componentContext.type === "ForeachItem") {
      const foreachItem = componentContext as unknown as ForeachItemComponent;
      component.config.data.context.bindings = { ...foreachItem.config.data.context.bindings };
    }
    component.config.data.context.bindings[component.config.data.itemName] = { items: component.config.data.items, index: null, indexName }
    if (indexName) {
      delete component.config.data.context.bindings[indexName];
    }

    return component;
  }
  static newForeachItemComponent<T>(componentContext: Component, foreachContext: ForeachContext, itemName: string, index?: number): ForeachItemComponent {
    const component: ForeachItemComponent = new Component({
      name: "ForeachItem",
      props: {},
      state: {},
      data: {
        context: cloneForeachContext(foreachContext, itemName, index),
        componentContext: componentContext.id,
        itemName,
      },
      render(component) {
        return component.children;
      }
    });
    component.type = "ForeachItem";
    return component;
  }
  static newHtmlComponent<
    Tag extends keyof HTMLElementTagNameMap,
    P extends HtmlComponentProps<Tag>,
    S extends AnyRecord
  >(tag: Tag, props = {}, state = {}): HtmlComponent<Tag, P, S> {
    const component = new Component({
      name: tag,
      props,
      state,
      data: {
        tag,
        domNode: document.createElement(tag),
        attachedEvents: {},
        savedStyle: {},
      },
      onUpdated: onHtmlPropsChanged as any,
      render(component) {
        return component.children;
      },
    });
    component.type = "Html";
    return component as any;
  }

  static newHtmlInputComponent(): HtmlComponent<"input", HtmlInputProps, { value: string }> {
    const component: HtmlComponent<"input", HtmlInputProps, { value: string }> = Component.newHtmlComponent("input", { value: "" }, { value: "" });
    component.config.data.domNode.addEventListener("input", e => component.update(undefined, { value: (e.target as any).value } as any));
    component.config.onUpdated = (component: HtmlComponent<"input", HtmlInputProps, { value: string }>, prevProps: HtmlInputProps) => {
      onHtmlPropsChanged(component);
      if (prevProps.value !== component.props.value.value) {
        component.config.data.domNode.value = component.props.value.value;
        component.state.set.value(component.props.value.value ?? "");
      }
    }
    return component;
  }

  static newHtmlAnchorComponent(): HtmlComponent<"a", HtmlAProps> {
    const component = Component.newHtmlComponent("a", { href: null, target: null });
    component.config.onUpdated = ((component: HtmlComponent<"a", HtmlAProps>, prevProps: HtmlAProps) => {
      onHtmlPropsChanged(component);
      const props = component.props.value;
      const { href, target } = props;
      if (href === null) {
        component.config.data.domNode.removeAttribute("href");
      } else {
        component.config.data.domNode.href = href;
      }
      if (target === null) {
        component.config.data.domNode.removeAttribute("target");
      } else {
        component.config.data.domNode.target = target;
      }
    }) as any;
    return component as any;
  }

  get visible() { return this.display._visible }
  setVisible(visible: boolean) {
    if (this.visible == visible) {
      return;
    }
    this.display._visible = visible;
    if (this.type === "If") {
      const ifComponent = this as unknown as IfComponent;
      ifComponent.config.data.visibilityChanged.call(null, ifComponent);
    }
  }
  render(): Component[] {
    if (this.config.render) {
      return this.config.render.call(null, this);
    } else if (this.config.template) {
      return compileTemplate(this);
    }
    return [];
  }
  bind<Q extends AnyRecord, R extends AnyRecord>(other: Component<Q, R, any>, f: (props: Q, state: State<R>) => P) {
    this.unbind();
    let props, state, isForeachItem;
    if (other.type === "ForeachItem") {
      let id = (other as unknown as ForeachItemComponent).config.data.componentContext;
      let c = COMPONENT_MAP.get(id)!;
      while (c.type === "ForeachItem") {
        id = (c as unknown as ForeachItemComponent).config.data.componentContext;
        c = COMPONENT_MAP.get(id)!;
      }
      props = c.props;
      state = c.state;
      isForeachItem = true
    } else {
      props = other.props;
      state = other.state;
    }
    this.props.binding = new Binding(other.id, f, [props.value, state, null]);
    this.bindingId = Symbol();
    BINDING_MAP.set(this.bindingId, this.id);
    other.desc.push(this.bindingId);
    if (isForeachItem) {
      return;
    }
    this.update();
  }
  bindForeachContext(foreachItem?: ForeachItemComponent) {
    if (foreachItem && this.props.binding) {
      this.props.binding.args[2] = foreachItem.config.data.context.bindings;
      foreachItem.desc.push(this.bindingId!);
    }
  }
  unbind() {
    if (this.bindingId) {
      BINDING_MAP.delete(this.bindingId);
      delete this.bindingId;
    }
    this.props.binding = null;
  }
  update(newProps?: P, newState?: S): boolean {
    if (this.updating) {
      return false;
    }
    this.updating = true;
    if (!this.visible) {
      if (this.inserted) {
        this.config.onRemoved?.(this);
        this.inserted = false;
      }
      this.updating = false;
      return false;
    }
    const prevProps = Object.assign({}, this.props.value);
    const prevState = Object.assign({}, this.state.value);
    const propsChanged = this.props.update(newProps) || this.type === "ForeachItem";
    const stateChanged = this.internalState.props.update(newState);

    if (!this.inserted) {
      this.config.onInserted?.(this);
      this.inserted = true;
    }

    if (propsChanged || stateChanged || this.rc === 0) {
      this.config.onUpdated?.(this, prevProps, prevState);
      let desc: ComponentId[] = [];
      for (const id of this.desc) {
        const c = COMPONENT_MAP.get(BINDING_MAP.get(id) ?? Symbol());
        if (!c) {
          continue;
        }
        desc.push(id);
        if (c.update()) {
          requestRender(c);
        }
      }
      this.desc = desc;
      this.updating = false;
      return true;
    }
    this.updating = false;
    return false;
  }
}

function onHtmlPropsChanged<
  Tag extends keyof HTMLElementTagNameMap,
  P extends HtmlComponentProps<Tag>,
  S extends AnyRecord
>(component: HtmlComponent<Tag, P, S>) {
  const props = component.props.value;
  const e = component.config.data.domNode! as HTMLElement;
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
  const eventNames = Array.from(new Set([...Object.keys(events), ...Object.keys(component.config.data.attachedEvents)])) as (keyof EventsMap<any>)[];
  for (const event of eventNames) {
    // THIS IS A HACK!!!!
    if(events[event]?.toString() !== component.config.data.attachedEvents[event]?.toString()) {
      if (component.config.data.attachedEvents[event]) {
        e.removeEventListener(event, component.config.data.attachedEvents[event] as any as EventListener);
        delete component.config.data.attachedEvents[event];
      }
      if(events[event]) {
        e.addEventListener(event, events[event] as any as EventListener);
        component.config.data.attachedEvents[event] = events[event] as any;
      }
    }
  }
  if (!Props.propsMatch(style, component.config.data.savedStyle)) {
    component.config.data.savedStyle = style;
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
}

export type TextComponent = Component<{ textContent: string | number }, {}, { domNode: Text }>;

export type IfComponent = Component<
  { cond: false }, {},
  { elseChildren: Set<ComponentId>, visibilityChanged: (component: IfComponent) => void }
>;

export type ForeachComponent<T> = Component<
  { items: Iterable<T> }, {},
  {
    itemName: string;
    indexName?: string;
    context: ForeachContext;
    componentContext: ComponentId;
    items: T[];
  }
>;

export type ForeachItemComponent = Component<
  {}, {}, {
    context: ForeachContext;
    componentContext: ComponentId;
    itemName: string;
  }
>;

type HtmlComponentData<Tag extends keyof HTMLElementTagNameMap> = {
  readonly tag: Tag;
  domNode: HTMLElementTagNameMap[Tag];
  attachedEvents: EventsMap<Tag>;
  savedStyle: StyleMap | undefined;
};

type HtmlComponent<
  Tag extends keyof HTMLElementTagNameMap,
  P extends HtmlComponentProps<Tag> = HtmlComponentProps<Tag>,
  S extends AnyRecord = {}
> = Component<P, S, HtmlComponentData<Tag>>;

type Data<D> = D extends undefined ? { data?: undefined } : { data: D };

type ComponentConfig<P extends AnyRecord, S extends AnyRecord, D extends AnyRecord | undefined = undefined> = Data<D> & {
  name: string;
  props: P;
  state: S;
  imports?: Record<string, () => Component<any, any, any>>;
  template?: string;
  render?: (component: Component<P, S, D>) => Component<any, any, any>[];
  children?: Component<any, any, any>[];
  onCreated?:(component: Component<P, S, D>) => void;
  onInserted?:(component: Component<P, S, D>) => void;
  onUpdated?:(component: Component<P, S, D>, prevProps: P, prevState: S) => void;
  onRemoved?:(component: Component<P, S, D>) => void;
  // onDeleted?:(component: Component<P, S, D>) => void;
}

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
    // });
    });
  }
}

type Setter<T extends AnyRecord> = {
  [K in keyof T]: (newValue: T[K]) => void;
};

export const COMPONENT_MAP = new Map<ComponentId, Component<any, any, any>>;
const BINDING_MAP = new Map<ComponentId, ComponentId>;
(window as any).COMPONENT_MAP = COMPONENT_MAP;
(window as any).BINDING_MAP = BINDING_MAP;

class InternalState<T extends AnyRecord> implements State<T> {
  props: Props<T>;
  nextValue: T | null;
  value: T;
  component: Component<any, T> | ComponentId;
  set: Setter<T>;
  frame: number | null = null;

  constructor(component: Component<any, T> | ComponentId, value: T) {
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
    this.nextValue = newValue;
    this.update();
  }
  internalSetField<K extends keyof T>(field: K, newValue: T[K]) {
    this.nextValue = { ...(this.nextValue ?? this.value), [field]: newValue };
    this.update();
  }
  update() {
    if (this.frame === null) {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        if (this.nextValue) {
          const component = this.component instanceof Component ? this.component : COMPONENT_MAP.get(this.component)!;
          component.update(undefined, this.nextValue);
          this.nextValue = null;
        }
      });
    }
  }
}

function* reversed<T>(arr: T[]): Generator<T> {
  for (let i=arr.length-1; i>=0; --i) {
    yield arr[i];
  }
}

function updateHtml(
  component: Component<any, any, any>,
  nextSibling: Node | null = null,
  checkSiblings: boolean = false,
): Node | null {
  if (!component.visible) {
    removeNode(component);
    return nextSibling;
  }
  const isDomNode = component.type === "Text" || component.type === "Html";
  let domNode: Text | HTMLElement;
  if (isDomNode) {
    domNode = (component as unknown as TextComponent).config.data.domNode;
    const contained = component.domParent!.contains(domNode);
    const siblingOk = !checkSiblings || domNode.nextSibling === nextSibling;
    if (!contained || !siblingOk) {
      component.domParent!.insertBefore(domNode, checkSiblings ? nextSibling : null);
    }
  }
  let childCheckSiblings = !!(isDomNode || checkSiblings);
  let lastInserted: Node | null = isDomNode ? null : nextSibling;
  for (const childId of reversed(component.nodes ?? [])) {
    const childNode = COMPONENT_MAP.get(childId)!;
    const isPortalChild = false; // childNode.domParent !== (node.domNode ?? node.domParent);
    const res = updateHtml(childNode, lastInserted, childCheckSiblings && !isPortalChild);
    if (!isPortalChild) {
      lastInserted = res ?? lastInserted;
      childCheckSiblings = true;
    }
  }

  return isDomNode ? domNode! : lastInserted;
}

function removeNode(component: Component) {
  // node.portalChildren.forEach(removeNode);
  if (component.type === "Text" || component.type === "Html") {
    (component as unknown as TextComponent).config.data.domNode.remove();
    return;
  }
  component.nodes?.forEach(id => removeNode(COMPONENT_MAP.get(id)!));
}

function render(component: Component) {
  if (!component.visible) {
    component.update();
    return;
  }

  // if (component.type === "Text") {
  //   const textContent: string = component.props.value.textContent.toString();
  //   if (!component.domNode) {
  //     component.domNode = document.createTextNode(textContent);
  //   }
  //   if (textContent !== component.domNode.textContent) {
  //     component.domNode.textContent = textContent;
  //   }
  // } else {
    if (!component.nodes || component.type === "If") {
      const rendered = component.render();
      component.nodes = rendered.map(c => c.id);
      const isForeach = component.type === "Foreach";
      for (const childId of component.nodes) {
        const child = COMPONENT_MAP.get(childId)!;
        child.domParent = component.type === "Html" ? (component as unknown as HtmlComponent<any>).config.data.domNode : component.domParent;
        child.renderOptions = component.renderOptions;
        if (component.type !== "If") {
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

    if (component.type === "Foreach") {
      const foreach = component as unknown as ForeachComponent<any>;
      const nodes = component.nodes ?? [];
      while (nodes.length > foreach.config.data.items.length) {
        const nodeId = nodes.pop()!;
        removeNode(COMPONENT_MAP.get(nodeId)!);
      }
      const child = component.children[0] as unknown as ForeachItemComponent;
      for (let i = 0; i < foreach.config.data.items.length; i++) {
        let clone;
        if (i < nodes.length) {
          clone = COMPONENT_MAP.get(nodes[i])!;
          // clone.bindForeachContext(component);
        } else {
          clone = child.clone(i);
        }
        if (i >= nodes.length) {
          nodes.push(clone.id);
        }
      }
      component.nodes = nodes;

      for (const nodeId of component.nodes) {
        const node = COMPONENT_MAP.get(nodeId)!;
        render(node);
        node.update();
      }
  //  }
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
