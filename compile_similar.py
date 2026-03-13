import glob
import itertools
import json
import os.path
from collections.abc import Iterable
from typing import get_args

from sortedcontainers import SortedList

from compile import Language, detect_language, Entry, load_words as load_badwords, LANGUAGES_NX, make_version_range

def load_words_allow(version: int | str = '*', languages: Iterable[Language] = None) -> dict[str, set[Entry]]:
    """Loads all allowed word lists in folders that match the specified glob pattern."""
    words: dict[str, set[Entry]] = dict()
    load_words_trie(words, f'./parsed/NgWord2/{version}')
    return words

def load_words_trie(words: dict[str, set[Entry]], glob_pattern: str) -> None:
    """Loads all tries in folders that match the specified glob pattern."""
    for folder in glob.glob(glob_pattern):
        version = int(os.path.basename(folder))
        for path in glob.glob(os.path.join(folder, 'table_similar_form_nx.txt')):
            with open(path, 'r', encoding='utf-8') as f:
                data = f.read()
            if len(data) == 0:
                continue
            for word in data.rstrip('\n').split('\n'):
                words.setdefault(word, set()).add(Entry('jja', version))

def dump_to_json(words: dict[str, set[Entry]]):
    """Dumps the provided allowed word list in JSON format."""
    output = {}
    for word in sorted(words):
        result = {}
        for language, version in sorted(words[word], key=lambda x: (get_args(Language).index(x[0]), x[1])):
            result.setdefault(language, []).append(version)
        output[word] = result
    with open('output/badwords_similar.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

def dump_to_wiki_table(words: dict[str, set[Entry]]):
    """Dumps the provided allowed word list as a table in wikitext format."""
    output = []
    latest = max(entry.version for entry in itertools.chain(*words.values()))
    for word in sorted(words):
        versions = SortedList({entry.version for entry in words[word]})
        vmax1 = max(itertools.chain([-1], (version for version in versions if version >= 19)))
        l1 = ', '.join((str(lang) if any(entry.language == lang for entry in words[word] if entry.version == vmax1)
                        else f"''{lang}''")
                       for lang in LANGUAGES_NX if any(entry.language == lang for entry in words[word] if entry.version >= 19))
        v1 = make_version_range(versions.irange(minimum=45), latest)

        find_str, repl_str = word.split('\t')
        my_str = ' || '.join([f'|-\n| <nowiki>{find_str}</nowiki> || <nowiki>{repl_str}</nowiki>', v1]).replace('  ', ' ').rstrip(' ') + '\n'
        output.append((my_str, versions[-1]))
    with open('output/wiki_similar.txt', 'w', encoding='utf-8') as f:
        for my_str, key in sorted(output, key=lambda x: x[1], reverse=True):
            f.write(my_str)

if __name__ == '__main__':
    all_words_allow = load_words_allow()
    dump_to_json(all_words_allow)
    dump_to_wiki_table(all_words_allow)