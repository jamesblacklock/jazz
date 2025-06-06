import jazz, { createPortal, useEffect, useState } from "@dragonpop/jazz";
import { Card } from "../index";

type SaveAnswersProps = {
  cards: Card[];
  name: string;
  saveDeck: (name: string, cards: Card[]) => void;
  close: () => void;
}

function SaveAnswers({ name, cards, saveDeck, close }: SaveAnswersProps) {
  const [inputValue, setInputValue] = useState(() => {
    const d = new Date;
    const month = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "November", "December"][d.getMonth()];
    return `${name} – Missed (${month} ${d.getDate()})`;
  });

  const save = () => {
    saveDeck(inputValue, cards);
    close();
  }

  return (
    <div
      style={{
        position: "fixed",
        left: "0",
        right: "0",
        top: "0",
        bottom: "0",
        background: "#0005",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div style={{ margin: "auto", padding: "24px", background: "white" }}>
        <h3>Save Missed Answers</h3>
        {createPortal("test", document.body)}
        <div>
          <input
            style={{width: "300px"}}
            value={inputValue}
            events={{ change: e => setInputValue(e.target.value) }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            paddingTop: "24px",
          }}
        >
          <button events={{ click: close }}>Cancel</button>
          <button events={{ click: save }}>Save</button>
        </div>
      </div>
    </div>
  );
}

type FlashCardsProps = {
  cards: Card[];
  name: string;
  chooseDeck: () => void;
  saveDeck: (name: string, cards: Card[]) => void;
}

export function FlashCards({ cards: cardsProp, name, chooseDeck, saveDeck }: FlashCardsProps) {
  const [nextRoundCards, setNextRoundCards] = useState<Card[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [phase, setPhase] = useState<"front"|"back"|"done">("front");
  const [index, setIndex] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const reset = (startOver?: boolean) => () => {
    const nextCards = (startOver || nextRoundCards.length < 1) ? [...cardsProp] : nextRoundCards;
    setCards(nextCards.sort(() => Math.random() - 0.5));
    setNextRoundCards([]);
    setPhase("front");
    setIndex(0);
  };

  useEffect(reset(true), []);

  const back = () => {
    if (phase === "back") {
      setPhase("front");
      return;
    }
    setIndex(index - 1);
    if (index > 0
      && nextRoundCards.length > 0
      && nextRoundCards[nextRoundCards.length - 1].front === cards[index - 1].front
    ) {
      nextRoundCards.pop();
      setNextRoundCards(nextRoundCards, { dirty: true });
    }
  };
  const next = (incorrect?: boolean) => () => {
    if (phase === "front") {
      setPhase("back");
      return;
    }
    if (incorrect) {
      nextRoundCards.push(cards[index]);
      setNextRoundCards(nextRoundCards, { dirty: true });
    }
    if (index + 1 < cards.length) {
      setPhase("front");
      setIndex(index + 1);
    } else {
      setPhase("done");
    }
  };

  return (
    <>
      <button events={{click: chooseDeck}}>Choose Deck</button>
      <button events={{click: () => setShowSaveModal(true)}}>Save Missed Answers</button>
      <h2>{name}</h2>
      <div>{phase === "done" ? "Round over" : `${index + 1} / ${cards.length} cards`}</div>
      <div
        style={{
          border: "1px solid #aaa",
          borderRadius: "8px",
          width: "3in",
          height: "2in",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {phase === "done" ? `You missed ${nextRoundCards.length}` : cards[index]?.[phase]}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {phase === "front" ? <>
          {index > 0 && <button events={{click: back}}>&lt;</button>}
          <button events={{click: next()}}>Flip Card</button>
        </> : phase === "back" ? <>
          <button events={{click: back}}>&lt;</button>
          <button events={{click: next()}}>Correct</button>
          <button events={{click: next(true)}}>Incorrect</button>
        </> : /* phase === "done" */ <>
          <button events={{click: reset(true)}}>Start Over</button>
          {nextRoundCards.length > 0 && <button events={{click: reset()}}>Keep Going</button>}
        </>}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <table>
          {nextRoundCards.map((e, i) => (
            <tr key={i}>
              <td style={{padding: "0 12px"}}>{e.front}</td>
              <td style={{padding: "0 12px"}}>{e.back}</td>
            </tr>
          ))}
        </table>
      </div>
      {showSaveModal && (
        <SaveAnswers
          name={name}
          cards={nextRoundCards}
          saveDeck={saveDeck}
          close={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}
