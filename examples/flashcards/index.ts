import jazz, { Component, StyleMap, /*State */ } from "@dragonpop/jazz";
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

type ChooseDeckState = {
  storedDecks: Deck[];
  staticDecks: Deck[];
  removeDeckClicked: (i: number) => void;
  chooseDeckClicked: (e: Event, deck: Deck) => void;
  aStyle: StyleMap;
  buttonStyle: StyleMap;
};

class ChooseDeck extends Component<{ deckIndex: number | null, chooseDeck: ((deck: Deck) => void) }, ChooseDeckState> {
  constructor() {
    const state = {
      storedDecks: [],
      staticDecks: DECKS,
      removeDeckClicked: (i: number) => {
        removeDeck(i);
        this.state.set.storedDecks(loadStoredDecks());
      },
      chooseDeckClicked: (e: Event, deck: Deck) => {
        e.preventDefault();
        this.props.value.chooseDeck!(deck);
      },
      aStyle: { color: "#5959af" },
      buttonStyle: {
        color: "red",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: "20px",
      },
    };
    super({ deckIndex: null, chooseDeck: () => null }, state);
  }
  onPropsChanged() {
    const { deckIndex, chooseDeck } = this.props.value;
    const storedDecks = loadStoredDecks();
    this.state.set.storedDecks(storedDecks);
    if (deckIndex !== null && deckIndex >= 0) {
      if (deckIndex < DECKS.length) {
        chooseDeck!(DECKS[deckIndex]);
        return;
      } else if (deckIndex - DECKS.length < storedDecks.length) {
        chooseDeck!(storedDecks[deckIndex - DECKS.length]);
        return;
      }
    }
  }
  template = /*jsx*/`
    <table>
      @foreach {deck in staticDecks} {
        <tr>
          <td><button style={{ ...buttonStyle, visibility: "hidden" }}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked(e, deck)}}>{deck.name}</a></td>
        </tr>
      }
      @foreach {deck, i in storedDecks} {
        <tr>
          <td><button style={buttonStyle} events={{ click: () => removeDeckClicked(i) }}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked(e, deck)}}>{deck.name}</a></td>
        </tr>
      }
    </table>
  `
}

type AppState = {
  deckIndex: number | null;
  deck: Deck | null;
  saveDeck: (name: string, cards: Card[]) => void;
}

class App extends Component<{}, AppState> {
  constructor() {
    super({}, { deckIndex: null, deck: null, saveDeck });
  }
  imports = { ChooseDeck, FlashCards }
  template = /*jsx*/`
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
  `;
}

(window as any).App = new App();
jazz.mountComponent(document.body, (window as any).App);
