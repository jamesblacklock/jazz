use std::any::Any;
use std::collections::{HashMap, HashSet};
use std::rc::{Rc, Weak};
use std::cell::{Ref, RefMut, Cell, RefCell};
use std::hash::{Hash};

trait ValueProducer<T> {
  fn get_value(&self) -> T;
}

impl <T: Clone> ValueProducer<T> for T {
  fn get_value(&self) -> T {
    self.clone()
  }
}

impl ValueProducer<String> for &'static str {
  fn get_value(&self) -> String {
    self.to_string()
  }
}

trait Q: 'static + Clone + Eq + Default {}
impl <T> Q for T where T: 'static + Clone + Eq + Default {}

#[derive(Clone)]
struct Binding<P: Q, S: Q, Output, F: Fn(P, &State<S>, ()) -> Output> {
  f: Rc<F>,
  component: Component<P, S>,
  foreach: (),
}

impl <P: Q, S: Q, Output, F: Fn(P, &State<S>, ()) -> Output> Binding<P, S, Output, F> {
  fn call(&self) -> Output {
    return (&*self.f)(self.component.props(), self.component.state(), self.foreach);
  }
}

impl <P: Q, S: Q, Output, F: Fn(P, &State<S>, ()) -> Output> ValueProducer<Output> for Binding<P, S, Output, F> {
  fn get_value(&self) -> Output {
    self.call()
  }
}

struct Props<P: Q> {
  value: Rc<RefCell<P>>,
  binding: Cell<Option<Box<dyn ValueProducer<P>>>>,
  dirty: Cell<bool>,
}

impl <P: Q> Props<P> {
  fn new(props: P) -> Self {
    Self {
      value: Rc::new(RefCell::new(props)),
      binding: Default::default(),
      dirty: Cell::new(false),
    }
  }
  fn update(&self, new_value: Option<P>) -> bool {
    let dirty = self.dirty.replace(false);
    let binding = self.binding.replace(None);
    if let Some(props) = new_value.or_else(|| binding.as_ref().map(|b| ValueProducer::get_value(b.as_ref()))) {
      if *self.value.borrow() != props {
        self.value.replace(props);
        return true;
      }
    }
    self.binding.replace(binding);
    return dirty;
  }
  fn value(&self) -> P {
    self.value.borrow().clone()
  }
}

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
struct ComponentId(u32);

struct State<P: Q> {
  props: Props<P>,
  next_value: Cell<Option<P>>,
  component: Cell<Option<Weak<dyn StateComponentImplTrait<P>>>>,
  frame: Cell<Option<AnimationFrame>>,
}

impl <P: Q> State<P> {
  fn new(value: P) -> Self {
    State {
      props: Props::new(value),
      next_value: Cell::new(None),
      component: Cell::new(None),
      frame: Default::default(),
    }
  }
  fn value(&self) -> P {
    self.props.value()
  }
  fn set(&self, new_value: P) {
    self.next_value.replace(Some(new_value));
    self.update();
  }
  fn update(&self) {
    if let Some(frame) = self.frame.replace(None) {
      self.frame.replace(Some(frame));
    } else {
      let frame = request_animation_frame(|| {
        self.frame.replace(None);
        if let Some(next_value) = self.next_value.replace(None) {
          if let Some(Some(c)) = self.component.replace(None).map(|c| c.upgrade()) {
            StateComponentImplTrait::update(c.clone(), next_value);
            self.component.replace(Some(Rc::downgrade(&c)));
          }
        }
      });
      self.frame.replace(Some(frame));
    }
  }
}

struct RenderOptions { debug: bool }

impl Default for RenderOptions {
  fn default() -> Self {
    RenderOptions { debug: false }
  }
}

struct ComponentSystem {
  id_counter: u32,
  component_map: HashMap<ComponentId, AnyComponent>,
  render_options: RenderOptions,
}

impl ComponentSystem {
  fn new() -> Self {
    ComponentSystem {
      id_counter: 0,
      component_map: HashMap::new(),
      render_options: Default::default(),
    }
  }
  fn next_id(&mut self) -> ComponentId {
    let id = ComponentId(self.id_counter);
    self.id_counter += 1;
    return id;
  }
  fn create_component<P: Q, S: Q, Config: 'static + ComponentConfig<P, S>>(&mut self, config: Config) -> Component<P, S> {
    let id = self.next_id();
    let component = ComponentImpl::new(id, config, Default::default());
    self.component_map.insert(id, component.any());
    component
  }
  fn create_if_component(&mut self) -> Component<IfProps> {
    let id = self.next_id();
    let component = ComponentImpl::new_with_type(id, If, Default::default(), ComponentType::If(IfData { else_children: HashSet::new() }));
    self.component_map.insert(id, component.any());
    component
  }
  fn create_foreach_component<T: 'static + Clone>(
    &mut self, item_name: String, index_name: Option<String>, component_context: AnyComponent
  ) -> Component<ForeachProps<T>> {
    let id = self.next_id();
    let props = ForeachProps { items: Rc::new(Vec::new()) };
    let data = ForeachData { 
      foreach_item_component: None,
      item_name,
      index_name,
      // context: { init: false, bindings: {} },
      component_context: component_context.weak(),
      items: Cell::new(Rc::new(RefCell::new(Vec::<T>::new()))),
    };
    let component = ComponentImpl::new_with_type(id, Foreach, props, ComponentType::Foreach(data));
    self.component_map.insert(id, component.any());
    component
  }
  fn create_foreach_item_component(
    &mut self, component_context: AnyComponent, /*foreach_context: ForeachContext, */item_name: String, index: Option<u32>
  ) -> Component {
    let id = self.next_id();
    let data = ForeachItemData {
      item_name,
      component_context: component_context.weak(),
      // context: cloneForeachContext(foreachContext, itemName, index),
    };
    let component = ComponentImpl::new_with_type(id, ForeachItem, (), ComponentType::ForeachItem(data));
    self.component_map.insert(id, component.any());
    component
  }
  fn create_text_component<S: Into<String>>(&mut self, text_content: S) -> Component<HtmlTextProps> {
    let id = self.next_id();
    let props = HtmlTextProps { text_content: text_content.into() };
    let component = ComponentImpl::new_with_type(id, HtmlText, props, ComponentType::Text(TextData { dom_node: HtmlTextNode }));
    self.component_map.insert(id, component.any());
    component
  }
  fn create_html_component<P: Q + Into<HtmlProps>, S: Q, Config: 'static + HtmlComponentConfig<P, S>>(&mut self, config: Config) -> Component<P, S> {
    let id = self.next_id();
    let component = ComponentImpl::new_with_type(
      id,
      config,
      Default::default(),
      ComponentType::Html(HtmlData {
        tag: Config::tag(),
        dom_node: HtmlElement,
        attached_events: Default::default(),
        saved_style: Default::default(),
      }),
    );
    self.component_map.insert(id, component.any());
    component
  }

  // static newHtmlInputComponent(): HtmlComponent<"input", HtmlInputProps, { value: string }> {
  //   const component: HtmlComponent<"input", HtmlInputProps, { value: string }> = Component.newHtmlComponent("input", { value: "" }, { value: "" });
  //   component.config.data.domNode.addEventListener("input", e => component.update(undefined, { value: (e.target as any).value } as any));
  //   component.config.onUpdated = (component: HtmlComponent<"input", HtmlInputProps, { value: string }>, prevProps: HtmlInputProps) => {
  //     onHtmlPropsChanged(component);
  //     if (prevProps.value !== component.props.value.value) {
  //       component.config.data.domNode.value = component.props.value.value;
  //       component.state.set.value(component.props.value.value ?? "");
  //     }
  //   }
  // }

  // static newHtmlAnchorComponent(): HtmlComponent<"a", HtmlAProps> {
  //   const component = Component.newHtmlComponent("a", { href: null, target: null });
  //   component.config.onUpdated = ((component: HtmlComponent<"a", HtmlAProps>, prevProps: HtmlAProps) => {
  //     onHtmlPropsChanged(component);
  //     const props = component.props.value;
  //     const { href, target } = props;
  //     if (href === null) {
  //       component.config.data.domNode.removeAttribute("href");
  //     } else {
  //       component.config.data.domNode.href = href;
  //     }
  //     if (target === null) {
  //       component.config.data.domNode.removeAttribute("target");
  //     } else {
  //       component.config.data.domNode.target = target;
  //     }
  //   }) as any;
  //   return component as any;
  // }
}

trait ComponentConfig<P: Q = (), S: Q = ()> {
  fn name() -> String;
  fn render(_component: &Component<P, S>) -> Vec<AnyComponent> { Vec::new() }
  // imports?: Record<string, () => BoxedComponent>;
  fn on_created(_component: &Component<P, S>) {}
  fn on_inserted(_component: &Component<P, S>) {}
  fn on_updated(_component: &Component<P, S>, _prev_props: P, _prev_state: S) {}
  fn on_removed(_component: &Component<P, S>) {}
  fn on_deleted(_component: &Component<P, S>) {}
  fn on_visibility_changed(_component: &Component<P, S>) {}
}

macro_rules! foreach_event_name {
  ( $props:ident, $attached_events: ident, $body:expr ) => {
    {
      let event_name = "click";
      let event = $props.events.as_ref().and_then(|events| events.click.clone());
      let attached_event = &mut $attached_events.click;
      ($body)(event_name, event, attached_event);
    };
  } 
}
macro_rules! foreach_style_property {
  ( $saved_style:ident, $body:expr ) => {
    {
      let property_name = "background";
      let property_value = &$saved_style.background;
      ($body)(property_name, property_value);
      let property_name = "color";
      let property_value = &$saved_style.color;
      ($body)(property_name, property_value);
      let property_name = "background";
      let property_value = &$saved_style.background;
      ($body)(property_name, property_value);
      let property_name = "border";
      let property_value = &$saved_style.border;
      ($body)(property_name, property_value);
      let property_name = "cursor";
      let property_value = &$saved_style.cursor;
      ($body)(property_name, property_value);
      let property_name = "font_size";
      let property_value = &$saved_style.font_size;
      ($body)(property_name, property_value);
    };
  } 
}

fn on_html_updated<P: Q + Into<HtmlProps>, S: Q>(component: &Component<P, S>) {
  let props: HtmlProps = component.props().into();
  let data = component.component_type().html_data().unwrap();
  let e = data.dom_node;
  if let Some(id) = &props.id {
    e.set_id(id);
  } else {
    e.remove_attribute("id");
  }
  if let Some(class) = &props.class.or(props.class_name) {
    e.set_class_name(class);
  } else {
    e.remove_attribute("class");
  }
  let mut attached_events = data.attached_events.replace(None).unwrap();
  foreach_event_name! (props, attached_events, |
    event_name, event: Option<Callback<HtmlEvent>>, attached_event: &mut Option<Callback<HtmlEvent>>
  | {
    if event != *attached_event {
      if let Some(callback) = attached_event {
        e.remove_event_listener(event_name, callback.clone());
        *attached_event = None;
      }
      if let Some(callback) = event {
        e.add_event_listener(event_name, callback.clone());
        *attached_event = Some(callback.clone());
      }
    }
  });
  let mut saved_style = data.saved_style.replace(None).unwrap();
  if props.style != Some(saved_style) {
    saved_style = props.style.unwrap_or_default();
    e.remove_attribute("style");
    foreach_style_property! (saved_style, |property_name, property_value: &Option<String>| {
      if let Some(property_value) = property_value {
        e.set_style_property(property_name, property_value);
      }
    });
    data.saved_style.replace(Some(saved_style));
  }
  // if (ref) {
  //   if (ref instanceof Function) {
  //     ref(e);
  //   } else {
  //     ref.current = e;
  //   }
  // }

  // if (component.renderOptions.debug) {
  //   e.setAttribute("data-render-count", (component.rc + 1).toString());
  // }
}

trait HtmlComponentConfig<P: Q + Into<HtmlProps>, S: Q = ()> {
  fn tag() -> String;
  fn render(component: &Component<P, S>) -> Vec<AnyComponent> {
    component.children().clone()
  }
  fn on_created(_component: &Component<P, S>) {}
  fn on_inserted(_component: &Component<P, S>) {}
  fn on_updated(component: &Component<P, S>, _prev_props: P, _prev_state: S) {
    on_html_updated(component)
  }
  fn on_removed(_component: &Component<P, S>) {}
  fn on_deleted(_component: &Component<P, S>) {}
  fn on_visibility_changed(_component: &Component<P, S>) {}
}

impl <P: Q + Into<HtmlProps>, S: Q, H: HtmlComponentConfig<P, S>> ComponentConfig<P, S> for H {
  fn name() -> String {
    H::tag()
  }
  fn render(component: &Component<P, S>) -> Vec<AnyComponent> {
    H::render(component)
  }
  fn on_created(component: &Component<P, S>) {
    H::on_created(component)
  }
  fn on_inserted(component: &Component<P, S>) {
    H::on_inserted(component)
  }
  fn on_updated(component: &Component<P, S>, prev_props: P, prev_state: S) {
    H::on_updated(component, prev_props, prev_state)
  }
  fn on_removed(component: &Component<P, S>) {
    H::on_removed(component)
  }
  fn on_deleted(component: &Component<P, S>) {
    H::on_deleted(component)
  }
  fn on_visibility_changed(component: &Component<P, S>) {
    H::on_visibility_changed(component)
  }
}

struct TextData {
  dom_node: HtmlTextNode,
}

struct HtmlData {
  tag: String,
  dom_node: HtmlElement,
  attached_events: Cell<Option<HtmlEvents>>,
  saved_style: Cell<Option<HtmlStyle>>,
}

struct IfData { else_children: HashSet<ComponentId> }

struct ForeachData {
  foreach_item_component: Option<Component>,
  item_name: String,
  index_name: Option<String>,
  // context: ForeachContext,
  component_context: AnyComponentWeak,
  items: Cell<Rc<dyn Any>>,
}

impl ForeachData {
  fn take_items<T: 'static>(&self) -> Rc<RefCell<Vec<T>>> {
    self.items.replace(Rc::new(RefCell::new(Vec::<T>::new()))).downcast::<RefCell<Vec::<T>>>().unwrap()
  }
  fn put_items<T: 'static>(&self, items: Rc<RefCell<Vec<T>>>) {
    self.items.replace(items);
  }
}

struct ForeachItemData {
  // context: ForeachContext,
  component_context: AnyComponentWeak,
  item_name: String,
}

enum ComponentType {
  Component,
  Foreach(ForeachData),
  If(IfData),
  Text(TextData),
  Html(HtmlData),
  ForeachItem(ForeachItemData),
}

impl ComponentType {
  fn foreach_data(&self) -> Option<&ForeachData> {
    match &self { &ComponentType::Foreach(data) => Some(data), _ => None }
  }
  fn if_data(&self) -> Option<&IfData> {
    match &self { &ComponentType::If(data) => Some(data), _ => None }
  }
  fn text_data(&self) -> Option<&TextData> {
    match &self { &ComponentType::Text(data) => Some(data), _ => None }
  }
  fn html_data(&self) -> Option<&HtmlData> {
    match &self { &ComponentType::Html(data) => Some(data), _ => None }
  }
  fn foreach_item_data(&self) -> Option<&ForeachItemData> {
    match &self { &ComponentType::ForeachItem(data) => Some(data), _ => None }
  }
}

#[derive(Default, Clone)]
struct BindingCell(Rc<Cell<Option<AnyComponentWeak>>>);

impl BindingCell {
  fn take(&self) -> Option<AnyComponent> {
    if let Some(c) = self.0.replace(None) {
      return c.upgrade();
    }
    None
  }
  fn put(&self, c: AnyComponent) {
    self.0.replace(Some(c.weak()));
  }
}

impl BindingCell {
  fn new(component: AnyComponentWeak) -> Self {
    BindingCell(Rc::new(Cell::new(Some(component))))
  }
  fn invalidate(&self) {
    self.0.replace(None);
  }
}

struct ComponentImpl<P: Q, S: Q, Config: 'static + ComponentConfig<P, S>> {
  name: String,
  id: ComponentId,
  component_type: ComponentType,
  props: Props<P>,
  state: State<S>,
  binding_cell: Cell<BindingCell>,
  desc: Cell<Option<Vec<BindingCell>>>,
  children: Vec<AnyComponent>,
  nodes: Option<Vec<AnyComponent>>,
  rc: Cell<u32>,
  config: Config,
  dom_parent: Option<HtmlElement>,
  // display: { _visible: boolean };
  updating: Cell<bool>,
  inserted: Cell<bool>,
}

impl <P: Q, S: Q, Config: 'static + ComponentConfig<P, S>> ComponentImpl<P, S, Config> {
  fn new(id: ComponentId, config: Config, props: P) -> Component<P, S> {
    Self::new_with_type(id, config, props, ComponentType::Component)
  }
  fn new_with_type(id: ComponentId, config: Config, props: P, component_type: ComponentType) -> Component<P, S> {
    let component = Component(Rc::new(Self {
      state: State::new(Default::default()),
      desc: Cell::new(Some(Vec::new())),
      binding_cell: Default::default(),
      updating: Cell::new(false),
      inserted: Cell::new(false),
      props: Props::new(props),
      name: Config::name(),
      children: Vec::new(),
      dom_parent: None,
      rc: Cell::new(0),
      component_type,
      nodes: None,
      config,
      id,
    }));
    // this.display = { _visible: false };
    // this.imports = mapValues(config.imports ?? {}, c => c.id);
    component.set_state_component();
    component.on_created();
    component
  }
  // clone(index?: number, foreachItem?: ForeachItemComponent): Component<any, any, any> {
  //   const config = { ...this.config };
  //   if (this.config.data) {
  //     config.data = { ...this.config.data };
  //   }
  //   if (this.type === "Html") {
  //     (config.data as any).domNode = document.createElement((config.data as any).tag);
  //     (config.data as any).attachedEvents = {};
  //     (config.data as any).savedStyle = {};
  //   } else if (this.type === "Text") {
  //     (config.data as any).domNode = document.createTextNode(this.props.value.textContent.toString());
  //   }

  //   const clone = new Component(config);
  //   clone.type = this.type;
  //   clone.props.dirty = true;
  //   clone.domParent = this.domParent;
  //   clone.renderOptions = this.renderOptions;
  //   clone.display = this.display;
  //   clone.children = [];

  //   if (this.props.binding) {
  //     const source = COMPONENT_MAP.get(this.props.binding.source)!;
  //     clone.props.binding = this.props.binding.clone();
  //     clone.bindingId = Symbol();
  //     source.desc.push(clone.bindingId);
  //   }

  //   if (this.type === "ForeachItem") {
  //     const thisForeach = this as unknown as ForeachItemComponent;
  //     let context = thisForeach.config.data.context;
  //     if (foreachItem) {
  //       context = cloneForeachContext(foreachItem?.config.data.context);
  //       context.bindings[thisForeach.config.data.itemName] = { ...thisForeach.config.data.context.bindings[thisForeach.config.data.itemName] };
  //       index = undefined;
  //     }
  //     // clone.config.data!.componentContext = thisForeach.config.data.componentContext;
  //     // clone.config.data!.itemName = thisForeach.config.data.itemName;
  //     clone.config.data!.context = cloneForeachContext(context, thisForeach.config.data.itemName, index);
  //     foreachItem = clone as unknown as ForeachItemComponent;
  //   }

  //   for (const child of this.children ?? []) {
  //     const childClone = child.clone(index, foreachItem);
  //     if (this.type === "If" && (this as unknown as IfComponent).config.data.elseChildren.has(child.id)) {
  //       (clone as unknown as IfComponent).config.data.elseChildren.add(childClone.id);
  //     }
  //     clone.children.push(childClone);
  //   }

  //   clone.bindForeachContext(foreachItem);
  //   return clone;
  // }
  fn updating(&self) -> bool {
    let updating = self.updating.replace(true);
    self.updating.replace(updating);
    updating
  }
  fn inserted(&self) -> bool {
    let inserted = self.inserted.replace(true);
    self.inserted.replace(inserted);
    inserted
  }
  fn rc(&self) -> u32 {
    let rc = self.rc.replace(0);
    self.rc.replace(rc);
    rc
  }
  fn inc_rc(&self) -> u32 {
    let rc = self.rc.replace(0);
    self.rc.replace(rc + 1);
    rc
  }
  fn update(self: Rc<Self>, new_props: Option<P>, new_state: Option<S>) -> bool {
    if self.updating() {
      return false;
    }
    self.updating.replace(true);
    if !self.visible() {
      if self.inserted() {
        Config::on_removed(&Component(self.clone()));
        self.inserted.replace(false);
      }
      self.updating.replace(false);
      return false;
    }
    let prev_props = self.props.value();
    let prev_state = self.state.props.value();
    let props_changed = self.props.update(new_props) || self.component_type.foreach_item_data().is_some();
    let state_changed = self.state.props.update(new_state);

    if !self.inserted() {
      Config::on_inserted(&Component(self.clone()));
      self.inserted.replace(true);
    }

    if props_changed || state_changed || self.rc() == 0 {
      Config::on_updated(&Component(self.clone()), prev_props, prev_state);
      let mut desc: Vec<BindingCell> = Vec::new();
      for binding_cell in self.desc.replace(None).unwrap() {
        if let Some(c) = binding_cell.take() {
          if c.update() {
            // request_render(c);
          }
          binding_cell.put(c);
          desc.push(binding_cell);
        }
      }
      self.desc.replace(Some(desc));
      self.updating.replace(false);
      return true;
    }
    self.updating.replace(false);

    false
  }
}

trait AnyComponentImplTrait {
  fn component_type(&self) -> &ComponentType;
  fn children(&self) -> &Vec<AnyComponent>;
  fn on_visibility_changed(self: Rc<Self>);
  fn id(&self) -> ComponentId;
  fn visible(&self) -> bool;
  fn set_visible(self: Rc<Self>, visible: bool);
  fn render(self: Rc<Self>) -> Vec<AnyComponent>;
  fn add_descendant(&self, binding_cell: BindingCell);
  fn update(self: Rc<Self>) -> bool;
}

trait StateComponentImplTrait<S: Q>: AnyComponentImplTrait {
  fn update(self: Rc<Self>, new_state: S);
}

trait ComponentImplTrait<P: Q, S: Q>: StateComponentImplTrait<S> {
  fn update(self: Rc<Self>, new_props: Option<P>, new_state: Option<S>) -> bool;
  fn set_state_component(self: Rc<Self>);
  fn on_created(self: Rc<Self>);
  fn props(&self) -> P;
  fn state(&self) -> &State<S>;
  fn bind(self: Rc<Self>, binding: Box<dyn ValueProducer<P>>) -> BindingCell;
  fn unbind(&self);
}

impl <P: Q, S: Q, Config: 'static + ComponentConfig<P, S>> AnyComponentImplTrait for ComponentImpl<P, S, Config>{
  fn component_type(&self) -> &ComponentType {
    &self.component_type
  }
  fn children(&self) -> &Vec<AnyComponent> {
    &self.children
  }
  fn id(&self) -> ComponentId {
    self.id
  }
  fn visible(&self) -> bool {
    /*this.display._visible*/
    true
  }
  fn set_visible(self: Rc<Self>, visible: bool) {
    if self.visible() == visible {
      return;
    }
    // this.display._visible = visible;
    self.on_visibility_changed();
  }
  fn on_visibility_changed(self: Rc<Self>) {
    Config::on_visibility_changed(&Component(self.clone()));
  }
  fn render(self: Rc<Self>) -> Vec<AnyComponent> {
    Config::render(&Component(self.clone()))
  }
  fn add_descendant(&self, binding_cell: BindingCell) {
    let mut desc = self.desc.replace(None).unwrap();
    desc.push(binding_cell);
    self.desc.replace(Some(desc));
  }
  fn update(self: Rc<Self>) -> bool {
    ComponentImpl::update(self, None, None)
  }
}

impl <P: Q, S: Q, Config: 'static + ComponentConfig<P, S>> StateComponentImplTrait<S> for ComponentImpl<P, S, Config> {
  fn update(self: Rc<Self>, new_state: S) {
    ComponentImpl::update(self, None, Some(new_state));
  }
}

impl <P: Q, S: Q, Config: 'static + ComponentConfig<P, S>> ComponentImplTrait<P, S> for ComponentImpl<P, S, Config> {
  fn update(self: Rc<Self>, new_props: Option<P>, new_state: Option<S>) -> bool {
    ComponentImpl::update(self, new_props, new_state)
  }
  fn set_state_component(self: Rc<Self>) {
    let c: Rc<dyn StateComponentImplTrait<S>> = self.clone();
    self.state.component.replace(Some(Rc::downgrade(&c)));
  }
  fn on_created(self: Rc<Self>) {
    Config::on_created(&Component(self.clone()));
  }
  fn props(&self) -> P {
    self.props.value()
  }
  fn state(&self) -> &State<S> {
    &self.state
  }
  fn bind(self: Rc<Self>, binding: Box<dyn ValueProducer<P>>) -> BindingCell {
    self.unbind();
    self.props.binding.replace(Some(binding));
    let binding_cell = BindingCell::new(Component(self.clone()).weak());
    self.binding_cell.replace(binding_cell.clone());
    binding_cell
  }
  fn unbind(&self) {
    self.binding_cell.replace(Default::default()).invalidate();
    self.props.binding.replace(None);
  }
}

#[derive(Clone)]
struct Component<P: Q = (), S: Q = ()>(Rc<dyn ComponentImplTrait<P, S>>);

impl <P: Q, S: Q> Component<P, S> {
  fn any(&self) -> AnyComponent {
    AnyComponent(self.0.clone())
  }
  fn weak(&self) -> AnyComponentWeak {
    self.any().weak()
  }
  fn set_state_component(&self) {
    self.0.clone().set_state_component();
  }
  fn on_created(&self) {
    ComponentImplTrait::on_created(self.0.clone());
  }
  fn props(&self) -> P {
    self.0.props()
  }
  fn state(&self) -> &State<S> {
    self.0.state()
  }
  fn component_type(&self) -> &ComponentType {
    self.0.component_type()
  }
  fn children(&self) -> &Vec<AnyComponent> {
    self.0.children()
  }
  fn id(&self) -> ComponentId {
    self.0.id()
  }
  fn visible(&self) -> bool {
    self.0.visible()
  }
  fn set_visible(&self, visible: bool) {
    self.0.clone().set_visible(visible)
  }
  fn on_visibility_changed(&self) {
    self.0.clone().on_visibility_changed();
  }
  fn bind<T: Q, U: Q, F: 'static + Fn(T, &State<U>, ()) -> P>(&self, other: Component<T, U>, f: F) {
    let (is_foreach_item, component): (bool, Component<T, U>) =
      if let Some(foreach_item_data) = other.component_type().foreach_item_data() {
        // let id = foreachItem.data.componentContext;
        // let c = COMPONENT_MAP.get(id)!;
        // while (c.type === "ForeachItem") {
        //   id = (c as unknown as ForeachItemComponent).config.data.componentContext;
        //   c = COMPONENT_MAP.get(id)!;
        // }
        // component = c;
        (true, unimplemented!())
      } else {
        (false, other.clone())
      };
    let binding = Binding {
      component: component.clone(),
      f: Rc::new(f),
      foreach: (),
    };
    let binding_cell = self.0.clone().bind(Box::new(binding));
    other.any().add_descendant(binding_cell);
    if is_foreach_item {
      return;
    }
    ComponentImplTrait::update(self.0.clone(), None, None);
  }
  // fn bindForeachContext(foreachItem?: ForeachItemComponent) {
  //   if foreachItem && self.props.binding {
  //     self.props.binding.args[2] = foreachItem.config.data.context.bindings;
  //     foreachItem.desc.push(self.bindingId!);
  //   }
  // }
  fn update(&self, new_props: Option<P>, new_state: Option<S>) -> bool {
    ComponentImplTrait::update(self.0.clone(), new_props, new_state)
  }
}

#[derive(Clone)]
struct AnyComponent(Rc<dyn AnyComponentImplTrait>);

impl AnyComponent {
  fn weak(&self) -> AnyComponentWeak {
    AnyComponentWeak(Some(Rc::downgrade(&self.0)))
  }
  fn component_type(&self) -> &ComponentType {
    self.0.component_type()
  }
  fn children(&self) -> &Vec<AnyComponent> {
    self.0.children()
  }
  fn id(&self) -> ComponentId {
    self.0.id()
  }
  fn visible(&self) -> bool {
    self.0.visible()
  }
  fn set_visible(&self, visible: bool) {
    self.0.clone().set_visible(visible)
  }
  fn on_visibility_changed(&self) {
    self.0.clone().on_visibility_changed();
  }
  fn add_descendant(&self, binding_cell: BindingCell) {
    self.0.add_descendant(binding_cell);
  }
  fn update(&self) -> bool {
    self.0.clone().update()
  }
}

struct AnyComponentWeak(Option<Weak<dyn AnyComponentImplTrait>>);

impl AnyComponentWeak {
  fn new() -> AnyComponentWeak {
    AnyComponentWeak(None)
  }
  fn new_empty() -> AnyComponentWeak {
    AnyComponentWeak(None)
  }
  fn upgrade(self) -> Option<AnyComponent> {
    if let Some(Some(c)) = self.0.map(|c| c.upgrade()) {
      return Some(AnyComponent(c))
    }
    None
  }
}

struct Callback<Arg0>(Option<Rc<dyn Fn(Arg0)>>);

impl <Arg0> Callback<Arg0> {
  fn new<F: Fn(Arg0) + 'static>(f: F) -> Self {
    Callback(Some(Rc::new(f)))
  }
  fn call(&self, arg0: Arg0) {
    if let Some(f) = &self.0 {
      f(arg0)
    }
  }
}
impl <Arg0> Clone for Callback<Arg0> {
  fn clone(&self) -> Self {
    Callback(self.0.clone())
  }
}
impl <Arg0> PartialEq for Callback<Arg0> {
  fn eq(&self, other: &Self) -> bool {
    if let Some(f1) = &self.0 {
      if let Some(f2) = &other.0 {
        return Rc::ptr_eq(&f1, &f2)
      }
    }
    self.0.is_none() && other.0.is_none()
  }
}
impl <Arg0> Eq for Callback<Arg0> {}
impl <Arg0> Default for Callback<Arg0> {
  fn default() -> Self {
    Callback(None)
  }
}

struct StateVec<T: Clone>(Rc<RefCell<Vec<T>>>);
impl <T: Clone>  StateVec<T> {
  fn new(v: Vec<T>) -> Self {
    StateVec(Rc::new(RefCell::new(v)))
  }
  fn vec(&self) -> Ref<Vec<T>> {
    self.0.borrow()
  }
  fn vec_mut(&mut self) -> RefMut<Vec<T>> {
    self.0.borrow_mut()
  }
  fn len(&self) -> usize {
    self.0.borrow().len()
  }
  fn index(&self, i: usize) -> T {
    self.0.borrow().get(i).cloned().unwrap()
  }
}
impl <T: Clone> Default for StateVec<T> {
  fn default() -> Self {
    StateVec(Rc::new(RefCell::new(Vec::new())))
  }
}
impl <T: Clone> PartialEq for StateVec<T> {
  fn eq(&self, other: &Self) -> bool {
    Rc::ptr_eq(&self.0, &other.0)
  }
}
impl <T: Clone> Eq for StateVec<T> {}
impl <T: Clone> Clone for StateVec<T> {
  fn clone(&self) -> Self {
    StateVec(self.0.clone())
  }
}

#[derive(Clone, Copy)]
struct HtmlElement;

impl HtmlElement {
  fn set_id<S: Into<String>>(&self, id: S) {}
  fn remove_attribute<S: Into<String>>(&self, attr: S) {}
  fn set_class_name<S: Into<String>>(&self, class_name: S) {}
  fn remove_event_listener<S: Into<String>>(&self, event_name: S, f: Callback<HtmlEvent>) {}
  fn add_event_listener<S: Into<String>>(&self, event_name: S, f: Callback<HtmlEvent>) {}
  fn set_style_property(&self, property_name: impl Into<String>, property_value: impl Into<String>) {}
  fn set_value<S: Into<String>>(&self, value: S) {}
}

struct HtmlTextNode;

impl HtmlTextNode {
  fn set_text_content<S: Into<String>>(&self, text_content: S) {}
}

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
struct AnimationFrame(u32);

fn request_animation_frame(f: impl Fn()) -> AnimationFrame { AnimationFrame(0) }

struct HtmlEvent;

impl HtmlEvent {
  fn prevent_default(&self) {}
}

#[derive(Clone, PartialEq, Eq, Default)]
struct HtmlEvents {
  click: Option<Callback<HtmlEvent>>,
}

#[derive(Clone, PartialEq, Eq, Default)]
struct HtmlStyle {
  color: Option<String>,
  background: Option<String>,
  border: Option<String>,
  cursor: Option<String>,
  font_size: Option<String>,
}

#[derive(Default, Clone, PartialEq, Eq)]
struct HtmlTextProps { text_content: String }

struct HtmlText;

impl ComponentConfig<HtmlTextProps> for HtmlText {
  fn name() -> String { "text".into() }
  fn on_updated(component: &Component<HtmlTextProps>, _prev_props: HtmlTextProps, _prev_state: ()) {
    let HtmlTextProps { text_content } = component.props();
    component.component_type().text_data().unwrap().dom_node.set_text_content(text_content);
  }
}

macro_rules! html_props_no_impl {
  ($struct:ident) => { html_props_no_impl!($struct {}); };
  ($struct:ident {$( $field:ident:$type:ty ),*}) => {
    #[derive(Default, Clone, PartialEq, Eq)]
    struct $struct {
      class: Option<String>,
      class_name: Option<String>,
      events: Option<HtmlEvents>,
      style: Option<HtmlStyle>,
      id: Option<String>,
      $($field: $type,)*
    }
  };
}

macro_rules! html_props {
  ($struct:ident {$( $field:ident:$type:ty ),*}) => {
    html_props_no_impl!($struct {$( $field:$type ),*});
    impl Into<HtmlProps> for $struct {
      fn into(self) -> HtmlProps {
        HtmlProps {
          class: self.class.clone(),
          class_name: self.class_name.clone(),
          events: self.events.clone(),
          style: self.style.clone(),
          id: self.id.clone(),
        }
      }
    }
  };
}

struct HtmlInput;

html_props_no_impl!(HtmlProps);

html_props!(HtmlInputProps { value: String });

#[derive(Default, Clone, PartialEq, Eq)]
struct HtmlInputState { value: String }

impl HtmlComponentConfig<HtmlInputProps, HtmlInputState> for HtmlInput {
  fn tag() -> String { "input".to_owned() }
  fn on_updated(component: &Component<HtmlInputProps, HtmlInputState>, prev_props: HtmlInputProps, _prev_state: HtmlInputState) {
    on_html_updated(&component);
    let props = component.props();
    if prev_props != props {
      let HtmlData { dom_node, .. } = component.component_type().html_data().unwrap();
      dom_node.set_value(&props.value);
      component.state().set(HtmlInputState { value: props.value });
    }
  }
}

#[derive(Default, Clone, PartialEq, Eq)]
struct IfProps { cond: bool }

struct If;

impl ComponentConfig<IfProps> for If {
  fn name() -> String { "if".to_owned() }
  fn render(component: &Component<IfProps>) -> Vec<AnyComponent> {
    component.on_visibility_changed();
    component.children().clone()
  }
  fn on_updated(component: &Component<IfProps>, _prev_props: IfProps, _prev_state: ()) {
    component.on_visibility_changed();
  }
  fn on_visibility_changed(component: &Component<IfProps>) {
    let IfProps { cond } = component.props();
    let else_children = &component.component_type().if_data().unwrap().else_children;
    for child in component.children() {
      let is_else_child = else_children.contains(&child.id());
      child.set_visible(component.visible() && cond != is_else_child);
    }
  }
}

trait IntoIter<T> {
  fn into_iter<'a>(&'a self) -> Iter<&'a T>;
}

struct Iter<'a, T>(Box<dyn Iterator<Item = T> + 'a>);

impl <T> IntoIter<T> for Vec<T> {
  fn into_iter<'a>(&'a self) -> Iter<'a, &'a T> {
    Iter(Box::new(self.iter()))
  }
}

impl <'a, T: 'a> Iterator for Iter<'a, T> {
  type Item = T;
  fn next(&mut self) -> Option<Self::Item> {
    self.0.next()
  }
}

struct ForeachProps<T: Clone> { items: Rc<dyn IntoIter<T>> }

impl <T: Clone> Clone for ForeachProps<T> {
  fn clone(&self) -> Self {
    ForeachProps { items: self.items.clone() }
  }
}

impl <T: Clone> PartialEq for ForeachProps<T> {
  fn eq(&self, other: &Self) -> bool { 
    Rc::ptr_eq(&self.items, &other.items)
  }
}

impl <T: Clone> Eq for ForeachProps<T> {}

impl <T: 'static + Clone> Default for ForeachProps<T> {
  fn default() -> Self {
    ForeachProps { items: Rc::new(Vec::new()) }
  }
}

struct Foreach;

impl <T: 'static + Clone> ComponentConfig<ForeachProps<T>> for Foreach {
  fn name() -> String { "foreach".to_owned() }
  fn render(component: &Component<ForeachProps<T>>) -> Vec<AnyComponent> {
    let data = &component.component_type().foreach_data().unwrap();
    let child = data.foreach_item_component.as_ref().unwrap().clone();
    let child_data = child.component_type().foreach_item_data().unwrap();
    // child_data.context.bindings[component.config.data.item_name].items = component.config.data.items;
    // child.display = component.display;
    // child.dom_parent = component.dom_parent;
    // child.render_options = component.render_options;
    Vec::new()
  }
  fn on_updated(component: &Component<ForeachProps<T>>, _prev_props: ForeachProps<T>, _prev_state: ()) {
    let ForeachProps { items: iter } = component.props();
    let mut items: Rc<RefCell<Vec<T>>> = component.component_type().foreach_data().unwrap().take_items();
    items.borrow_mut().clear();
    for item in iter.into_iter() {
      items.borrow_mut().push(item.clone());
    }
  }
}

struct ForeachItem;

impl ComponentConfig for ForeachItem {
  fn name() -> String { "foreachItem".to_owned() }
  fn render(component: &Component) -> Vec<AnyComponent> {
    component.children().clone()
  }
}

// type ForeachContext = {
//   init: boolean;
//   bindings: {
//     [key: string]: {
//       items: any[];
//       index: number | null;
//       indexName?: string;
//     };
//   };
// };

// function cloneForeachContext(context: ForeachContext, itemName?: string, index?: number) {
//   const result: ForeachContext = { init: index != null, bindings: {} };
//   for (const name in context.bindings) {
//     result.bindings[name] = { ...context.bindings[name] };
//   }
//   if (itemName !== undefined && index !== undefined) {
//     result.bindings[itemName].index = index;
//   }
//   return result;
// }

// let renderQueueTimer: number | null = null;
// let renderQueue: Component[] = [];

// function requestRender(n: Component) {
//   renderQueue.push(n);
//   if (renderQueueTimer === null) {
//     renderQueueTimer = requestAnimationFrame(() => {
//       const rendered = new Set;
//       for (const node of renderQueue) {
//         if (rendered.has(node)) {
//           continue;
//         }
//         rendered.add(node);
//         render(node);
//         // while (renderState.changedDuringRender.size > 0) {
//         //   const reRender = renderState.changedDuringRender;
//         //   renderState = {r: Symbol(), options, changedDuringRender: new Set};
//         //   for (const node of reRender) {
//         //     node.state!.commit();
//         //     render(renderState, node, node.component);
//         //     renderState = {r: Symbol(), options, changedDuringRender: renderState.changedDuringRender};
//         //   }
//         // }
//         updateHtml(node);
//       }
//       renderQueueTimer = null;
//       renderQueue = [];
//     // });
//     });
//   }
// }

// function updateHtml(
//   component: Component<any, any, any>,
//   nextSibling: Node | null = null,
//   checkSiblings: boolean = false,
// ): Node | null {
//   if (!component.visible) {
//     removeNode(component);
//     return nextSibling;
//   }
//   const isDomNode = component.type === "Text" || component.type === "Html";
//   let domNode: Text | HTMLElement;
//   if (isDomNode) {
//     domNode = (component as unknown as TextComponent).config.data.domNode;
//     const contained = component.domParent!.contains(domNode);
//     const siblingOk = !checkSiblings || domNode.nextSibling === nextSibling;
//     if (!contained || !siblingOk) {
//       component.domParent!.insertBefore(domNode, checkSiblings ? nextSibling : null);
//     }
//   }
//   let childCheckSiblings = !!(isDomNode || checkSiblings);
//   let lastInserted: Node | null = isDomNode ? null : nextSibling;
//   for (const childId of reversed(component.nodes ?? [])) {
//     const childNode = COMPONENT_MAP.get(childId)!;
//     const isPortalChild = false; // childNode.domParent !== (node.domNode ?? node.domParent);
//     const res = updateHtml(childNode, lastInserted, childCheckSiblings && !isPortalChild);
//     if (!isPortalChild) {
//       lastInserted = res ?? lastInserted;
//       childCheckSiblings = true;
//     }
//   }

//   return isDomNode ? domNode! : lastInserted;
// }

// function removeNode(component: Component) {
//   // node.portalChildren.forEach(removeNode);
//   if (component.type === "Text" || component.type === "Html") {
//     (component as unknown as TextComponent).config.data.domNode.remove();
//     return;
//   }
//   component.nodes?.forEach(id => removeNode(COMPONENT_MAP.get(id)!));
// }

// function render(component: Component) {
//   if (!component.visible) {
//     component.update();
//     return;
//   }

//   // if (component.type === "Text") {
//   //   const textContent: string = component.props.value.textContent.toString();
//   //   if (!component.domNode) {
//   //     component.domNode = document.createTextNode(textContent);
//   //   }
//   //   if (textContent !== component.domNode.textContent) {
//   //     component.domNode.textContent = textContent;
//   //   }
//   // } else {
//     if (!component.nodes || component.type === "If") {
//       const rendered = component.render();
//       component.nodes = rendered.map(c => c.id);
//       const isForeach = component.type === "Foreach";
//       for (const childId of component.nodes) {
//         const child = COMPONENT_MAP.get(childId)!;
//         child.domParent = component.type === "Html" ? (component as unknown as HtmlComponent<any>).config.data.domNode : component.domParent;
//         child.renderOptions = component.renderOptions;
//         if (component.type !== "If") {
//           child.display = component.display;
//         }
//         if (isForeach) {
//           continue;
//         }
//         child.update();
//         render(child);
//       }
//       component.update();
//     }

//     if (component.type === "Foreach") {
//       const foreach = component as unknown as ForeachComponent<any>;
//       const nodes = component.nodes ?? [];
//       while (nodes.length > foreach.config.data.items.length) {
//         const nodeId = nodes.pop()!;
//         removeNode(COMPONENT_MAP.get(nodeId)!);
//       }
//       const child = component.children[0] as unknown as ForeachItemComponent;
//       for (let i = 0; i < foreach.config.data.items.length; i++) {
//         let clone;
//         if (i < nodes.length) {
//           clone = COMPONENT_MAP.get(nodes[i])!;
//           // clone.bindForeachContext(component);
//         } else {
//           clone = child.clone(i);
//         }
//         if (i >= nodes.length) {
//           nodes.push(clone.id);
//         }
//       }
//       component.nodes = nodes;

//       for (const nodeId of component.nodes) {
//         const node = COMPONENT_MAP.get(nodeId)!;
//         render(node);
//         node.update();
//       }
//   //  }
//   // const renderedNodes: VNode[] = [];
//   // const portalChildren: VNode[] = [];
//   // for (const childComponent of component.content) {
//   //   const childNode = getNode(node, childComponent, renderedNodes);
//   //   if (childComponent.domParent) {
//   //     portalChildren.push(childNode);
//   //   }
//   //   if (nodeChanged(childNode, childComponent)) {
//   //     render(state, childNode, childComponent);
//   //   }
//   //   portalChildren.push(...childNode.portalChildren);
//   // }
//   // for (const n of node.nodes) {
//   //   if (n.r !== node.r) {
//   //     removeNode(n);
//   //   }
//   // }
//   // node.nodes = renderedNodes;
//   // node.portalChildren = portalChildren;
//   }

//   component.rc++;
// }

// // export function createPortal(node: UINode, domParent: HTMLElement, key?: any): UINode {
// //   return { type: () => node, key, domParent, content: null, props: null };
// // }

// const DOM_ROOTS = new Map<Node, Component>;

// export function mountComponent(domTarget: HTMLElement, node: Component<any, any>, options: RenderOptions = {}) {
//   DOM_ROOTS.set(domTarget, node);
//   node.domParent = domTarget;
//   node.renderOptions = options;
//   node.setVisible(true);
//   requestRender(node);
// }

// export default {
//   mountComponent,
// };

#[derive(Clone, PartialEq, Eq, Default)]
struct Card { front: String, back: String }

#[derive(Clone, PartialEq, Eq, Default)]
struct Deck { name: String, cards: StateVec<Card> }

fn remove_deck(_i: usize) {}
fn load_static_decks() -> StateVec<Rc<Deck>> {
  StateVec::new(vec![
    Rc::new(Deck {
      name: "test".into(),
      cards: StateVec::new(vec![
        Card { front: "a".into(), back: "A".into() },
        Card { front: "b".into(), back: "B".into() },
        Card { front: "c".into(), back: "C".into() },
      ])
    }),
  ])
}
fn load_stored_decks() -> StateVec<Rc<Deck>> { Default::default() }

#[derive(Clone, PartialEq, Eq)]
struct ChooseDeckProps {
  deck_index: Option<usize>,
  choose_deck: Callback<Rc<Deck>>,
}

impl Default for ChooseDeckProps {
  fn default() -> Self {
    ChooseDeckProps { deck_index: None, choose_deck: Callback::new(|_| {}) }
  }
}

#[derive(Clone, PartialEq, Eq)]
struct ChooseDeckState {
  stored_decks: StateVec<Rc<Deck>>,
  static_decks: StateVec<Rc<Deck>>,
  remove_deck_clicked: Callback<(&'static State<ChooseDeckState>, usize)>,
  choose_deck_clicked: Callback<(ChooseDeckProps, HtmlEvent, Rc<Deck>)>,
  a_style: HtmlStyle,
  button_style: HtmlStyle,
}

impl Default for ChooseDeckState {
  fn default() -> Self {
    ChooseDeckState {
      stored_decks: Default::default(),
      static_decks: load_static_decks(),
      remove_deck_clicked: Callback::new(|(state, i): (&State<ChooseDeckState>, usize)| {
        remove_deck(i);
        state.set(ChooseDeckState { stored_decks: load_stored_decks(), ..state.value() });
      }),
      choose_deck_clicked: Callback::new(|(props, e, deck): (ChooseDeckProps, HtmlEvent, Rc<Deck>)| {
        e.prevent_default();
        props.choose_deck.call(deck);
      }),
      a_style: HtmlStyle {
        color: Some("#5959af".to_owned()),
        ..Default::default()
      },
      button_style: HtmlStyle {
        color: Some("red".to_owned()),
        background: Some("transparent".to_owned()),
        border: Some("none".to_owned()),
        cursor: Some("pointer".to_owned()),
        font_size: Some("20px".to_owned()),
        ..Default::default()
      },
    }
  }
}

struct ChooseDeck;

impl ComponentConfig<ChooseDeckProps, ChooseDeckState> for ChooseDeck {
  fn name() -> String { "ChooseDeck".into() }
  fn render(_component: &Component<ChooseDeckProps, ChooseDeckState>) -> Vec<AnyComponent> {
    // jazz_component!(component);
    // jazz_imports! {  }
    // jazz_template! {
    //   <table>
    //     @foreach {deck in static_decks} {
    //       <tr>
    //         <td><button style={{...button_style, visibility: "hidden"}}>&times;</button></td>
    //         <td><a href="" style={a_style} events={{click: e => choose_deck_clicked($props, e, deck)}}>{deck.name}</a></td>
    //       </tr>
    //     }
    //     @foreach {deck, i in stored_decks} {
    //       <tr>
    //         <td><button style={button_style} events={{click: () => remove_deck_clicked($state, i)}}>&times;</button></td>
    //         <td><a href="" style={a_style} events={{click: e => choose_deck_clicked($props, e, deck)}}>{deck.name}</a></td>
    //       </tr>
    //     }
    //   </table>
    // }
    Vec::new()
  }
  fn on_inserted(component: &Component<ChooseDeckProps, ChooseDeckState>) {
    let ChooseDeckProps { deck_index, choose_deck } = component.props();
    let state = component.state();
    let stored_decks = load_stored_decks();
    let static_decks = state.value().static_decks;
    state.set(ChooseDeckState { stored_decks: load_stored_decks(), ..state.value() });
    if let Some(deck_index) = deck_index {
      if deck_index < static_decks.len() {
        choose_deck.call(static_decks.index(deck_index));
      } else if deck_index - static_decks.len() < stored_decks.len() {
        choose_deck.call(stored_decks.index(deck_index - static_decks.len()));
      }
    }
  }
}


fn main() {
  println!("Hello, world!");
}
