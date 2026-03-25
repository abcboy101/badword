# badword
Profanity filter lists for the Nintendo Switch/3DS/Wii U

Try the simulator at [abcboy101.github.io/badword/](https://abcboy101.github.io/badword/)

- `compile.py` - Generates JSON and wikitext based on all versions of the bad words list.
  This wikitext is used for the table on [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/List_of_censored_words).
- `optimize.py` - Generates text files combining all language-specific lists into a single list, with any redundant regular expressions removed.
  This output is used for the bad words list in [PKHeX](https://github.com/kwsch/PKHeX/tree/master/PKHeX.Core/Resources/text/badwords).
