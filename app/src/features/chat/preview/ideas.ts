// What the preview's brainstorm places, where there is no model: ideas from
// a small canned set, the one that suits the topic or the board first,
// leaving out any already on the board. In the app, the model writes them.

import type { BoardView } from "../../../lib/vault/types";
import type { Idea } from "../types";

type Theme = { words: RegExp; ideas: [string, string][] };

const TRAVEL: Theme = {
  words: /\b(trips?|travel\w*|visit\w*|holidays?|vacations?|itinerar\w*|flights?|hotels?|guesthouses?|journey|tour\w*|city|cities|town|beach|coast|seaside)\b/i,
  ideas: [
    ["Book the must-dos first", "Popular tours and restaurants fill up weeks ahead. Book the two or three you would hate to miss, then plan around them."],
    ["Group sights by area", "Put what is close together on the same day, so the trip is spent seeing things rather than getting between them."],
    ["Leave one slow day", "A day with nothing planned makes room for rest, weather and the places you find on the way."],
    ["A budget per day", "Split the budget into a daily amount for food, transport and tickets; it is easier to keep to than one big number."],
    ["Offline maps and tickets", "Download maps, bookings and tickets before you go, so a weak signal never leaves you stuck."],
    ["Check the transport passes", "A day pass or travel card is often cheaper than single tickets for how much you will move around."],
    ["Eat where the locals eat", "Note a few neighbourhood places away from the main sights: cheaper, and often the best food of the trip."],
    ["Pack for the forecast", "Look up the weather a week out and pack for it; one layer too many beats a day spent cold."],
    ["Documents in one place", "Passport, visas, insurance and bookings, with copies in your notes and one on paper."],
    ["A day trip out of town", "One day somewhere smaller nearby shows another side of the place and breaks up the city days."],
    ["Keep arrival day light", "Arrival and departure days are short and tiring; plan little for them, close to where you stay."],
    ["A line a day in the journal", "A few lines each evening about what you saw and ate becomes the best souvenir."],
  ],
};

const RESEARCH: Theme = {
  words: /\b(research\w*|papers?|thesis|study|studies|essays?|articles?|writ\w*|books?|chapters?|literature|experiments?|survey\w*|reading)\b/i,
  ideas: [
    ["The question in one sentence", "If the question does not fit in a sentence, it is two questions. Pick the one that matters most."],
    ["Find the three key papers", "Most fields turn on a few papers. Read those closely before skimming the rest."],
    ["Outline before drafting", "Headings and one line each: the argument shows its gaps before any prose is written."],
    ["Write the abstract first", "A first abstract says what you expect to show; rewrite it at the end to say what you did."],
    ["One figure that tells the story", "Sketch the figure a reader should remember. The text is there to explain it."],
    ["List the assumptions", "Write down what must hold for the results to mean anything, and check the weakest one first."],
    ["Ask for feedback early", "A rough draft read by one person this week beats a polished one read by nobody."],
    ["Keep a decisions log", "Note what you chose and why, with the date. Future you will need it for the methods section."],
    ["A fixed writing hour", "The same hour every day, before email. Small daily progress adds up faster than weekend sprints."],
    ["Plan the evaluation", "Decide how the work will be judged, and on what data, before building more."],
    ["Related work as a table", "Rows for papers, columns for what they do; the gap your work fills becomes visible."],
    ["Cut what does not serve the question", "Keep a parking-lot page for good ideas that belong in another paper."],
  ],
};

const PROJECT: Theme = {
  words: /./,
  ideas: [
    ["Start with the smallest version", "What is the least that would be useful? Make that first and learn from it before adding more."],
    ["Talk to five people", "Ask five people who would use it how they handle this today. Their words make the best plan."],
    ["Name the riskiest assumption", "Write down what must be true for this to work, and test it before anything else."],
    ["Set a date to show something", "A date to show a first version turns a wish into a plan."],
    ["Write down what is out of scope", "A short list of what you will not do keeps the work focused and ends debates early."],
    ["One number to watch", "Pick the single measure that says whether this is working, and look at it every week."],
    ["Run a pre-mortem", "Imagine it failed six months from now. List why, then guard against the top three."],
    ["Borrow what already works", "Find two others who solved something close. Copy what worked; skip what did not."],
    ["A weekly review", "Every Friday: what moved, what is stuck, what is next. Ten minutes keeps a project alive."],
    ["Make the next step obvious", "End each session by writing the very next action, so starting again takes no thought."],
    ["Ask someone who disagrees", "The best critic is a friendly one who thinks you are wrong. Listen for the pattern."],
    ["Budget time as well as money", "Estimate the hours, then double them. Plan the week around that number."],
  ],
};

const THEMES = [TRAVEL, RESEARCH, PROJECT];

/** Up to `count` ideas about `topic` that `board` does not show yet. */
export function cannedIdeas(topic: string, board: Pick<BoardView, "title" | "nodes">, count: number): Idea[] {
  const shown = new Set(board.nodes.flatMap((n) => [n.title, n.label, n.text]).flatMap((t) => (t ? [t.trim().toLowerCase()] : [])));
  const about = `${topic} ${board.title}`;
  const first = THEMES.find((theme) => theme.words.test(about))!;
  return [first, ...THEMES.filter((theme) => theme !== first)]
    .flatMap((theme) => theme.ideas)
    .filter(([title]) => !shown.has(title.toLowerCase()))
    .slice(0, Math.max(0, count))
    .map(([title, text]) => ({ title, text }));
}

/** The new section's label: the topic, shortened, else "Brainstorm" (as the app's command does). */
export function sectionLabel(topic: string): string {
  const words = topic.trim();
  if (!words) return "Brainstorm";
  const chars = [...words];
  return chars.length > 60 ? `${chars.slice(0, 60).join("").trimEnd()}…` : words;
}
