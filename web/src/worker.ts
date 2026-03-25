import AhoCorasick from './aho-corasick.js';
import { removeWordBoundaries, transformNormalize, findAllow, findTransformSimilar, transformWordSeparators, findBlock } from './find.js';
import { generateTable } from './generateTable.js';
import { MIN_AC_VER, ALL_VER } from './versions.js';

export interface WorkerRequest { value: string, version?: number }
export interface WorkerResponse { html: string, ngLangs: Set<string> }

export type RuleInfo = Map<string, number[]>;
export type Rules = Map<string, RuleInfo>;
export type MapFunc = (i: number) => number;
export type StringMap = readonly [string, MapFunc];
export type Matches = Map<string, (readonly [number, number])[]>;

export const mapIdentity: MapFunc = (i: number) => i;

let initialized = false;
let lastRequest: WorkerRequest = { value: '' };
const rulesBlock: Rules = new Map();
const rulesAllow: Rules = new Map();
const rulesSimilar: Rules = new Map();

const regexBlock: string[] = [];
let acBlock: AhoCorasick;
let acAllow: AhoCorasick;
let acSimilar: AhoCorasick;

/** Initializes the worker by downloading the necessary data files and instantiating the Aho-Corasick automata. */
function initialize() {
  /** Converts a regex to an Aho-Corasick pattern by removing boundaries and unescaping any literal characters to be matched. */
  const convertRegexToPattern = (pattern: string) => removeWordBoundaries(pattern).replaceAll(/\\(.)/g, '$1');

  /**
   * Checks whether a regex uses features that prevent it from being converted to a single, equivalent Aho-Corasick pattern.
   *
   * These features include groups (`(...)`), disjunctions (`|`), character classes (`[...]`), quantifiers (`*`, `+`, `?`), and wildcards (`.`) other than word boundaries.
   */
  const isComplexPattern = (pattern: string) => removeWordBoundaries(pattern).match(/(?<!\\)[$()*+.?[\]^{|}]/g) !== null;

  type RulesObject = Record<string, Record<string, number[]>>;
  Promise.all([
    fetch(import.meta.env.BASE_URL + 'rules_block.json').then(async (response) => {
      if (response.ok) {
        const keywords: string[] = [];
        for (const [keyword, metadata] of Object.entries(await response.json() as RulesObject)) {
          rulesBlock.set(keyword, new Map(Object.entries(metadata)));
          const max = Math.max(...Object.values(metadata).map((arr) => arr.at(-1)!));
          (max < MIN_AC_VER && isComplexPattern(keyword) ? regexBlock : keywords).push(keyword);
        }
        acBlock = new AhoCorasick(keywords, convertRegexToPattern);
      }
    }),
    fetch(import.meta.env.BASE_URL + 'rules_allow.json').then(async (response) => {
      if (response.ok) {
        const keywords: string[] = [];
        for (const [keyword, metadata] of Object.entries(await response.json() as RulesObject)) {
          rulesAllow.set(keyword, new Map(Object.entries(metadata)));
          keywords.push(keyword);
        }
        acAllow = new AhoCorasick(keywords);
      }
    }),
    fetch(import.meta.env.BASE_URL + 'rules_similar.json').then(async (response) => {
      if (response.ok) {
        const keywords: string[] = [];
        for (const [keyword, metadata] of Object.entries(await response.json() as RulesObject)) {
          rulesSimilar.set(keyword, new Map(Object.entries(metadata)));
          const [find] = keyword.split('\t');
          keywords.push(find);
        }
        acSimilar = new AhoCorasick(keywords);
      }
    }),
  ])
  .then(() => {
    initialized = true;
    check(lastRequest);
  })
  .catch(console.error);
}

/**
 * Checks the given string against the specified version of the profanity filter.
 *
 * Returns an HTML table describing the rules matched and the languages in which profanity was detected, or null if aborted.
 */
function check({ value, version = ALL_VER }: WorkerRequest): WorkerResponse | null {
  lastRequest = { value, version };
  if (!initialized)
    return null;

  const s0: StringMap = [value, mapIdentity];
  const s1 = transformNormalize(...s0);
  const matchesAllow = findAllow(...s1, acAllow);
  const [matchesSimilar, s2] = findTransformSimilar(...s1, acSimilar, rulesSimilar, version);

  if (value !== lastRequest.value && version !== lastRequest.version)
    return null; // abort

  const strings = [s0];
  if (s1 !== s0) strings.push(s1);
  strings.push(...s2);
  strings.push(...strings.map((s) => transformWordSeparators(...s, version)));
  if (import.meta.env.DEV)
    console.debug(strings.map(([str]) => str));
  const matchesBlock = findBlock(value, strings, acBlock, regexBlock, version);

  if (value !== lastRequest.value && version !== lastRequest.version)
    return null; // abort

  const res = generateTable(matchesBlock, rulesBlock, matchesSimilar, rulesSimilar, matchesAllow, rulesAllow, version);
  self.postMessage(res);
  return res;
}

initialize();
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    check(e.data);
  }
  catch (e) {
    console.error(e);
  }
}
