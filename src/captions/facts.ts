/** Everything a caption may mention for one post. The fact-check enforces this. */
export interface CaptionFacts {
  /** Short Norwegian description of the post, given to Claude. */
  headline: string;
  /** One line per match/fact, in Norwegian, given to Claude and used by templates. */
  lines: string[];
  /** Team designations that may appear, e.g. "G13-2", "Menn 2". */
  teamLabels: string[];
  /** Club names that may appear, e.g. "Haslum", "KFUM". */
  clubs: string[];
  /** Scores that may appear (either order). */
  scores: [number, number][];
  /** Sponsor names that may be thanked. */
  sponsorNames: string[];
  /** Venues and league names that may be mentioned. */
  places: string[];
}

export type CaptionSource = 'claude' | 'template';

export interface Caption {
  text: string;
  source: CaptionSource;
  /** Why a Claude caption was rejected, if it was. */
  rejected?: string[];
}
