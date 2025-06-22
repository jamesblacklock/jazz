import jazz, { Component } from "@dragonpop/jazz";
import { Card } from "../index";

type SaveAnswersProps = {
  cards: Card[];
  name: string;
  saveDeck: ((name: string, cards: Card[]) => void);
  close: (() => void);
}

type SaveAnswersState = {
  inputValue: string;
  save: () => void;
};

class SaveAnswers extends Component<SaveAnswersProps, SaveAnswersState> {
  constructor() {
    const state = {
      inputValue: "",
      save: () => {
        this.props.value.saveDeck!(this.state.value.inputValue, this.props.value.cards);
        this.props.value.close!();
      },
    };
    super({ cards: [], name: "", saveDeck: () => null, close: () => null }, state);
  }
  onPropsChanged() {
    const d = new Date;
    const month = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "November", "December"][d.getMonth()];
    this.state.set.inputValue(`${this.props.value.name} – Missed (${month} ${d.getDate()})`);
  }

  template = /*jsx*/`
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
        // {createPortal("test", document.body)}
        <div>
          <input
            style={{width: "300px"}}
            value={inputValue}
            events={{ change: e => $state.set.inputValue(e.target.value) }}
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
  `
}

type FlashCardsProps = {
  cards: Card[];
  name: string;
  chooseDeck: (() => void);
  saveDeck: ((name: string, cards: Card[]) => void);
}

type FlashCardsState = {
  nextRoundCards: Card[];
  currentCards: Card[];
  phase: "front"|"back"|"done";
  index: number;
  showSaveModal: boolean;
  reset: (startOver?: boolean) => () => void;
  back: () => void;
  next: (incorrect?: boolean) => () => void;
};

export class FlashCards extends Component<FlashCardsProps, FlashCardsState> {
  constructor() {
    const state: FlashCardsState = {
      nextRoundCards: [],
      currentCards: [],
      phase: "front",
      index: 0,
      showSaveModal: false,
      reset: (startOver?: boolean) => () => {
        const nextCards = (startOver || this.state.value.nextRoundCards.length < 1) ? [...this.props.value.cards] : this.state.value.nextRoundCards;
        this.state.set.currentCards(nextCards.sort(() => Math.random() - 0.5));
        this.state.set.nextRoundCards([]);
        this.state.set.phase("front");
        this.state.set.index(0);
      },
      back: () => {
        if (this.state.value.phase === "back") {
          this.state.set.phase("front");
          return;
        }
        this.state.set.index(this.state.value.index - 1);
        if (this.state.value.index > 0
          && this.state.value.nextRoundCards.length > 0
          && this.state.value.nextRoundCards[this.state.value.nextRoundCards.length - 1].front === this.state.value.currentCards[this.state.value.index - 1].front
        ) {
          this.state.value.nextRoundCards.pop();
          this.state.set.nextRoundCards([...this.state.value.nextRoundCards]/*, { dirty: true }*/);
        }
      },
      next: (incorrect?: boolean) => () => {
        if (this.state.value.phase === "front") {
          this.state.set.phase("back");
          return;
        }
        if (incorrect) {
          this.state.value.nextRoundCards.push(this.state.value.currentCards[this.state.value.index]);
          this.state.set.nextRoundCards([...this.state.value.nextRoundCards]/*, { dirty: true }*/);
        }
        if (this.state.value.index + 1 < this.state.value.currentCards.length) {
          this.state.set.phase("front");
          this.state.set.index(this.state.value.index + 1);
        } else {
          this.state.set.phase("done");
        }
      },
    };
    super({ cards: [], name: "", chooseDeck: () => null, saveDeck: () => null}, state);
  }

  onPropsChanged() {
    this.state.value.reset()();
  }
  imports = { SaveAnswers };
  template = /*jsx*/`
    <button events={{click: chooseDeck}}>Choose Deck</button>
    <button events={{click: () => $state.set.showSaveModal(true)}}>Save Missed Answers</button>
    <h2>{name}</h2>
    <div>{phase === "done" ? "Round over" : ${"`${index + 1} / ${cards.length} cards`"}}</div>
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
      {phase === "done" ? ${"`You missed ${nextRoundCards.length}`"} : cards[index]?.[phase] ?? ""}
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      @if {phase === "front"} {
        @if {index > 0} {
          <button events={{click: back}}>&lt;</button>
        }
        <button events={{click: next()}}>Flip Card</button>
      } @elseif {phase === "back"} {
        <button events={{click: back}}>&lt;</button>
        <button events={{click: next()}}>Correct</button>
        <button events={{click: next(true)}}>Incorrect</button>
      } @else {
        <button events={{click: reset(true)}}>Start Over</button>
        @if {nextRoundCards.length > 0} {
          <button events={{click: reset()}}>Keep Going</button>
        }
      }
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
        @foreach {e in nextRoundCards} {
          <tr>
            <td style={{padding: "0 12px"}}>{e.front}</td>
            <td style={{padding: "0 12px"}}>{e.back}</td>
          </tr>
        }
      </table>
    </div>
    @if {showSaveModal} {
      <SaveAnswers
        name={name}
        cards={nextRoundCards}
        saveDeck={saveDeck}
        close={() => $state.set.showSaveModal(false)}
      />
    }
  `
}
