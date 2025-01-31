from __future__ import annotations

import glob
import itertools
import multiprocessing
import multiprocessing.managers
import re
import time
from concurrent.futures.process import ProcessPoolExecutor

from greenery import parse

from compile import load_words

VERBOSE = True

#region Helper methods
def make_test_string_simple(pattern: str) -> str:
    """Constructs a comprehensive test string for a simple pattern.
    We replace ``.*`` with a private-use character to require a corresponding wildcard in any test."""
    return (pattern.removeprefix('^').removesuffix('$')
            .replace('\.', '.').replace('\$', '$')
            .replace('.*', '\uF000'))

def make_test_strings_complicated(pattern: str, n: int = 2) -> tuple[str, ...]:
    """Constructs up to n test strings for a complicated pattern.
    To reduce the work that greenery has to do, we replace all ``.*`` with an empty string."""
    it = parse(clean_pattern(pattern.replace('.*', ''))).strings()
    return tuple(itertools.islice(it, n))

def clean_pattern(pattern: str) -> str:
    """Converts a standard regex pattern to the format expected by greenery."""
    return (pattern.removeprefix('^').removesuffix('$')
                   .replace('\\^', '^').replace('\\$', '$'))

def check_words_complicated_helper(word: str, other: set[str]) -> str | None:
    """Checks if `word` is redundant to any of the patterns in `other`.

    Pattern.equivalent is very slow, so we perform a couple faster checks first:

    - If there are literal characters in `word` that aren't in `sub`,
      it's impossible for `sub` to match all strings that `word` matches.
    - We try running `sub` on some test strings that match `word`.
      If `sub` doesn't match all of these, then it can't be a superset.
      (We generate the test strings the first time this step is reached.)
    - If both tests are passed, then we finally use Pattern.equivalent.
      This exhaustively checks that ABC|B is equivalent to B."""
    test_strings: tuple[str, ...] | None = None
    for sub in other:
        if word == sub:
            continue
        if len(set(word).intersection(sub).difference('^$[]()|?.*')) == 0:
            continue
        if test_strings is None:
            test_strings = make_test_strings_complicated(word)
        if not all(re.match(sub, test_string) for test_string in test_strings):
            continue
        if parse(f'{clean_pattern(word)}|{clean_pattern(sub)}').equivalent(parse(clean_pattern(sub))):
            return sub
    return None

def check_words_complicated_worker(q_todo: multiprocessing.Queue[str | False], q_done: multiprocessing.Queue[tuple[str, str | None] | BaseException], complicated: set[str]):
    try:
        while word := q_todo.get():
            q_done.put((word, check_words_complicated_helper(word, complicated)))
    except BaseException as e:
        q_done.put(e)
#endregion

def check_words_simple(simple: set[str]) -> set[str]:
    """Checks for redundant simple patterns that are matched by another simple pattern.
    Specifically, any pattern that has another pattern as a prefix, suffix, or substring is redundant."""
    print(f'Checking {len(simple)} simple patterns...')

    anywhere: set[str] = set()
    prefix: set[str] = set()
    suffix: set[str] = set()
    whole: set[str] = set()
    for word in simple:
        if word.endswith('.*'):
            if word.startswith('.*'):
                anywhere.add(word[2:-2])
            elif word.startswith('^'):
                prefix.add(word[1:-2])
            else:
                raise ValueError("expected pattern to start with '.*' or '^'")
        elif word.endswith('$'):
            if word.startswith('.*'):
                suffix.add(word[2:-1])
            elif word.startswith('^'):
                whole.add(word[1:-1])
            else:
                raise ValueError("expected pattern to start with '.*' or '^'")
        else:
            raise ValueError("expected pattern to end with '.*' or '$'")

    redundant: set[str] = set()
    for word in anywhere:
        if any((match := sub) in word for sub in anywhere if len(sub) < len(word)):
            if VERBOSE: print(f'\t.*{word}.* is a subset of .*{match}.*')
            redundant.add('.*' + word + '.*')
    for word in prefix:
        if any((match := sub) in word for sub in anywhere if len(sub) <= len(word)):
            if VERBOSE: print(f'\t^{word}.* is a subset of .*{match}.*')
            redundant.add('^' + word + '.*')
        elif any(word.startswith((match := sub)) for sub in prefix if len(sub) < len(word)):
            if VERBOSE: print(f'\t^{word}.* is a subset of ^{match}.*')
            redundant.add('^' + word + '.*')
    for word in suffix:
        if any((match := sub) in word for sub in anywhere if len(sub) <= len(word)):
            if VERBOSE: print(f'\t.*{word}$ is a subset of .*{match}.*')
            redundant.add('.*' + word + '$')
        elif any(word.endswith((match := sub)) for sub in suffix if len(sub) < len(word)):
            if VERBOSE: print(f'\t.*{word}$ is a subset of .*{match}$')
            redundant.add('.*' + word + '$')
    for word in whole:
        if any((match := sub) in word for sub in anywhere if len(sub) <= len(word)):
            if VERBOSE: print(f'\t^{word}$ is a subset of .*{match}.*')
            redundant.add('^' + word + '$')
        elif any(word.startswith((match := sub)) for sub in prefix if len(sub) <= len(word)):
            if VERBOSE: print(f'\t^{word}$ is a subset of ^{match}.*')
            redundant.add('^' + word + '$')
        elif any(word.endswith((match := sub)) for sub in suffix if len(sub) <= len(word)):
            if VERBOSE: print(f'\t^{word}$ is a subset of .*{match}$')
            redundant.add('^' + word + '$')
    return redundant

def check_words_simple_complicated(simple: set[str], complicated: set[str]) -> set[str]:
    """Checks for redundant simple patterns that are matched by a complicated pattern."""
    print(f'Checking {len(simple)} simple patterns against {len(complicated)} complicated patterns...')
    redundant = set()
    for word in simple:
        if any(re.match((match := sub), make_test_string_simple(word)) for sub in complicated):
            if VERBOSE: print(f'\t{word} is a subset of {match}')
            redundant.add(word)
    return redundant

def check_words_complicated(complicated: set[str]) -> set[str]:
    """Checks for redundant complicated patterns that are matched by another complicated pattern.

    This is a CPU-bound task, so we use a ProcessPoolExecutor to run the checks in parallel."""
    print(f'Checking {len(complicated)} complicated patterns...')
    redundant = set()
    with multiprocessing.Manager() as manager:  # type: multiprocessing.managers.SyncManager
        workers = os.cpu_count() - 1
        with ProcessPoolExecutor(max_workers=workers) as e:
            tasks = manager.Queue()
            for word in sorted(complicated, key=lambda s: len(s)):
                tasks.put(word)

            results = manager.Queue()
            for _ in range(workers):
                tasks.put(False)
                e.submit(check_words_complicated_worker, tasks, results, complicated)

            for _ in complicated:
                r = results.get()
                if isinstance(r, BaseException):
                    raise r
                word, word2 = r  # type: str, str | None
                if word2 is not None:
                    if VERBOSE: print(f'\t{word} is a subset of {word2}')
                    redundant.add(word)
    return redundant

def main(version: int, filename: str):
    words = load_words(f'./romfs/{version}')
    print(f'Found {len(words)} patterns')

    complicated = set()
    for word in words:
        if any(c in word for c in '[]()|?'):
            complicated.add(word)
            continue

    redundant = check_words_simple(set(words) - complicated)
    words = set(words) - redundant
    print(f'Removed {len(redundant)} simple patterns')

    if complicated:
        redundant = check_words_simple_complicated(words - complicated, complicated)
        words = set(words) - redundant
        print(f'Removed {len(redundant)} simple patterns')

        redundant = check_words_complicated(complicated)
        words = set(words) - redundant
        print(f'Removed {len(redundant)} complicated patterns')

    with open(f'output/badwords_{filename}.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(sorted(words)))

if __name__ == '__main__':
    import os.path
    from natsort import natsorted

    LATEST_VER = int(os.path.basename(natsorted(glob.glob('./romfs/*'))[-1]))
    # main(18, '3ds')
    main(LATEST_VER, 'switch')
