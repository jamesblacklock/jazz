import jazz, { useState } from "@dragonpop/jazz";
import { FlashCards } from "./app/app";

export type Card = { front: string, back: string };
export type Deck = { name: string, cards: Card[], stored?: boolean };

import LiquorDeck from "./decks/liquor";
import SpanishAnimalsDeck from "./decks/spanish/animals";
import SpanishBodyDeck from "./decks/spanish/body";
import SpanishBasicsDeck from "./decks/spanish/basics";
import SpanishBusinessDeck from "./decks/spanish/business";
import SpanishCityDeck from "./decks/spanish/city";
import SpanishDevicesDeck from "./decks/spanish/devices";
import SpanishFoodDeck from "./decks/spanish/food";
import SpanishHouseDeck from "./decks/spanish/house";
import SpanishTransportationDeck from "./decks/spanish/transportation";

const TestDeck = {
  name: "test",
  cards: [{ front: "a", back: "A" }, { front: "b", back: "B" }, { front: "c", back: "C" }]
};

const DECKS: Deck[] = [
  // TestDeck,
  LiquorDeck,
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
  storedDecks.push({ name, cards, stored: true });
  localStorage.setItem("savedDecks", JSON.stringify(storedDecks));
}

function removeDeck(i: number) {
  const storedDecks = loadStoredDecks();
  storedDecks.splice(i, 1);
  localStorage.setItem("savedDecks", JSON.stringify(storedDecks));
}

function ChooseDeck({ deckIndex, chooseDeck }: { deckIndex: number, chooseDeck: (deck: Deck) => void }) {
  const [storedDecks, setStoredDecks] = useState<Deck[]>(loadStoredDecks);
  const removeDeckClicked = (i: number) => {
    removeDeck(i);
    setStoredDecks(loadStoredDecks());
  }
  if (!isNaN(deckIndex) && deckIndex >= 0) {
    if (deckIndex < DECKS.length) {
      chooseDeck(DECKS[deckIndex]);
      return;
    } else if (deckIndex - DECKS.length < storedDecks.length) {
      chooseDeck(storedDecks[deckIndex - DECKS.length]);
      return;
    }
  }
  const chooseDeckClicked = (e: Event, deck: Deck) => {
    e.preventDefault();
    chooseDeck(deck);
  };
  const aStyle = {color: "#5959af"};
  const buttonStyle = {
    color: "red",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "20px",
  };
  return (
    <table>
      {DECKS.map((deck, i) => (
        <tr key={i}>
          <td><button style={{ ...buttonStyle, visibility: "hidden" }}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked(e, deck)}}>{deck.name}</a></td>
        </tr>
      ))}
      {storedDecks.map((deck, i) => (
        <tr key={i}>
          <td><button style={buttonStyle} events={{click: () => removeDeckClicked(i)}}>&times;</button></td>
          <td><a href="" style={aStyle} events={{click: e => chooseDeckClicked(e, deck)}}>{deck.name}</a></td>
        </tr>
      ))}
    </table>
  );
}

function App() {
  const [deckIndex, setDeckIndex] = useState(() => parseInt(new URLSearchParams(location.search).get('deck') ?? ""));
  setDeckIndex(NaN);
  const [deck, setDeck] = useState<Deck | null>(null);
  if (deck) {
    return (
      <FlashCards
        cards={deck.cards}
        name={deck.name}
        chooseDeck={() => setDeck(null)}
        saveDeck={saveDeck}
      />
    );
  }
  return <ChooseDeck deckIndex={deckIndex} chooseDeck={deck => setDeck(deck)}/>
}

jazz.mountComponent(document.body, <App />);
