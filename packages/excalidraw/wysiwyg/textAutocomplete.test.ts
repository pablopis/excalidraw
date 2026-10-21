import { API } from "../tests/helpers/api";

import {
  getTextAutocompleteSuggestion,
  getTextAutocompleteVocabulary,
} from "./textAutocomplete";

const vocabularyOf = (...texts: string[]) =>
  getTextAutocompleteVocabulary(
    texts.map((text) => API.createElement({ type: "text", text })),
    "editing",
  );

const suggest = (
  text: string,
  vocabulary: ReturnType<typeof vocabularyOf>,
  caret = text.length,
) =>
  getTextAutocompleteSuggestion({
    text,
    selectionStart: caret,
    selectionEnd: caret,
    vocabulary,
  });

describe("text autocomplete", () => {
  const vocabulary = vocabularyOf(
    "API Gateway",
    "Authentication Service",
    "Redis cache",
    "TODO: rate limiting before Authorization",
  );

  it("completes a label on the canvas as a whole", () => {
    expect(suggest("Checked by Auth", vocabulary)).toEqual({
      start: 11,
      end: 15,
      completion: "Authentication Service",
      remainder: "entication Service",
    });
  });

  it("continues a label from its first words", () => {
    expect(suggest("Authentication Se", vocabulary)).toEqual({
      start: 0,
      end: 17,
      completion: "Authentication Service",
      remainder: "rvice",
    });
  });

  it("completes words of longer text", () => {
    expect(suggest("needs Authori", vocabulary)?.completion).toBe(
      "Authorization",
    );
  });

  it("matches regardless of case, completing as written on the canvas", () => {
    expect(suggest("redis c", vocabulary)).toMatchObject({
      start: 0,
      completion: "Redis cache",
      remainder: "ache",
    });
  });

  it("prefers labels to words, then the most used word", () => {
    expect(
      suggest("the Paym", vocabularyOf("Payments", "Payment worker"))
        ?.completion,
    ).toBe("Payment worker");
    expect(
      suggest("the Paym", vocabularyOf("Paymaster", "Payments", "Payments"))
        ?.completion,
    ).toBe("Payments");
  });

  it("completes words of the text being edited", () => {
    expect(
      suggest("Kubernetes runs it, Kube", vocabularyOf())?.completion,
    ).toBe("Kubernetes");
  });

  it("doesn't suggest the word being typed back", () => {
    expect(suggest("Kubernetes", vocabularyOf())).toBe(null);
  });

  it("needs two typed characters", () => {
    expect(suggest("by A", vocabulary)).toBe(null);
    expect(suggest("by Au", vocabulary)?.completion).toBe(
      "Authentication Service",
    );
    // of a label, even if the last word has fewer
    expect(suggest("API G", vocabulary)?.remainder).toBe("ateway");
  });

  it("only suggests at the end of a line", () => {
    expect(suggest("Auth here", vocabulary, 4)).toBe(null);
    expect(suggest("Auth\nhere", vocabulary, 4)?.completion).toBe(
      "Authentication Service",
    );
  });

  it("doesn't suggest with text selected", () => {
    expect(
      getTextAutocompleteSuggestion({
        text: "Auth",
        selectionStart: 0,
        selectionEnd: 4,
        vocabulary,
      }),
    ).toBe(null);
  });

  it("doesn't suggest after a space", () => {
    expect(suggest("Auth ", vocabulary)).toBe(null);
  });

  it("leaves out the text being edited and deleted text", () => {
    const vocabulary = getTextAutocompleteVocabulary(
      [
        API.createElement({ type: "text", id: "editing", text: "Elephant" }),
        API.createElement({ type: "text", text: "Elevator", isDeleted: true }),
        { ...API.createElement({ type: "frame" }), name: "Elections" },
      ],
      "editing",
    );
    expect(suggest("Ele", vocabulary)?.completion).toBe("Elections");
  });
});
