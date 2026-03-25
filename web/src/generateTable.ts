import type { Rules, Matches, WorkerResponse } from './worker';
import { ALL_VER } from './versions';

interface Entry {
  readonly kind: 0 | 1 | 2;
  readonly langs: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly max: number;
  readonly pattern: string;
  readonly html: string;
}

/** Adds missing versions that were not publicly released if the prior and following versions are included. */
function addMissingVersions(versions: Set<number>) {
  if (versions.has(5) && versions.has(10)) {
    for (const v of [6, 7, 8, 9])
      versions.add(v);
  }
  for (const i of [15, 22, 36, 56, 58, 61]) {
    if (versions.has(i - 1) && versions.has(i + 1))
      versions.add(i);
  }
}

/** Converts an iterable collection of integers to a comma-separated list of ranges. */
function makeVersionRange(patternVers: Iterable<number>) {
  const versions: readonly number[] = Array.from(patternVers).sort((a, b) => a - b);
  if (versions.length === 0)
    return "";

  const ranges = [];
  let start = versions[0];
  for (let i = 0; i < versions.length - 1; i++) {
    const oldVer = versions[i], newVer = versions[i + 1];
    if (oldVer + 1 !== newVer) {
      ranges.push([start, oldVer]);
      start = newVer;
    }
  }
  ranges.push([start, versions[versions.length - 1]]);

  return ranges
    .map(([start, end]) => (start !== end ? `${start}\u2013${end}` : `${start}`))
    .join(", ");
}

function getPatternInfo(rules: Rules, pattern: string, version: number) {
  const patternLangs: string[] = [];
  const patternVers = new Set<number>();
  let max = version;

  const info = rules.get(pattern)!
  if (version === ALL_VER) {
    for (const [ngLang, vers] of info.entries()) {
      patternLangs.push(ngLang);
      for (const ver of vers) {
        patternVers.add(ver);
        if (ver > max)
          max = ver;
      }
    }
  }
  else {
    for (const [ngLang, vers] of info.entries()) {
      for (const ver of vers)
        if (version === ver) {
          patternLangs.push(ngLang);
          patternVers.add(ver);
          break;
        }
    }
  }

  addMissingVersions(patternVers);
  const languages = Array.from(patternLangs.map((lang) => (info.get(lang)!.includes(max) ? lang : `<s>${lang}</s>`))).join(', ');
  const versions = makeVersionRange(patternVers);
  return [patternLangs, languages, versions, max] as const;
}

function generateRow(className: string, rules: Rules, pattern: string, version: number, ranges: (readonly [number, number])[]): Entry | null {
  const [patternLangs, languages, versions, max] = getPatternInfo(rules, pattern, version);
  if (!languages)
    return null;

  let kind: Entry['kind'];
  let patternText: string;
  switch (className) {
    case 'ok':
      kind = 0;
      patternText = pattern;
      break;
    case 'similar':
      kind = 2;
      patternText = pattern.replace('\t', ' → ');
      break;
    default: // 'ng' or 'ng overridden'
      kind = 1;
      patternText = pattern;
  }

  const tdPattern = `<td class="pattern"><span class="symbol"></span><span class="text">${patternText}</span></td>`;
  const tdLanguages = className === 'similar' ? '<td class="none">&mdash;</td>' : `<td>${languages}</td>`;
  const tdVersions = `<td>${versions}</td>`;
  const rangesSorted = ranges.sort(([a1, a2], [b1, b2]) => a1 - b1 || a2 - b2);
  const tr = `<tr class="${className}" data-ranges="${Array.from(new Set(rangesSorted.map((pair) => pair.join(',')))).join(';')}">${tdPattern}${tdLanguages}${tdVersions}</tr>`;
  return {
    kind: kind,
    langs: patternLangs,
    start: rangesSorted[0][0],
    end: rangesSorted[0][1],
    max: max,
    pattern: pattern,
    html: tr,
  };
}

export function generateTable(matchesBlock: Matches, rulesBlock: Rules, matchesSimilar: Matches, rulesSimilar: Rules, matchesAllow: Matches, rulesAllow: Rules, version: number = ALL_VER): WorkerResponse {
  const entries: Entry[] = [];
  const ngLangs = new Set<string>();

  // Allowed patterns
  const allowRanges: (readonly [number, number])[] = [];
  for (const [pattern, ranges] of matchesAllow.entries()) {
    const row = generateRow('ok', rulesAllow, pattern, version, ranges);
    if (row === null)
      continue;
    entries.push(row);
    allowRanges.splice(allowRanges.length, 0, ...ranges);
  }

  // Blocked patterns
  for (const [pattern, ranges] of matchesBlock.entries()) {
    const overridden = ranges.every(([s0, e0]) => allowRanges.some(([s1, e1]) => s1 <= s0 && e0 <= e1));
    const row = generateRow(overridden ? 'ng overridden' : 'ng', rulesBlock, pattern, version, ranges);
    if (row === null)
      continue;
    if (!overridden)
      for (const ngLang of row.langs)
        ngLangs.add(ngLang);
    entries.push(row);
  }

  // Similar forms
  for (const [pattern, ranges] of matchesSimilar.entries()) {
    const row = generateRow('similar', rulesSimilar, pattern, version, ranges);
    if (row === null)
      continue;
    entries.push(row);
  }

  const html = (entries
    .sort((a, b) => (a.start - b.start) || (a.kind - b.kind) || (a.end - b.end) || (b.max - a.max) || (a.pattern === b.pattern ? 0 : (a.pattern < b.pattern ? -1 : 1)))
    .map(({ html }) => html).join('')
  );
  return { html, ngLangs };
}
