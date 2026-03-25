const resources = {
  "en": {
    "title": "Profanity Filter Simulator",
    "subtitle": "for Nintendo Switch/<wbr>3DS/<wbr>Wii&nbsp;U",
    "theme": "Theme",
    "theme_system": "System",
    "theme_light": "Basic Light",
    "theme_dark": "Basic Dark",
    "version": "Version",
    "version_all": "All",
    "text_single": "Enter your text here",
    "text_multiple": "Enter your text here",
    "status_loading": "Loading...",
    "status_ok": "No inappropriate language was detected.",
    "status_ng": "This text contains inappropriate language.",
    "status_ok_lang": "No inappropriate language was detected in $1.",
    "status_ng_lang": "This text contains inappropriate language in $1.",
    "region_j": "[JPN] Japan",
    "region_e": "[USA] The Americas",
    "region_p": "[EUR] Europe",
    "region_k": "[KOR] South Korea",
    "region_c": "[CHN] China",
    "region_t": "[TWN] Hong Kong/Taiwan",
    "language_jja": "Japanese",
    "language_een": "English (US)",
    "language_efr": "French (Canada)",
    "language_ees": "Spanish (Latin America)",
    "language_ept": "Portuguese (Brazil)",
    "language_pen": "English (UK/Australia)",
    "language_pfr": "French (France)",
    "language_pde": "German",
    "language_pit": "Italian",
    "language_pes": "Spanish (Spain)",
    "language_pnl": "Dutch",
    "language_ppt": "Portuguese (Portugal)",
    "language_pru": "Russian",
    "language_kko": "Korean",
    "language_czh": "Simplified Chinese",
    "language_tzh": "Traditional Chinese",
    "language_ten": "English (Taiwan)",
    "language_pol": "Polish",
    "language_tha": "Thai",
    "language_common": "the common list",
    "header_rule": "Rule",
    "header_languages": "Languages",
    "header_versions": "Versions",
    "report": "Report an issue",
    "contact": "Contact me",
  },
  "ja": {
    "title": "NGワードチェッカー",
    "subtitle": "for Nintendo Switch/<wbr>3DS/<wbr>Wii&nbsp;U",
    "theme": "テーマ",
    "theme_system": "システム",
    "theme_light": "ベーシックホワイト",
    "theme_dark": "ベーシックブラック",
    "version": "バージョン",
    "version_all": "すべて",
    "text_single": "テキストを入力してください",
    "text_multiple": "テキストを入力してください",
    "status_loading": "チェック中…",
    "status_ok": "使えない言葉が含まれていません。",
    "status_ng": "使えない言葉が含まれています。",
    "status_ok_lang": "$1では使えない言葉が含まれていません。",
    "status_ng_lang": "$1では使えない言葉が含まれています。",
    "region_j": "[JPN] 日本",
    "region_e": "[USA] アメリカ大陸",
    "region_p": "[EUR] ヨーロッパ",
    "region_k": "[KOR] 韓国",
    "region_c": "[CHN] 中国",
    "region_t": "[TWN] 香港/台湾",
    "language_jja": "日本語",
    "language_een": "英語（アメリカ）",
    "language_efr": "フランス語（カナダ）",
    "language_ees": "スペイン語（ラテンアメリカ）",
    "language_ept": "ポルトガル語（ブラジル）",
    "language_pen": "英語（イギリス／オーストラリア）",
    "language_pfr": "フランス語（フランス）",
    "language_pde": "ドイツ語",
    "language_pit": "イタリア語",
    "language_pes": "スペイン語（スペイン）",
    "language_pnl": "オランダ語",
    "language_ppt": "ポルトガル語（ポルトガル）",
    "language_pru": "ロシア語",
    "language_kko": "韓国語",
    "language_czh": "中国語（簡体字）",
    "language_tzh": "中国語（繁体字）",
    "language_ten": "英語（台湾）",
    "language_pol": "ポーランド語",
    "language_tha": "タイ語",
    "language_common": "共通リスト",
    "header_rule": "ルール",
    "header_languages": "言語",
    "header_versions": "バージョン",
    "report": "問題を報告する",
    "contact": "お問い合わせ",
  },
} as const;

export type Language = keyof typeof resources & {};
export type Key = keyof typeof resources[Language] & {};
const i18n: Readonly<Record<Language, Record<Key, string>>> = resources;

let currentLang: Language = 'en';
export function localize(lang: Language) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/non-nullable-type-assertion-style
  const select = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const selectAll = <T extends HTMLElement>(selector: string) => document.querySelectorAll(selector) as NodeListOf<T>;

  const dict = i18n[currentLang = lang];
  document.body.lang = currentLang;

  select('title').innerText = select('#title').innerText = dict.title;
  select('#subtitle').innerHTML = dict.subtitle;
  select('label[for="colorscheme"]').innerText = dict.theme;
  for (const opt of selectAll<HTMLOptionElement>('#colorscheme option'))
    opt.innerText = dict[`theme_${opt.value as 'system' | 'light' | 'dark'}`];
  select('label[for="version"]').innerText = dict.version;
  select('#version option[value=""]').innerText = dict.version_all;

  select<HTMLInputElement>('#textbox-single-label').innerText = dict.text_single;
  select<HTMLTextAreaElement>('#textbox-multiple').placeholder = dict.text_multiple;

  for (const btn of selectAll<HTMLButtonElement>('.language:not(#language-common)'))
    btn.title = dict[btn.id.replace('-', '_') as keyof typeof dict];
  for (const span of selectAll('.region-code'))
    span.title = dict[`region_${span.innerText.toLowerCase() as 'j' | 'e' | 'p' | 'k' | 'c' | 't'}`];
  select('#language-common').setAttribute('data-name', dict.language_common);
  if (dict.language_common.length <= 3)
    select('#language-common .language-code').style.setProperty('--min-scale', '1');
  else
    select('#language-common .language-code').style.removeProperty('--min-scale');

  const th = selectAll('#patterns th');
  th[0].innerText = dict.header_rule;
  th[1].innerText = dict.header_languages;
  th[2].innerText = dict.header_versions;

  select('#report-link').innerText = dict.report;
  select('#contact-link').innerText = dict.contact;
  select('#lng').innerText = currentLang.toUpperCase();
}

export function getLocalizedString(key: Key) {
  return i18n[currentLang][key];
}

export const isLangValid = (lang: string | null): lang is Language => Object.keys(i18n).includes(lang ?? '');
