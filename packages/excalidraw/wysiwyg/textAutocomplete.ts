import { isFrameLikeElement, isTextElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import { atom } from "../editor-jotai";

/** typed characters needed before anything is suggested */
const MIN_PREFIX_LENGTH = 2;
/** shorter words aren't worth completing */
const MIN_WORD_LENGTH = 3;
/** lines up to this long (in words and chars) complete as a whole, like a
 * shape's label — longer ones are prose, and complete word by word */
const MAX_PHRASE_WORDS = 4;
const MAX_PHRASE_LENGTH = 40;

const WORD_RE = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const WORD_BEFORE_CARET_RE = /[\p{L}\p{M}\p{N}_'’-]+$/u;

type Entry = { text: string; count: number };

export type TextAutocompleteVocabulary = {
  /** lowercased word → the word as first written, and how often it's used */
  words: Map<string, Entry>;
  /** lowercased short line → the line as first written, and its use count */
  phrases: Map<string, Entry>;
};

export type TextAutocompleteSuggestion = {
  /** start of the typed text the completion replaces (in the editor's text) */
  start: number;
  /** the caret: end of the typed text the completion replaces */
  end: number;
  /** what replaces `start…end` on accept, as written on the canvas */
  completion: string;
  /** the part of the completion not typed yet — what the editor shows */
  remainder: string;
};

/** whether a suggestion is shown in the text editor (for the hint) */
export const textAutocompleteSuggestionAtom = atom(false);

const addEntry = (map: Map<string, Entry>, text: string) => {
  const key = text.toLowerCase();
  const entry = map.get(key);
  if (entry) {
    entry.count++;
  } else {
    map.set(key, { text, count: 1 });
  }
};

const addWords = (map: Map<string, Entry>, text: string) => {
  for (const [word] of text.matchAll(WORD_RE)) {
    if (word.length >= MIN_WORD_LENGTH) {
      addEntry(map, word);
    }
  }
};

/**
 * The words and short lines written on the canvas (text, labels, frame
 * names), other than in the text being edited, to complete what's typed with.
 */
export const getTextAutocompleteVocabulary = (
  elements: readonly ExcalidrawElement[],
  editingElementId: ExcalidrawTextElement["id"],
): TextAutocompleteVocabulary => {
  const words = new Map<string, Entry>();
  const phrases = new Map<string, Entry>();

  for (const element of elements) {
    if (element.isDeleted || element.id === editingElementId) {
      continue;
    }
    const text = isTextElement(element)
      ? element.originalText
      : isFrameLikeElement(element)
      ? element.name
      : null;
    if (!text) {
      continue;
    }
    addWords(words, text);
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim().replace(/\s+/g, " ");
      const wordCount = line.split(" ").length;
      if (
        wordCount > 1 &&
        wordCount <= MAX_PHRASE_WORDS &&
        line.length <= MAX_PHRASE_LENGTH
      ) {
        addEntry(phrases, line);
      }
    }
  }

  return { words, phrases };
};

const byUse = (a: Entry, b: Entry) =>
  b.count - a.count ||
  a.text.length - b.text.length ||
  (a.text < b.text ? -1 : a.text > b.text ? 1 : 0);

/**
 * What to complete the word ending at the caret with, if anything: the
 * longest short line on the canvas that the end of the typed line starts,
 * else the most used word that the typed word starts.
 *
 * Only at the end of a line — a completion shown mid-line would cover the
 * text after the caret.
 */
export const getTextAutocompleteSuggestion = ({
  text,
  selectionStart,
  selectionEnd,
  vocabulary,
}: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  vocabulary: TextAutocompleteVocabulary;
}): TextAutocompleteSuggestion | null => {
  const caret = selectionEnd;
  if (selectionStart !== selectionEnd) {
    return null;
  }
  if (caret < text.length && text[caret] !== "\n") {
    return null;
  }

  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const lineBefore = text.slice(lineStart, caret);
  const word = lineBefore.match(WORD_BEFORE_CARET_RE)?.[0];
  if (!word) {
    return null;
  }

  const suggest = (typed: string, entry: Entry | undefined) =>
    entry
      ? {
          start: caret - typed.length,
          end: caret,
          completion: entry.text,
          remainder: entry.text.slice(typed.length),
        }
      : null;

  // the line's last few words, longest first, as the start of a short line
  const wordStarts = [...lineBefore.matchAll(/(?:^|\s)(?=\S)/g)]
    .map((match) => match.index! + match[0].length)
    .slice(-MAX_PHRASE_WORDS);
  for (const wordStart of wordStarts) {
    const typed = lineBefore.slice(wordStart);
    if (typed.length < MIN_PREFIX_LENGTH) {
      break;
    }
    const key = typed.toLowerCase();
    const matches = [...vocabulary.phrases]
      .filter(
        ([phrase]) => phrase.length > key.length && phrase.startsWith(key),
      )
      .map(([, entry]) => entry)
      .sort(byUse);
    if (matches.length) {
      return suggest(typed, matches[0]);
    }
  }

  if (word.length < MIN_PREFIX_LENGTH) {
    return null;
  }
  const key = word.toLowerCase();
  const matches = new Map<string, Entry>();
  const addMatches = (words: Map<string, Entry>) => {
    for (const [w, entry] of words) {
      if (w.length > key.length && w.startsWith(key)) {
        const match = matches.get(w);
        matches.set(
          w,
          match ? { ...match, count: match.count + entry.count } : entry,
        );
      }
    }
  };
  addMatches(vocabulary.words);
  // the text being edited has words to complete too, but not the one typed
  const own = new Map<string, Entry>();
  addWords(own, text.slice(0, caret - word.length) + text.slice(caret));
  addMatches(own);

  return suggest(word, [...matches.values()].sort(byUse)[0]);
};
