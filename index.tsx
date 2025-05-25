import renderUI, { State } from "./app/renderUI";
import { FlashCards } from "./app/app";

export type Card = { front: string, back: string };
export type Deck = { name: string, cards: Card[], stored?: boolean };

const DECKS: Deck[] = [
  {
    name: "test",
    cards: [{ front: "a", back: "A" }, { front: "b", back: "B" }, { front: "c", back: "C" }]
  },
  {
    name: "Liquor Call Brands",
    cards: [
      { front: "Absolut", back: "Vodka" },
      { front: "Absolut Citron", back: "Vodka" },
      { front: "Angels Envy", back: "Bourbon" },
      { front: "Bacardo/Cruzan 151", back: "Rum" },
      { front: "Bacardi", back: "Rum" },
      { front: "Basil Hayden's", back: "Bourbon" },
      { front: "Beefeaters", back: "Gin" },
      { front: "Belvedere", back: "Vodka" },
      { front: "Blanton's", back: "Bourbon" },
      { front: "Bombay", back: "Gin" },
      { front: "Bombay Sapphire", back: "Gin" },
      { front: "Booker's", back: "Bourbon" },
      { front: "Buffalo Trace", back: "Bourbon" },
      { front: "Bulleit", back: "Bourbon" },
      { front: "Bushmills", back: "Irish Whiskey" },
      { front: "Canadian Club", back: "Canadian Whiskey" },
      { front: "Canadian Mist", back: "Canadian Whiskey" },
      { front: "Captain Morgan", back: "Rum" },
      { front: "Casamigos", back: "Tequila" },
      { front: "Chivas Regal", back: "Scotch Whiskey" },
      { front: "Ciroc", back: "Vodka" },
      { front: "Courvoisier", back: "Cognac" },
      { front: "Crown Royal", back: "Canadian Whiskey" },
      { front: "Cutty Sark", back: "Scotch Whiskey" },
      { front: "Dewar's White Label", back: "Scotch Whiskey" },
      { front: "Don Julio", back: "Tequila" },
      { front: "Dusse", back: "Cognac" },
      { front: "E&J", back: "Brandy" },
      { front: "Finlandia", back: "Vodka" },
      { front: "Gosling's", back: "Rum" },
      { front: "Grey Goose", back: "Vodka" },
      { front: "Glenfidditch", back: "Scotch Whiskey" },
      { front: "Glenlivet", back: "Scotch Whiskey" },
      { front: "Glenmorangie", back: "Scotch Whiskey" },
      { front: "Hennessy", back: "Cognac" },
      { front: "Hendrick's", back: "Gin" },
      { front: "Herradura", back: "Tequila" },
      { front: "Hornito's", back: "Tequila" },
      { front: "J&B", back: "Scotch Whiskey" },
      { front: "Jack Daniels", back: "American Whiskey" },
      { front: "Jameson", back: "Irish Whiskey" },
      { front: "Jim Beam", back: "Bourbon" },
      { front: "Johnnie Walker Red", back: "Scotch Whiskey" },
      { front: "Johnnie Walker Black", back: "Scotch Whiskey" },
      { front: "José Cuervo 1800", back: "Tequila" },
      { front: "José Cuervo Especial Gold", back: "Tequila" },
      { front: "Ketel One", back: "Vodka" },
      { front: "Knob Creek", back: "Bourbon" },
      { front: "Maker's Mark", back: "Bourbon" },
      { front: "Macallan", back: "Scotch Whiskey" },
      { front: "Milagro", back: "Tequila" },
      { front: "Mt. Gay", back: "Rum" },
      { front: "Myers", back: "Rum" },
      { front: "Oban", back: "Scotch Whiskey" },
      { front: "Pappy Van Winkle", back: "Bourbon" },
      { front: "Patron", back: "Tequila" },
      { front: "Plymouth", back: "Gin" },
      { front: "Remy Martin", back: "Cognac" },
      { front: "Sauza", back: "Tequila" },
      { front: "Seagram's 7", back: "American Whiskey" },
      { front: "Seagram's V.O.", back: "Canadian Whiskey" },
      { front: "Skyy", back: "Vodka" },
      { front: "Smirnoff", back: "Vodka" },
      { front: "Southern Comfort", back: "Fruits & Herbs" },
      { front: "Stolichnaya", back: "Vodka" },
      { front: "Svedka", back: "Vodka" },
      { front: "Tanqueray", back: "Gin" },
      { front: "Tito's", back: "Vodka" },
      { front: "Woodford Reserve", back: "Bourbon" },
      { front: "Whistle Pig", back: "Bourbon" },
      { front: "Wild Turkey 101", back: "Bourbon" },
      { front: "Amaretto", back: "Almond" },
      { front: "Aperol", back: "Bitter Orange" },
      { front: "Bailey's Irish Cream", back: "Chocolate & Vanilla" },
      { front: "Benedictine", back: "Sweet Herbs" },
      { front: "Campari", back: "Bitter Orange" },
      { front: "Chambord", back: "Black Raspberry" },
      { front: "Cointreau", back: "Orange" },
      { front: "Creme de Cassis", back: "Black Currant" },
      { front: "Creme de Cacao", back: "Chocolate" },
      { front: "Creme de Menthe", back: "Mint" },
      { front: "Blue Cucaçao", back: "Orange" },
      { front: "Disaronno", back: "Almond" },
      { front: "Drambuie", back: "Honey" },
      { front: "Fireball", back: "Cinnamon" },
      { front: "Frangelico", back: "Hazelnut" },
      { front: "Galliano", back: "Vanilla & Licorice" },
      { front: "Goldschlager", back: "Cinnamon" },
      { front: "Grand Marnier", back: "Burnt Orange" },
      { front: "Hpnotiq", back: "Tropical Fruits" },
      { front: "Jägermeister", back: "Licorice/Herbs" },
      { front: "Kahlua", back: "Coffee" },
      { front: "Malibu", back: "Coconut" },
      { front: "Midori", back: "Honeydew Melon" },
      { front: "Pama", back: "Pomegranate" },
      { front: "Rumple Minze", back: "Mint" },
      { front: "Sambuca", back: "Licorice" },
      { front: "Sloe Gin", back: "Plum" },
      { front: "St. Germain", back: "Elderflower" },
      { front: "Triple Sec", back: "Orange" },
    ],
  },
  {
    name: "Spanish Words: Animals",
    cards: [
      { front: "fox", back: "el zorro" },
      { front: "mosquito", back: "el mosquito" },
      { front: "dragonfly", back: "la libélula" },
      { front: "wolf", back: "el lobo" },
      { front: "crab", back: "el cangrejo" },
      { front: "horse", back: "el caballo" },
      { front: "squid", back: "el calamar" },
      { front: "bug", back: "el escarabajo" },
      { front: "duck", back: "el pato" },
      { front: "sheep", back: "la oveja" },
      { front: "whale", back: "la ballena" },
      { front: "owl", back: "el búho" },
      { front: "koala", back: "el koala" },
      { front: "polar bear", back: "el oso polar" },
      { front: "shark", back: "el tiburón" },
      { front: "crocodile", back: "el cocodrilo" },
      { front: "raven", back: "el cuervo" },
      { front: "bat", back: "el murciélago" },
      { front: "penguin", back: "el pingüino" },
      { front: "fish (animal)", back: "el pez" },
      { front: "fly", back: "la mosca" },
      { front: "snail", back: "el caracol" },
      { front: "monkey", back: "el mono" },
      { front: "caterpillar", back: "la oruga" },
      { front: "dinosaur", back: "el dinosaurio" },
      { front: "seagull", back: "la gaviota" },
      { front: "dolphin", back: "el delfín" },
      { front: "panda", back: "el panda" },
      { front: "octopus", back: "el pulpo" },
      { front: "cat", back: "el gato" },
      { front: "seal", back: "la foca" },
      { front: "tortoise", back: "la tortuga" },
      { front: "pigeon", back: "la paloma" },
      { front: "cow", back: "la vaca" },
      { front: "hippo", back: "el hipopótamo" },
      { front: "mouse (animal)", back: "el ratón" },
      { front: "chicken (animal)", back: "el pollo" },
      { front: "bear", back: "el oso" },
      { front: "butterfly", back: "la mariposa" },
      { front: "swan", back: "el cisne" },
      { front: "giraffe", back: "la jirafa" },
      { front: "ant", back: "la hormiga" },
      { front: "jellyfish", back: "la medusa" },
      { front: "pig", back: "el cerdo" },
      { front: "frog", back: "la rana" },
      { front: "dog", back: "el perro" },
      { front: "rabbit", back: "el conejo" },
      { front: "sea horse", back: "el caballito de mar" },
      { front: "snake", back: "la serpiente" },
      { front: "kangaroo", back: "el canguro" },
      { front: "spider", back: "la araña" },
      { front: "donkey", back: "el burro" },
      { front: "parrot", back: "el loro" },
      { front: "lion", back: "el león" },
      { front: "elephant", back: "el elefante" },
      { front: "tiger", back: "el tigre" },
      { front: "bee", back: "la abeja" },
    ],
  },
  {
    name: "Spanish Words: Body Parts",
    cards: [
      { front: "vertebra", back: "(la) vértebra" },
      { front: "testicle", back: "(el) testículo" },
      { front: "neck", back: "(el) cuello" },
      { front: "bladder", back: "(la) vejiga" },
      { front: "vagina", back: "(la) vagina" },
      { front: "liver", back: "(el) hígado" },
      { front: "lung", back: "(el) pulmón" },
      { front: "kidney", back: "(el) riñón" },
      { front: "rib", back: "(la) costilla" },
      { front: "eye", back: "(el) ojo" },
      { front: "leg", back: "(la) pierna" },
      { front: "tongue", back: "(la) lengua" },
      { front: "nerve", back: "(el) nervio" },
      { front: "cheek", back: "(la) mejilla" },
      { front: "finger", back: "(el) dedo" },
      { front: "mouth", back: "(la) boca" },
      { front: "intestine", back: "(el) intestino" },
      { front: "shoulder", back: "(el) hombro" },
      { front: "heart", back: "(el) corazón" },
      { front: "back (part of body)", back: "(la) espalda" },
      { front: "index finger", back: "(el) dedo índice" },
      { front: "bosom", back: "(la) mama" },
      { front: "fingernail", back: "(la) uña" },
      { front: "beard", back: "(la) barba" },
      { front: "head", back: "(la) cabeza" },
      { front: "hand", back: "(la) mano" },
      { front: "nose", back: "(la) nariz" },
      { front: "arm", back: "(el) brazo" },
      { front: "hair", back: "(el) cabello" },
      { front: "forehead", back: "(la) frente" },
      { front: "vein", back: "(la) vena" },
      { front: "little finger", back: "(el) dedo meñique" },
      { front: "chin", back: "(la) barbilla" },
      { front: "lip", back: "(el) labio" },
      { front: "thumb", back: "(el) pulgar" },
      { front: "stomach", back: "(el) estómago" },
      { front: "belly", back: "(el) vientre" },
      { front: "tooth", back: "(el) diente" },
      { front: "skeleton", back: "(el) esqueleto" },
      { front: "penis", back: "(el) pene" },
      { front: "ring finger", back: "(el) dedo anular" },
      { front: "brain", back: "(el) cerebro" },
      { front: "bottom", back: "(el) trasero" },
      { front: "sperm", back: "(el) esperma" },
      { front: "middle finger", back: "(el) dedo del medio" },
      { front: "ear", back: "(la) oreja" },
      { front: "knee", back: "(la) rodilla" },
      { front: "artery", back: "(la) arteria" },
      { front: "bone (part of body)", back: "(el) hueso" },
      { front: "spine", back: "(la) espina dorsal" },
      { front: "heel", back: "(el) talón" },
      { front: "foot", back: "(el) pie" },
      { front: "muscle", back: "(el) músculo" },
      { front: "toe", back: "(el) dedo del pie" },
    ],
  },
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

function ChooseDeck({ deckIndex, chooseDeck }: { deckIndex: number, chooseDeck: (deck: Deck) => void }, state: State) {
  const [storedDecks, setStoredDecks] = state.use<Deck[]>("decks", loadStoredDecks);
  const removeDeckClicked = (i: number) => {
    removeDeck(i);
    setStoredDecks(loadStoredDecks());
  }
  state.useEffect("effect", () => {
    console.log("in");
    return () => console.log("out");
  }, [])
  if (!isNaN(deckIndex) && deckIndex >= 0) {
    if (deckIndex < DECKS.length) {
      chooseDeck(DECKS[deckIndex]);
      return;
    } else if (deckIndex - DECKS.length < storedDecks.length) {
      chooseDeck(storedDecks[deckIndex - DECKS.length]);
      return;
    }
  }
  return (
    <>
      <ul>
        <li><a href="https://google.com" target="_blank"><p>hello</p></a></li>
        <li><a href="https://google.com" target="_blank"><p>hello</p></a></li>
        <li><a href="https://google.com" target="_blank"><p>hello</p></a></li>
      </ul>
      {DECKS.map((deck, i) => (
        <div key={i}>
          <button events={{click: () => chooseDeck(deck)}}>{deck.name}</button>
        </div>
      ))}
      {storedDecks.map((deck, i) => (
        <div key={i}>
          <button events={{click: () => removeDeckClicked(i)}}>&times;</button>
          <button events={{click: () => chooseDeck(deck)}}>{deck.name}</button>
        </div>
      ))}
    </>
  );
}

function App(props: any, state: State) {
  const [deckIndex, setDeckIndex] = state.use("deckIndex", () => parseInt(new URLSearchParams(location.search).get('deck') ?? ""));
  setDeckIndex(NaN);
  const [deck, setDeck] = state.use<Deck | null>("deck", null);
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

renderUI(document.body, <App />);
