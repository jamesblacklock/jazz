use std::collections::{HashMap, HashSet, hash_map::Entry};
use std::rc::{Rc, Weak};
use std::cell::{Ref, RefMut, Cell, RefCell};
use std::hash::{Hash, Hasher};

#[derive(Clone)]
struct Binding<P: Clone + Eq, S: Clone + Eq, Output, F: Fn(&P, &S, ()) -> Output> {
  f: Rc<F>,
  args: (P, S, ()),
}

impl <P: Clone + Eq, S: Clone + Eq, Output, F: Fn(&P, &S, ()) -> Output> Binding<P, S, Output, F> {
  fn call(&self) -> Output {
    return (&*self.f)(&self.args.0, &self.args.1, self.args.2);
  }
}

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

impl <P: Clone + Eq, S: Clone + Eq, Output, F: Fn(&P, &S, ()) -> Output> ValueProducer<Output> for Binding<P, S, Output, F> {
  fn get_value(&self) -> Output {
    self.call()
  }
}

struct Props<P: Clone + Eq> {
  value: Rc<RefCell<P>>,
  binding: Option<Box<dyn ValueProducer<P>>>,
}

impl <P: Clone + Eq> Props<P> {
  fn new(props: P) -> Self {
    Self {
      value: Rc::new(RefCell::new(props)),
      binding: None,
    }
  }
  fn update(&mut self, new_value: Option<P>) -> bool {
    if let Some(props) = new_value.or_else(|| self.binding.as_ref().map(|b| ValueProducer::get_value(b.as_ref()))) {
      if *self.value.borrow() != props {
        self.value.replace(props);
        return true;
      }
    }
    return false;
  }
  fn value(&self) -> P {
    self.value.borrow().clone()
  }
}

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
struct ComponentId(u32);

struct State<P: Clone + Eq + Default> {
  props: Props<P>,
  next_value: Cell<Option<P>>,
  component: RefCell<AnyComponentWeak>,
}

impl <P: Clone + Eq + Default> State<P> {
  fn new(value: P) -> Self {
    State {
      props: Props::new(value),
      next_value: Cell::new(None),
      component: RefCell::new(AnyComponentWeak::new_empty()),
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
    // if (this.frame === null) {
    //   this.frame = requestAnimationFrame(() => {
    //     this.frame = null;
    //     if (this.nextValue) {
    //       this.component.update(undefined, this.nextValue);
    //       this.nextValue = null;
    //     }
    //   });
    // }
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
  binding_counter: u32,
  component_map: HashMap<ComponentId, AnyComponent>,
  // binding_map: HashMap<ComponentId, ComponentId>,
  render_options: RenderOptions,
}

impl ComponentSystem {
  fn new() -> Self {
    ComponentSystem {
      id_counter: 0,
      binding_counter: 0,
      component_map: HashMap::new(),
      // binding_map: HashMap::new(),
      render_options: Default::default(),
    }
  }
  fn next_id(&mut self) -> ComponentId {
    let id = ComponentId(self.id_counter);
    self.id_counter += 1;
    return id;
  }
  fn create_component<
    P: 'static + Clone + Eq + Default,
    S: 'static + Clone + Eq + Default,
    Config: 'static + ComponentConfig<P, S>,
  >(&mut self, config: Config) -> Component<P> {
    let id = self.next_id();
    let component = ComponentImpl::new(id, config, Default::default());
    self.component_map.insert(id, component.any());
    component
  }
  fn create_text_component<S: Into<String>>(&mut self, text_content: S) -> Component<String> {
    let id = self.next_id();
    let component = ComponentImpl::new_with_type(id, HtmlTextComponent, text_content.into(), ComponentType::Text(TextData { dom_node: HtmlTextNode }));
    self.component_map.insert(id, component.any());
    component
  }
  fn create_html_component<
    P: 'static + Clone + Eq + Default,
    S: 'static + Clone + Eq + Default,
    Config: 'static + ComponentConfig<P, S>,
    IntoString: Into<String>,
  >(&mut self, tag: IntoString, config: Config) -> Component<String> {
    let id = self.next_id();
    let component = ComponentImpl::new_with_type(
      id,
      HtmlTextComponent,
      Default::default(),
      ComponentType::Html(HtmlData {
        tag: tag.into(),
        dom_node: HtmlElement,
        attached_events: Default::default(),
        saved_style: Default::default(),
      }),
    );
    self.component_map.insert(id, component.any());
    component
  }
}

trait ComponentConfig<P: 'static + Clone + Eq + Default, S: 'static + Clone + Eq + Default> {
  fn name() -> String;
  fn render(_props: P, _state: &State<S>) -> Vec<AnyComponent> { Vec::new() }
  fn on_created(_props: P, _state: &State<S>) {}
  fn on_inserted(_props: P, _state: &State<S>) {}
  fn on_updated(_props: P, _state: &State<S>, _prev_props: P, _prev_state: S) {}
  fn on_removed(_props: P, _state: &State<S>) {}
  fn on_deleted(_props: P, _state: &State<S>) {}
}

struct TextData {
  dom_node: HtmlTextNode,
}

struct HtmlData {
  tag: String,
  dom_node: HtmlElement,
  attached_events: HtmlEventsMap,
  saved_style: HtmlStyle,
}

struct IfData {
  else_children: HashSet<ComponentId>,
//   visibilityChanged(component: IfComponent) {
//     for (const child of component.children) {
//       child.setVisible(component.visible && component.props.value.cond !== component.config.data!.elseChildren.has(child.id));
//     }
//   }
}

struct ForeachData {
//   itemName,
//   indexName,
//   context: { init: false, bindings: {} },
//   componentContext: componentContext.id,
//   items: [] as T[],
}

struct ForeachItemData {
//   context: cloneForeachContext(foreachContext, itemName, index),
//   componentContext: componentContext.id,
//   itemName,
}

enum ComponentType {
  Component,
  Foreach(IfData),
  If(ForeachData),
  Text(TextData),
  Html(HtmlData),
  ForeachItem(ForeachItemData),
}

struct ComponentImpl<P: 'static + Clone + Eq + Default, S: 'static + Clone + Eq + Default, Config: 'static + ComponentConfig<P, S>> {
  name: String,
  id: ComponentId,
  binding_id: Option<ComponentId>,
  component_type: ComponentType,
  props: Props<P>,
  state: State<S>,
  desc: Vec<AnyComponentWeak>,
  children: Vec<AnyComponent>,
  nodes: Option<Vec<AnyComponent>>,
  rc: u32,
  config: Config,
  dom_parent: Option<HtmlElement>,
  // display: { _visible: boolean };
  updating: bool,
  inserted: bool,
}

impl <P: 'static + Clone + Eq + Default, S: 'static + Clone + Eq + Default, Config: 'static + ComponentConfig<P, S>> ComponentImpl<P, S, Config> {
  fn new(id: ComponentId, config: Config, props: P) -> Component<P> {
    Self::new_with_type(id, config, props, ComponentType::Component)
  }
  fn new_with_type(id: ComponentId, config: Config, props: P, component_type: ComponentType) -> Component<P> {
    let mut component = Component(Rc::new(Self {
      state: State::new(Default::default()),
      props: Props::new(props),
      name: Config::name(),
      children: Vec::new(),
      desc: Vec::new(),
      dom_parent: None,
      binding_id: None,
      updating: false,
      inserted: false,
      component_type,
      nodes: None,
      config,
      rc: 0,
      id,
    }));
    component.set_state_component(component.weak());
    component.on_created();
    component
  }
  fn update(&self, new_props: Option<P>) -> bool {
    false
  }
}

trait AnyComponentImplTrait {}

trait ComponentImplTrait<P: Clone + Eq + Default>: AnyComponentImplTrait {
  fn update(&self, props: P);
  fn set_state_component(&self, weak: AnyComponentWeak);
  fn on_created(&self);
}

impl <P: 'static + Clone + Eq + Default, S: 'static + Clone + Eq + Default, Config: 'static + ComponentConfig<P, S>> AnyComponentImplTrait for ComponentImpl<P, S, Config>{}

impl <P: 'static + Clone + Eq + Default, S: 'static + Clone + Eq + Default, Config: 'static + ComponentConfig<P, S>> ComponentImplTrait<P> for ComponentImpl<P, S, Config> {
  fn update(&self, props: P) {
    self.update(Some(props));
  }
  fn set_state_component(&self, weak: AnyComponentWeak) {
    self.state.component.replace(weak);
  }
  fn on_created(&self) {
    Config::on_created(self.props.value(), &self.state);
  }
}

#[derive(Clone)]
struct Component<P: 'static + Clone + Eq + Default>(Rc<dyn ComponentImplTrait<P>>);

impl <P: 'static + Clone + Eq + Default> Component<P> {
  fn any(&self) -> AnyComponent {
    AnyComponent(self.0.clone())
  }
  fn weak(&self) -> AnyComponentWeak {
    self.any().weak()
  }
  fn set_state_component(&self, weak: AnyComponentWeak) {
    self.0.set_state_component(weak);
  }
  fn on_created(&self) {
    self.0.on_created();
  }
}

struct AnyComponent(Rc<dyn AnyComponentImplTrait>);

impl AnyComponent {
  fn weak(&self) -> AnyComponentWeak {
    AnyComponentWeak(Some(Rc::downgrade(&self.0)))
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

struct HtmlElement;
struct HtmlTextNode;

struct HtmlEvent;

impl HtmlEvent {
  fn prevent_default(&self) {}
}

#[derive(Clone, PartialEq, Eq, Default)]
struct HtmlEventsMap {
  click: Callback<HtmlEvent>,
}

#[derive(Clone, PartialEq, Eq, Default)]
struct HtmlStyle {
  color: String,
  background: String,
  border: String,
  cursor: String,
  font_size: String,
}

struct HtmlTextComponent;

impl ComponentConfig<String, ()> for HtmlTextComponent {
  fn name() -> String { "text".into() }
}

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
        color: "#5959af".to_owned(),
        ..Default::default()
      },
      button_style: HtmlStyle {
        color: "red".to_owned(),
        background: "transparent".to_owned(),
        border: "none".to_owned(),
        cursor: "pointer".to_owned(),
        font_size: "20px".to_owned(),
        ..Default::default()
      },
    }
  }
}

struct ChooseDeck;

impl ComponentConfig<ChooseDeckProps, ChooseDeckState> for ChooseDeck {
  fn name() -> String { "ChooseDeck".into() }
  fn render(_props: ChooseDeckProps, _state: &State<ChooseDeckState>) -> Vec<AnyComponent> {
    // jazz! {
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
  fn on_inserted(props: ChooseDeckProps, state: &State<ChooseDeckState>) {
    let ChooseDeckProps { deck_index, choose_deck } = props;
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
