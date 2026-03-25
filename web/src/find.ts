import type AhoCorasick from "./aho-corasick";
import type { MapFunc, StringMap, Matches, Rules, RuleInfo } from "./worker";
import { ALL_VER, MIN_NSW_VER, MIN_AC_VER } from './versions';

/** Converts a regex by removing any leading or trailing `^`, `$`, or `.*` tokens. */
export function removeWordBoundaries(pattern: string): string {
  let start: number | undefined = undefined;
  if (pattern.startsWith('^'))       start = 1;
  else if (pattern.startsWith('.*')) start = 2;

  let end: number | undefined = undefined;
  if (pattern.endsWith('$'))         end = -1;
  else if (pattern.endsWith('.*'))   end = -2;

  return pattern.slice(start, end);
}

/** Shifts a UTF-16 codepoint by the given offset. */
function shiftChar(c: string, ofs: number) {
  return String.fromCharCode(c.charCodeAt(0) + ofs);
}

/** Transforms a string by normalizing it to have only lowercase letters and fullwidth katakana. */
export function transformNormalize(value: string, mapFunc: MapFunc): StringMap {
  const out: string[] = [];
  const map: number[] = [];

  const fullwidthKana = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
  for (let i = 0; i < value.length; i++) {
    let c = value[i];

    // Convert halfwidth katakana to fullwidth
    if (c === '\uFF9E' || c === '\uFF9F')
      continue;
    if (c.match(/[ｦ-ﾝ]/g)) {
      const mark = value[i + 1] ?? '';
      const b = c.charCodeAt(0);
      if (mark === '\uFF9E' && 'ｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾊﾋﾌﾍﾎ'.includes(c))
        c = shiftChar(fullwidthKana[b - 0xFF66], 1); // dakuten
      else if (mark === '\uFF9F' && 'ﾊﾋﾌﾍﾎ'.includes(c))
        c = shiftChar(fullwidthKana[b - 0xFF66], 2); // handakuten
      else if (mark === '\uFF9E' && c === 'ｳ')
        c = 'ヴ'; // vu
      else
        c = fullwidthKana[b - 0xFF66];
    }

    // Fold characters treated identically
    if (c.match(/[０-９Ａ-Ｚａ-ｚ]/g))
      c = shiftChar(c, -0xFEE0); // fullwidth numbers/letters to halfwidth
    if (c.match(/[ぁ-ゖ]/g))
      c = shiftChar(c, 0x60); // hiragana to katakana
    if (c.match(/[ァィゥェォッャュョヮ]/g))
      c = shiftChar(c, 1); // small kana to normal kana
    if (c === 'ヵ')
      c = 'カ';
    if (c === 'ヶ')
      c = 'ケ';
    c = c.toLowerCase();

    out.push(c);
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let j = 0; j < c.length; j++)
      map.push(i);
  }
  return [out.join(''), (i) => mapFunc(map[i])];
}

/** Transforms a string by removing all word separators. */
export function transformWordSeparators(value: string, mapFunc: MapFunc, version: number = ALL_VER): StringMap {
  const out: string[] = [];
  const map: number[] = [];
  for (const match of value.matchAll((version === ALL_VER || version >= MIN_NSW_VER) ? /[\p{Letter}\p{Number}]/gu : /[^ \u3000]/g)) {
    out.push(match[0]);
    map.push(match.index);
  }
  return [out.join(''), (i) => mapFunc(map[i])];
}

/** Checks if a character is a word separator. */
function isWordSeparator(c: string, version: number = ALL_VER) {
  return ((version === ALL_VER || version >= MIN_NSW_VER) ? /[^\p{Letter}\p{Number}]/gu : /[ \u3000]/g).test(c);
}

/** Checks if the specified match has the required word boundaries. */
function checkWordBoundaries(value: string, pattern: string, start: number, end: number, version: number = ALL_VER): boolean {
  if (pattern.startsWith('^') && start > 0 && !isWordSeparator(value[start - 1], version))
    return false;
  if (pattern.endsWith('$') && end < value.length && !isWordSeparator(value[end], version))
    return false;
  return true;
}

/** Adds a match for this pattern at this location.  */
function addMatch(matches: Matches, pattern: string, location: readonly [number, number]) {
  const arr = matches.get(pattern);
  if (arr)
    arr.push(location);
  else
    matches.set(pattern, [location]);
}

/** Checks if a version is in the pattern's info. */
function isVersionInInfo(info: RuleInfo, version: number): boolean {
  return version === ALL_VER || Array.from(info.values()).some((vers) => vers.includes(version));
}

type TableSimilar = Map<string, string>;
let tableSimilarCacheFull = false;
const tableSimilarCache = new Map<number, TableSimilar>();

/**
 * Gets the table of similar forms for the specified version.
 */
function makeTableSimilar(rulesSimilar: Rules, version: number): TableSimilar {
  const cached = tableSimilarCache.get(version);
  if (cached)
    return cached;

  const tableSimilar = new Map<string, string>();
  for (const [pair, info] of rulesSimilar.entries()) {
    if (isVersionInInfo(info, version)) {
      const [find, replace] = pair.split('\t');
      tableSimilar.set(find, replace);
    }
  }
  tableSimilarCache.set(version, tableSimilar);
  return tableSimilar;
}

/**
 * Gets the tables of similar forms for all versions.
 *
 * Implementation note:
 * Greek nu (Ν, ν) has been mapped to both Latin "n" and "v" depending on the version.
 * As a consequence, we need to record all possible replacements when checking against all versions.
 */
function makeAllTableSimilar(rulesSimilar: Rules) {
  if (tableSimilarCacheFull)
    return tableSimilarCache;

  for (const [pair, info] of rulesSimilar.entries()) {
    const [find, replace] = pair.split('\t');
    const [versions] = info.values();
    for (const version of versions) {
      const tableSimilar = tableSimilarCache.get(version);
      if (tableSimilar)
        tableSimilar.set(find, replace);
      else
        tableSimilarCache.set(version, new Map<string, string>([[find, replace]]));
    }
  }
  tableSimilarCacheFull = true;
  return tableSimilarCache;
}

/**
 * Finds all allowed patterns.
 *
 * Implementation note:
 * "Iwashita" is allowed, but "iwas|-|ita" and "iw ashita" are blocked.
 * Thus, normalization occurs *before* this, while similar form replacement and word separator removal occur *after* this.
 */
export function findAllow(s: string, map: MapFunc, acAllow: AhoCorasick) {
  const matchesAllow: Matches = new Map();
  for (const {start: ps, end: pe, pattern} of acAllow.search(s)) {
    const start = map(ps), end = map(pe) + 1;
    addMatch(matchesAllow, pattern, [start, end]);
  }
  return matchesAllow;
}

/**
 * Finds and transforms all similar forms for all specified versions.
 */
export function findTransformSimilar(value: string, mapFunc: MapFunc, acSimilar: AhoCorasick, rulesSimilar: Rules, version: number): readonly [Matches, Iterable<StringMap>] {
  const acMatches = acSimilar.search(value);
  const matches: Matches = new Map();

  if (version !== ALL_VER) {
    const stringMap = findTransformSimilarVersion(value, mapFunc, acMatches, matches, makeTableSimilar(rulesSimilar, version));
    return [matches, stringMap === null ? [] : [stringMap]]
  }

  const stringMaps = new Map<string, MapFunc>();
  for (const tableSimilar of makeAllTableSimilar(rulesSimilar).values()) {
    const stringMap = findTransformSimilarVersion(value, mapFunc, acMatches, matches, tableSimilar);
    if (stringMap)
      stringMaps.set(...stringMap)
  }
  return [matches, stringMaps.entries()]
}

/**
 * Finds and transforms all similar forms, greedily preferring earlier, longer matches.
 *
 * Implementation notes:
 * - "|-|-|" maps to "hi" in "s|-|-|t" (matching `.*shit.*`), but not to "ih" in "j|-|-|ad" (not matching `.*jihad.*`).
 * - "Vv" matches "vv -> w", but not "V v". Thus, normalization occurs *before* this, while word separators are removed *after* this.
 */
function findTransformSimilarVersion(value: string, mapFunc: MapFunc, acMatches: ReturnType<AhoCorasick['search']>, matches: Matches, tableSimilar: ReturnType<typeof makeTableSimilar>): StringMap | null {
  if (tableSimilar.size === 0) // no similar forms in this version
    return null;

  // Use Aho-Corasick to find all occurrences of similar forms.
  // Since the results are ordered by end index, populate a map ordered by start index.
  const substitutions = new Map<number, [number, string, string]>();
  for (const {start: ps, end: pe, pattern: find} of acMatches) {
    const replace = tableSimilar.get(find);
    if (replace) {
      const current = substitutions.get(ps);
      if (current === undefined || pe > current[0]) // prefer longer matches
        substitutions.set(ps, [pe, find, replace]);
    }
  }

  if (substitutions.size === 0) // no similar forms in this string
    return null;

  // Perform the substitutions, skipping any that overlap an earlier match.
  // Any replacements made are saved to `matches` for display to the user.
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = substitutions.get(i);
    if (entry === undefined) {
      out.push(value[i]);
      map.push(i);
      continue;
    }

    const ps = i, [pe, find, replace] = entry;
    const start = mapFunc(ps), end = mapFunc(pe) + 1;
    addMatch(matches, `${find}\t${replace}`, [start, end]);

    for (const c of replace) {
      out.push(c);
      map.push(i);
    }
    i += find.length - 1;
  }
  return [out.join(''), (i) => mapFunc(map[i])];
}

/** Finds all blocked patterns. */
export function findBlock(value: string, strings: readonly StringMap[], acBlock: AhoCorasick, regexBlock: string[], version: number = ALL_VER) {
  const matchesBlock: Matches = new Map();
  for (const [s, map] of strings) {
    for (const {start: ps, end: pe, pattern} of acBlock.search(s)) {
      const start = map(ps), end = map(pe) + 1;
      if (checkWordBoundaries(value, pattern, start, end, version))
        addMatch(matchesBlock, pattern, [start, end]);
    }
  }

  if (version < MIN_AC_VER) {
    for (const [s, map] of strings) {
      for (const pattern of regexBlock) {
        for (const match of s.matchAll(new RegExp(removeWordBoundaries(pattern), 'g'))) {
          const ps = match.index, pe = match.index + match[0].length - 1;
          const start = map(ps), end = map(pe) + 1;
          if (checkWordBoundaries(value, pattern, start, end, version))
            addMatch(matchesBlock, pattern, [start, end]);
        }
      }
    }
  }
  return matchesBlock;
}
//#endregion
