import jazz, {
  Component,
  ComponentConfig,
  State,
  StyleMap,
  System,
  // ConcreteHtmlComponent,
  // Foreach,
  // HtmlComponent,
  // HtmlInputComponent,
  // TextComponent
} from "@dragonpop/jazz";
import { FlashCards } from "./app/app";

export type Card = { front: string, back: string };
export type Deck = { name: string, cards: Card[] };

import SpanishAnimalsDeck from "./decks/spanish/animals";
import SpanishBodyDeck from "./decks/spanish/body";
import SpanishBasicsDeck from "./decks/spanish/basics";
import SpanishBusinessDeck from "./decks/spanish/business";
import SpanishCityDeck from "./decks/spanish/city";
import SpanishDevicesDeck from "./decks/spanish/devices";
import SpanishFoodDeck from "./decks/spanish/food";
import SpanishHouseDeck from "./decks/spanish/house";
import SpanishTransportationDeck from "./decks/spanish/transportation";

const DECKS: Deck[] = [
  { name: "test", cards: [{ front: "a", back: "A" }, { front: "b", back: "B" }, { front: "c", back: "C" }] },
  SpanishAnimalsDeck,
  SpanishBodyDeck,
  SpanishBasicsDeck,
  SpanishBusinessDeck,
  SpanishCityDeck,
  SpanishDevicesDeck,
  SpanishFoodDeck,
  SpanishHouseDeck,
  SpanishTransportationDeck,
];

function loadStoredDecks() {
  const storedDecksJson = localStorage.getItem("savedDecks");
  let storedDecks;
  try {
    storedDecks = JSON.parse(storedDecksJson ?? "") ?? [];
  } catch {
    storedDecks = [];
  }
  return storedDecks;
}

function saveDeck(name: string, cards: Card[]) {
  const storedDecks = loadStoredDecks();
  storedDecks.push({ name, cards });
  localStorage.setItem("savedDecks", JSON.stringify(storedDecks));
}

function removeDeck(i: number) {
  const storedDecks = loadStoredDecks();
  storedDecks.splice(i, 1);
  localStorage.setItem("savedDecks", JSON.stringify(storedDecks));
}

type ChooseDeckProps = { deckIndex: number | null, chooseDeck: ((deck: Deck) => void) };
type ChooseDeckState = {
  storedDecks: Deck[];
  staticDecks: Deck[];
  removeDeckClicked: ($state: State<ChooseDeckState>, i: number) => void;
  chooseDeckClicked: (props: ChooseDeckProps, e: Event, deck: Deck) => void;
  aStyle: StyleMap;
  buttonStyle: StyleMap;
};

const ChooseDeck: ComponentConfig<ChooseDeckProps, ChooseDeckState> = {
  name: "ChooseDeck",
  props: { deckIndex: null, chooseDeck: () => null },
  state: {
    storedDecks: [],
    staticDecks: DECKS,
    removeDeckClicked: ($state: State<ChooseDeckState>, i: number) => {
      removeDeck(i);
      $state.set.storedDecks(loadStoredDecks());
    },
    chooseDeckClicked: ($props: ChooseDeckProps, e: Event, deck: Deck) => {
      e.preventDefault();
      $props.chooseDeck!(deck);
    },
    aStyle: { color: "#5959af" },
    buttonStyle: {
      color: "red",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontSize: "20px",
    },
  },
  onInserted(component) {
    const { deckIndex, chooseDeck } = component.props.value;
    const storedDecks = loadStoredDecks();
    component.state.set.storedDecks(storedDecks);
    if (deckIndex !== null && deckIndex >= 0) {
      if (deckIndex < DECKS.length) {
        chooseDeck(DECKS[deckIndex]);
      } else if (deckIndex - DECKS.length < storedDecks.length) {
        chooseDeck(storedDecks[deckIndex - DECKS.length]);
      }
    }
  },
  template: /*jsx*/`
    <table>
      @foreach {deck in staticDecks} {
        <tr>
          <td><button style={{...buttonStyle, visibility: "hidden"}}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked($props, e, deck)}}>{deck.name}</a></td>
        </tr>
      }
      @foreach {deck, i in storedDecks} {
        <tr>
          <td><button style={buttonStyle} events={{click: () => removeDeckClicked($state, i)}}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked($props, e, deck)}}>{deck.name}</a></td>
        </tr>
      }
    </table>
  `,
};

type AppState = {
  deckIndex: number | null;
  deck: Deck | null;
  saveDeck: (name: string, cards: Card[]) => void;
}

const App: ComponentConfig<{}, AppState> = {
  name: "App",
  props: {},
  state: { deckIndex: null, deck: null, saveDeck },
  imports: { ChooseDeck: () => System.createComponent(ChooseDeck), FlashCards: () => System.createComponent(FlashCards) },
  template: /*jsx*/`
    @if {deck === null} {
      <ChooseDeck deckIndex={deckIndex} chooseDeck={deck => $state.set.deck(deck)}/>
    } @else {
      <FlashCards
        cards={deck.cards}
        name={deck.name}
        chooseDeck={() => $state.set.deck(null)}
        saveDeck={saveDeck}
      />
    }
  `,
  // render() {
  //   const input = Component.newHtmlInputComponent();
  //   const text = Component.newTextComponent("hello, world!");
  //   text.bind(input, (props, state) => ({ textContent: state.value.value }))
  //   const span = Component.newHtmlComponent("span");
  //   span.children = [input, text];
  //   return [span];
  // }
};

(window as any).App = System.createComponent(App);
jazz.mountComponent(document.body, (window as any).App);
