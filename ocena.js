(() => {
'use strict';
const byId = id => document.getElementById(id);
const panel = byId('pages-review');
if (!panel || location.origin !== 'https://skatercraft.github.io' || !['/VPA_preparation/', '/VPA_preparation/index.html'].includes(location.pathname) || window.top !== window.self) return;
const field = byId('pages-key'), connect = byId('pages-connect'), disconnect = byId('pages-disconnect');
const auto = byId('pages-auto'), evaluate = byId('pages-evaluate'), result = byId('pages-result');
const server = 'http://127.0.0.1:8716';
const setStatus = message => { byId('pages-status').textContent = message; };
let key = '', take = null, pairing = false, review = null;
const queue = [];
function sync() {
  connect.disabled = pairing || Boolean(key);
  field.disabled = connect.disabled;
  disconnect.disabled = !key;
  evaluate.disabled = !key || !take || take.submitted || queue.length >= 3;
  auto.disabled = !key;
}
function section(title, text, open = false) {
  const details = document.createElement('details'), label = document.createElement('summary'), body = document.createElement('p');
  details.open = open;
  label.textContent = title;
  body.className = 'review-output';
  body.textContent = text;
  details.append(label, body);
  return details;
}
function clearResult() {
  result.replaceChildren();
  result.hidden = true;
}
function stopReview() {
  if (review) review.abort();
  review = null;
}
function unpair(message) {
  stopReview();
  for (const item of queue.splice(0)) item.submitted = false;
  if (take) take.submitted = false;
  key = '';
  field.value = '';
  auto.checked = false;
  clearResult();
  setStatus(message);
  sync();
}
function toServer(path, options) {
  return fetch(server + path, { mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', targetAddressSpace: 'loopback', ...options });
}
connect.addEventListener('click', async () => {
  const candidate = field.value.trim();
  field.value = '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) { setStatus('Wklej aktualny kod z okna parowania.'); return; }
  pairing = true;
  sync();
  setStatus('Sprawdzam dostęp do prywatnego serwera…');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await toServer('/gotowosc', { headers: { 'X-Studio-Key': candidate }, signal: controller.signal });
    if (response.status === 403) { setStatus('Kod parowania jest nieaktualny. Otwórz okno parowania ponownie.'); return; }
    if (!response.ok || (await response.json()).ready !== true) throw new Error('Server not ready');
    key = candidate;
    setStatus('Połączono. Włącz ocenę automatyczną albo ręcznie oceń bieżącą próbę.');
  } catch {
    setStatus('Nie można połączyć się z serwerem. Sprawdź tunel i dostęp lokalny w przeglądarce. Jeśli okno parowania działa, możesz użyć bezpośredniej wersji prywatnej.');
  } finally { clearTimeout(timeout); pairing = false; sync(); }
});
disconnect.addEventListener('click', () => unpair('Rozłączono. Nie będą wysyłane kolejne próby.'));
auto.addEventListener('change', () => setStatus(auto.checked ? 'Ocena włączona dla następnej próby w tej karcie.' : 'Ocena automatyczna wyłączona.'));
function render(info, data) {
  const heading = document.createElement('h3');
  heading.textContent = `${info.q[0]} · ${info.lang} · ${info.stamp}`;
  const notes = Array.isArray(data.uncertain) && data.uncertain.length ? '\n\nNiepewne odczyty automatyczne: ' + data.uncertain.join('; ') : '';
  const report = document.createElement('article');
  report.append(heading,
    section('Transkrypcja', (data.transcript || 'Brak zapisu.') + notes),
    section('Trener rozmowy · w tym tłumaczenie PL ↔ EN', data.coach?.reply || data.coach?.error || 'Ocena trenera niedostępna.'),
    section('Biologia molekularna · Astra', data.science?.reply || data.science?.error || 'Ocena Astry niedostępna.'));
  result.prepend(report);
  while (result.children.length > 10) result.lastElementChild.remove();
  result.hidden = false;
}
function submit() {
  if (!key || !take || take.submitted) return;
  if (take.blob.size > 12 * 1024 * 1024) { setStatus('Plik jest za duży dla oceny. Wczytaj krótszą próbę (do 12 MiB).'); return; }
  if (queue.length >= 3) { setStatus('Kolejka pełna. Ocenę tej próby możesz zlecić ręcznie później lub pobrać plik.'); return; }
  take.submitted = true;
  queue.push(take);
  if (review) setStatus(`Próba ${take.info.q[0]} czeka na ocenę. W kolejce: ${queue.length}.`);
  sync();
  void next();
}
async function next() {
  if (!key || review || !queue.length) return;
  const item = queue.shift(), {blob, info} = item;
  const thisReview = new AbortController();
  review = thisReview;
  const timeout = setTimeout(() => thisReview.abort(), 335000);
  setStatus(`Przetwarzam ${info.q[0]}: transkrypcja i dwie niezależne oceny mogą potrwać kilka minut.`);
  sync();
  try {
    const response = await toServer('/ocena', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Studio-Key': key, 'X-Question': info.q[0], 'X-Answer-Language': info.lang }, body: blob, signal: thisReview.signal });
    if (review !== thisReview) return;
    if (response.status === 403) { unpair('Serwer odrzucił kod. Sparuj ponownie i ręcznie oceń bieżącą próbę.'); return; }
    const data = await response.json();
    if (review !== thisReview) return;
    if (!response.ok) { item.submitted = false; setStatus(data.error || 'Ocena niedostępna. Spróbuj ponownie.'); return; }
    render(info, data);
    setStatus(data.coach?.reply && data.science?.reply ? 'Gotowe: transkrypcja i obie oceny.' : 'Transkrypcja jest gotowa. Co najmniej jedna ocena jest niedostępna.');
  } catch {
    item.submitted = false;
    if (review === thisReview) setStatus('Połączenie przerwane lub przekroczono czas. Nagranie nadal możesz pobrać.');
  } finally { clearTimeout(timeout); if (review === thisReview) { review = null; sync(); void next(); } }
}
evaluate.addEventListener('click', submit);
window.vpaReview = (blob, info) => {
  if (!blob) {
    take = null;
  } else {
    take = {blob, info, submitted: false};
    if (key && auto.checked) void submit();
  }
  sync();
};
auto.checked = false;
field.value = '';
sync();
panel.hidden = false;
})();
