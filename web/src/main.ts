import MatchWorker from './worker?worker';
import type { WorkerRequest, WorkerResponse } from "./worker";
import { ALL_VER } from './versions';
import { getLocalizedString, isLangValid, localize } from "./i18n";
import './style.css';

const worker = new MatchWorker();

const modeSelect = document.getElementById('colorscheme') as HTMLSelectElement;
const versionSelect = document.getElementById('version') as HTMLSelectElement;
const textNormal = (document.getElementById('textbox-multiple') ?? document.getElementById('textbox-single')) as HTMLTextAreaElement | HTMLInputElement;
const characterCount = document.getElementById('textbox-multiple-character-count') ?? document.getElementById('textbox-single-character-count') as HTMLSpanElement;
const languageButtons = Array.from(document.getElementsByClassName('language')) as HTMLButtonElement[];
const status = document.getElementById('status')!;

let loading = false;
let ngLangs = new Set<string>();
const entriesDefault = document.querySelector('#patterns tbody')!.innerHTML;

// Fallback if division with units is not supported
if (!CSS.supports('width', 'calc(1% / 1px * 1px)')) {
  const commonText = document.querySelector("#language-common .language-code")!;
  const calculateLanguagesGrid = () => {
    document.getElementById('languages')!.style.setProperty('--fit-column-count',
      Math.ceil(status.clientWidth / commonText.clientWidth).toString());
  }
  calculateLanguagesGrid();
  window.addEventListener('resize', calculateLanguagesGrid);
}

function setText(value: string) {
  loading = true;
  characterCount.innerText = `${value.length}/${textNormal.maxLength}`;
  localStorage.setItem('ng-query', value);
  setTimeout(updateStatus, 1000);
  worker.postMessage({ value, version: Number(versionSelect.value || ALL_VER) } satisfies WorkerRequest);
}

function highlight(e: Event, ranges: readonly [number, number][]) {
  e.preventDefault();

  const el = e.currentTarget as HTMLElement;
  const index = (Number(el.getAttribute('data-range-index') ?? -1) + 1) % ranges.length;
  el.setAttribute('data-range-index', index.toString());
  const [start, end] = ranges[index];

  textNormal.blur();
  textNormal.selectionEnd = textNormal.selectionStart = start;
  textNormal.focus();
  textNormal.selectionEnd = end;
  console.log('Selected', textNormal.selectionStart, textNormal.selectionEnd);
}

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  loading = false;
  ngLangs = e.data.ngLangs;
  for (const lang of languageButtons) {
    const langCode = lang.id.split('-')[1];
    const isNg = ngLangs.has(langCode);
    lang.classList.add(`language-${isNg ? 'ng' : 'ok'}`);
    lang.classList.remove(`language-${isNg ? 'ok' : 'ng'}`);
  }
  updateStatus();

  document.querySelector('#patterns tbody')!.innerHTML = e.data.html || entriesDefault;
  for (const row of document.querySelectorAll('#patterns tbody tr[data-ranges]')) {
    const ranges = row.getAttribute('data-ranges')!.split(';').map((pair) => pair.split(',').map((n) => Number(n)) as [number, number]);
    row.querySelector('.symbol')!.addEventListener('click', (e) => { highlight(e, ranges); });
  }
};

function changeTheme(value: string) {
  document.documentElement.setAttribute('data-mode', value);
  localStorage.setItem('mode', value);
}

function changeVersion(value: string) {
  localStorage.setItem('ng-version', value);
  if (value === '') {
    for (const lang of languageButtons)
      lang.removeAttribute('disabled');
  }
  else {
    const n = Number(value);
    (document.getElementById('language-tzh') as HTMLButtonElement).disabled = (n < 10);
    (document.getElementById('language-ten') as HTMLButtonElement).disabled = (n < 10 || n >= 19);
    (document.getElementById('language-pol') as HTMLButtonElement).disabled = (n < 65);
    (document.getElementById('language-tha') as HTMLButtonElement).disabled = (n < 65);
    (document.getElementById('language-common') as HTMLButtonElement).disabled = (n < 19);
  }
  if (textNormal.value)
    setText(textNormal.value);
}

function updateStatusLang(lang: HTMLButtonElement): string {
  if (loading)
    return status.innerText = getLocalizedString('status_loading');
  const langCode = lang.id.split('-')[1];
  const langName = lang.getAttribute('data-name') ?? lang.title;
  return status.innerText = getLocalizedString(!ngLangs.has(langCode) ? 'status_ok_lang' : 'status_ng_lang').replaceAll('$1', langName);
}

export function updateStatus(): string {
  if (loading)
    return status.innerText = getLocalizedString('status_loading');
  for (const lang of languageButtons)
    if (lang.classList.contains('active'))
      return updateStatusLang(lang);
  return status.innerText = getLocalizedString(ngLangs.size === 0 ? 'status_ok' : 'status_ng');
}

function showLang(e: Event) {
  const lang = e.currentTarget as HTMLButtonElement;
  if (!lang.id.startsWith('language-') || lang.disabled)
    return;

  e.preventDefault();
  if (e.type === 'click')
    for (const other of languageButtons)
      if (other !== lang)
        other.classList.remove('active');
      else
        lang.classList.toggle('active');

  if (window.matchMedia("(hover: hover)").matches)
    updateStatusLang(lang);
  else
    updateStatus();
}

languageButtons.forEach((lang) => {
  lang.addEventListener('mouseenter', showLang);
  lang.addEventListener('mouseleave', updateStatus);
  lang.addEventListener('click', showLang);
});

modeSelect.addEventListener('change', () => { changeTheme(modeSelect.value); });
versionSelect.addEventListener('change', () => { changeVersion(versionSelect.value); });
textNormal.addEventListener('input', () => { setText(textNormal.value); });
// textNormal.addEventListener('blur', () => { textNormal.scrollTo(0, 0); });
(document.getElementById('contact-link') as HTMLAnchorElement).href = atob('bWFpbHRvOmFiY2JveUBidWxiYWdhcmRlbi5uZXQ=');

changeTheme(modeSelect.value = localStorage.getItem('mode') ?? 'system');
changeVersion(versionSelect.value = localStorage.getItem('ng-version') ?? '');
setText(textNormal.value = localStorage.getItem('ng-query') ?? '');

let lng;
if (isLangValid(lng = new URLSearchParams(window.location.search).get('lng'))
    || isLangValid(lng = localStorage.getItem('i18nextLng'))
    || isLangValid(lng = new Intl.Locale(navigator.language).language)) {
  localize(lng);
  updateStatus();
}
document.getElementById('lng')!.addEventListener('click', () => {
  const newLang = document.body.lang === 'en' ? 'ja' : 'en';
  localStorage.setItem('i18nextLng', newLang)
  localize(newLang);
  updateStatus();
});
