// Page icons: a curated emoji set with search names, in the order of Notion's
// picker. An icon in the frontmatter is an emoji, one of the app's line icons
// (`icon:star`), or the name of an emoji, such as `icon: bulb`.

import { lineIconName } from "../../../ui/glyph";

export interface EmojiGroup {
  title: string;
  /** Each entry is an emoji and its search names. */
  items: readonly (readonly [string, string])[];
}

export const EMOJI: readonly EmojiGroup[] = [
  {
    title: "People",
    items: [
      ["😀", "grinning smile happy"], ["😃", "smiley happy"], ["😄", "smile happy"], ["😁", "grin"], ["😆", "laughing"],
      ["😅", "sweat smile"], ["😂", "joy tears laugh"], ["🙂", "slightly smiling"], ["😉", "wink"], ["😊", "blush"],
      ["😇", "innocent halo"], ["🥰", "love hearts"], ["😍", "heart eyes"], ["🤩", "star struck"], ["😋", "yum"],
      ["😎", "cool sunglasses"], ["🤓", "nerd"], ["🧐", "monocle curious"], ["🤔", "thinking"], ["😐", "neutral"],
      ["😴", "sleeping"], ["🤯", "mind blown"], ["🥳", "party celebrate"], ["😬", "grimacing"], ["😮", "surprised"],
      ["😢", "cry sad"], ["😭", "sob"], ["😤", "triumph"], ["😡", "angry"], ["🤗", "hug"],
      ["👍", "thumbs up yes"], ["👎", "thumbs down no"], ["👏", "clap"], ["🙌", "raised hands"], ["🙏", "pray thanks"],
      ["💪", "muscle strong"], ["👀", "eyes look"], ["🧠", "brain think"], ["👋", "wave hello"], ["✍️", "writing hand"],
      ["🤝", "handshake deal"], ["🧑‍💻", "technologist developer coder"], ["🧑‍🎓", "student graduate"], ["🧑‍🔬", "scientist"],
    ],
  },
  {
    title: "Nature",
    items: [
      ["🌱", "seedling sprout grow"], ["🌿", "herb leaf"], ["🍀", "clover luck"], ["🌵", "cactus"], ["🌲", "evergreen tree"],
      ["🌳", "tree"], ["🌴", "palm tree"], ["🍁", "maple leaf autumn"], ["🌸", "cherry blossom flower"], ["🌻", "sunflower"],
      ["🌹", "rose"], ["🌷", "tulip"], ["🌈", "rainbow"], ["☀️", "sun sunny"], ["🌙", "moon night"],
      ["⭐", "star"], ["🌟", "glowing star"], ["⚡", "lightning zap"], ["🔥", "fire hot"], ["💧", "droplet water"],
      ["🌊", "wave ocean sea"], ["❄️", "snowflake cold"], ["☁️", "cloud"], ["🌍", "earth globe world"], ["🐶", "dog"],
      ["🐱", "cat"], ["🦊", "fox"], ["🐻", "bear"], ["🐼", "panda"], ["🦁", "lion"],
      ["🐸", "frog"], ["🐝", "bee"], ["🦋", "butterfly"], ["🐢", "turtle slow"], ["🐙", "octopus"],
      ["🐳", "whale"], ["🦉", "owl wise"], ["🐧", "penguin"],
    ],
  },
  {
    title: "Food",
    items: [
      ["☕", "coffee"], ["🍵", "tea"], ["🍎", "apple"], ["🍋", "lemon"], ["🍓", "strawberry"],
      ["🥑", "avocado"], ["🍕", "pizza"], ["🍔", "burger"], ["🍜", "noodles ramen"], ["🍣", "sushi"],
      ["🍰", "cake"], ["🍪", "cookie"], ["🍫", "chocolate"], ["🍿", "popcorn"], ["🥐", "croissant"],
      ["🍷", "wine"], ["🍺", "beer"],
    ],
  },
  {
    title: "Activities and travel",
    items: [
      ["⚽", "soccer football"], ["🏀", "basketball"], ["🎾", "tennis"], ["🏃", "running run"], ["🚴", "cycling bike"],
      ["🧘", "yoga meditate"], ["🎮", "game controller"], ["🎲", "dice game"], ["🎯", "target goal dart"], ["🏆", "trophy win"],
      ["🥇", "medal first"], ["🎨", "art palette paint"], ["🎵", "music note"], ["🎸", "guitar"], ["🎬", "film clapper movie"],
      ["📷", "camera photo"], ["✈️", "airplane travel flight"], ["🚀", "rocket launch ship"], ["🚗", "car"], ["🚲", "bicycle"],
      ["🏠", "house home"], ["🏢", "office building work"], ["🏖️", "beach holiday"], ["⛰️", "mountain"], ["🗺️", "map"],
      ["🧭", "compass direction"],
    ],
  },
  {
    title: "Objects",
    items: [
      ["💡", "bulb idea light"], ["📌", "pin pushpin"], ["📎", "paperclip attach"], ["📝", "memo note write"], ["📄", "page document"],
      ["📑", "bookmark tabs"], ["📚", "books library"], ["📖", "open book read"], ["📓", "notebook"], ["📒", "ledger"],
      ["🧊", "cube ice block"],
      ["📅", "calendar date"], ["🗓️", "spiral calendar"], ["⏰", "alarm clock"], ["⌛", "hourglass time"], ["📊", "bar chart"],
      ["📈", "chart up growth"], ["📉", "chart down"], ["🗂️", "card index dividers"], ["📁", "folder"], ["📦", "package box"],
      ["🔑", "key"], ["🔒", "lock private"], ["🔧", "wrench tool"], ["🔨", "hammer build"], ["⚙️", "gear settings"],
      ["🧪", "test tube experiment"], ["🔬", "microscope science"], ["🔭", "telescope"], ["💻", "laptop computer"], ["🖥️", "desktop"],
      ["⌨️", "keyboard"], ["📱", "phone mobile"], ["🔋", "battery"], ["🔌", "plug"], ["🧲", "magnet"],
      ["💰", "money bag"], ["💳", "credit card"], ["🛒", "cart shopping"], ["🎁", "gift present"], ["🏷️", "label tag"],
      ["✉️", "envelope mail"], ["📬", "mailbox"], ["📣", "megaphone announce"], ["🔔", "bell notification"], ["🔍", "search magnifier"],
      ["🧩", "puzzle piece"], ["🪴", "potted plant"], ["🧹", "broom clean"], ["🗃️", "card file box archive"], ["🖊️", "pen"],
    ],
  },
  {
    title: "Symbols",
    items: [
      ["✅", "check done yes"], ["☑️", "ballot box check"], ["❌", "cross no"], ["⚠️", "warning caution"], ["⛔", "no entry stop"],
      ["❓", "question"], ["❗", "exclamation important"], ["💯", "hundred perfect"], ["❤️", "heart red love"], ["🧡", "orange heart"],
      ["💛", "yellow heart"], ["💚", "green heart"], ["💙", "blue heart"], ["💜", "purple heart"], ["🖤", "black heart"],
      ["✨", "sparkles magic"], ["💫", "dizzy"], ["🎉", "tada party celebrate"], ["🔴", "red circle"], ["🟠", "orange circle"],
      ["🟡", "yellow circle"], ["🟢", "green circle"], ["🔵", "blue circle"], ["🟣", "purple circle"], ["⚫", "black circle"],
      ["♻️", "recycle"], ["➕", "plus add"], ["🔗", "link chain"], ["🏁", "finish flag"], ["🚩", "red flag"],
      ["📍", "location pin"],
    ],
  },
];

const ALL = EMOJI.flatMap((g) => g.items);

/** Emoji whose names start with a word of the query, in picker order. */
export function searchEmoji(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ALL.map(([e]) => e);
  return ALL.filter(([, names]) => {
    const parts = names.split(" ");
    return words.every((w) => parts.some((p) => p.startsWith(w)));
  }).map(([e]) => e);
}

/** What to show for a frontmatter icon: the emoji itself, one of the app's line icons, or the emoji an icon name stands for. */
export function iconGlyph(icon: string): string {
  const value = icon.trim();
  if (value === "") return "";
  // One of the app's line icons, written "icon:name", is drawn as it is.
  if (lineIconName(value)) return value;
  if (/\p{Extended_Pictographic}/u.test(value)) return value;
  const byName = ALL.find(([, names]) => names.split(" ").includes(value.toLowerCase()));
  return byName ? byName[0] : "📄";
}

/** What Notion's "Add icon" picks: something friendly at random. */
export function randomEmoji(random: () => number = Math.random): string {
  const pool = EMOJI.find((g) => g.title === "Objects")!.items;
  return pool[Math.floor(random() * pool.length)]![0];
}
