import glob
import itertools
import json
import os.path
from collections.abc import Iterable, Sequence
from typing import Literal, NamedTuple, get_args

from sortedcontainers import SortedList

Language = Literal['jja', 'een', 'efr', 'ees', 'pen', 'pfr', 'pde', 'pit', 'pes',
                   'pnl', 'kko', 'czh', 'ppt', 'pru', 'ept', 'tzh', 'ten', 'common']
LANGUAGES: Sequence[Language, ...] = get_args(Language)

class Entry(NamedTuple):
    """Ordered pair representing a particular version of a language-specific list."""
    language: Language
    version: int

def detect_language(path: str) -> Language:
    """Returns the language code corresponding to the specified path."""
    filename = os.path.splitext(os.path.basename(path))[0]
    return 'common' if filename == 'common' else LANGUAGES[int(filename)]

def load_words(version: int | str = '*') -> dict[str, set[Entry]]:
    """Loads all bad word lists in folders that match the specified glob pattern."""
    words: dict[str, set[Entry]] = dict()
    load_words_regex(words, f'./romfs/NgWord/{version}')
    load_words_ac(words, f'./parsed/NgWord2/{version}')
    return words

def load_words_regex(words: dict[str, set[Entry]], glob_pattern: str) -> None:
    """Loads all regular expression lists in folders that match the specified glob pattern."""
    for folder in glob.glob(glob_pattern):
        version = int(os.path.basename(folder))
        if version >= 45: continue  # does not appear to be used anymore
        for path in glob.glob(os.path.join(folder, '*.txt')):
            language = detect_language(path)
            with open(path, 'rb') as f:
                buf = f.read()
            if version == 5 and language == 'ept':
                buf = buf.replace(b'\r\n', b'\n')
            for word in buf.decode('utf-16').rstrip('\n').split('\n'):
                words.setdefault(word, set()).add(Entry(language, version))

def convert_ac_to_regex(word: str, path: str) -> str:
    # Convert literal characters to equivalent regex
    word = (word.replace('.', r'\.')
                .replace('*', r'\*')
                .replace('^', r'\^')
                .replace('$', r'\$'))
    if 'b1' in path or 'not_b' in path:
        return f'.*{word}.*'
    elif 'b2' in path:
        match word.startswith(r'\b'), word.endswith(r'\b'):
            case True, True:  # \b____\b -> ^____$
                return f'^{word[2:-2]}$'
            case True, False:  # \b____ -> ^____.*
                return f'^{word[2:]}.*'
            case False, True:  # ____\b -> .*____$
                return f'.*{word[:-2]}$'
            case _:
                raise ValueError(word)
    else:
        raise ValueError(f'{path} not recognized')

def load_words_ac(words: dict[str, set[Entry]], glob_pattern: str) -> None:
    """Loads all Aho-Corasick tries in folders that match the specified glob pattern."""
    for folder in glob.glob(glob_pattern):
        version = int(os.path.basename(folder))
        if version < 45: continue  # does not appear to have been actively updated until 45
        for path in glob.glob(os.path.join(folder, '*.txt')):
            if any(keyword in path for keyword in ['similar_form', 'trie', 'b1']):
                continue  # b1 is only censored when masking
            language = detect_language(path.split('_')[1])
            with open(path, 'r', encoding='utf-8') as f:
                data = f.read()
            for word in data.rstrip('\n').split('\n'):
                word = convert_ac_to_regex(word, path)
                words.setdefault(word, set()).add(Entry(language, version))

def add_missing_versions(versions: SortedList[int]):
    """Adds missing versions that were not publicly released if the prior and following versions are included."""
    if 5 in versions and 10 in versions:
        versions.update([6, 7, 8, 9])
    for i in [15, 22, 36, 56, 58, 61]:
        if (i - 1) in versions and (i + 1) in versions:
            versions.add(i)

def make_version_range(versions: Iterable[int]) -> str:
    """Converts an iterable collection of integers to a comma-separated list of ranges."""
    versions: SortedList[int] = SortedList(versions)
    if not versions:
        return ''
    add_missing_versions(versions)

    ranges: list[tuple[int, int]] = []
    start: int = versions[0]
    for old, new in itertools.pairwise(versions):
        if old + 1 != new:
            ranges.append((start, old))
            start = new
    ranges.append((start, versions[-1]))
    return ", ".join(f"{start}\u2013{end}" if start != end else str(start) for start, end in ranges)

def dump_to_json(words: dict[str, set[Entry]]):
    """Dumps the provided bad word list in JSON format."""
    output = {}
    for word in sorted(words):
        result = {}
        for language, version in sorted(words[word], key=lambda x: (LANGUAGES.index(x[0]), x[1])):
            result.setdefault(language, []).append(version)
        output[word] = result
    with open('output/badwords.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

def dump_to_wiki_table(words: dict[str, set[Entry]]):
    """Dumps the provided bad word list as a table in wikitext format."""
    output = []
    for word in sorted(words):
        versions = SortedList({entry.version for entry in words[word]})
        l1 = ', '.join(lang for lang in LANGUAGES if any(entry.language == lang for entry in words[word] if entry.version >= 19))
        v1 = make_version_range(versions.irange(minimum=19))
        l2 = ', '.join(lang for lang in LANGUAGES if any(entry.language == lang for entry in words[word] if entry.version <= 18))
        v2 = make_version_range(versions.irange(maximum=18))
        my_str = ' || '.join([f'|-\n| <nowiki>{word}</nowiki>', l1, v1, l2, v2]).replace('  ', ' ').rstrip(' ') + '\n'
        output.append((my_str, versions[-1]))
    with open('output/wiki.txt', 'w', encoding='utf-8') as f:
        for my_str, key in sorted(output, key=lambda x: x[1], reverse=True):
            f.write(my_str)

if __name__ == '__main__':
    all_words = load_words()
    dump_to_json(all_words)
    dump_to_wiki_table(all_words)