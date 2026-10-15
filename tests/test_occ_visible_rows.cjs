const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/occApplicantPosting.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
const isolatedRequire = (id) => {
  if (id === '@/lib/channelPosting') return { TELEGRAM_BREAKING_CHANNEL: '@Krypto_breaking' };
  if (id === '@/lib/channelPostReasons') return { CHANNEL_POST_REASONS: {} };
  return require(id);
};
vm.runInNewContext(code, { module: mod, exports: mod.exports, require: isolatedRequire, URL, process });
const { extractOccApplicants } = mod.exports;
const row = (date, name) => `<tr><td>${date}</td><td>${name}</td><td><a href="/application.pdf">PDF</a></td></tr>`;

test('OCC applicant extraction excludes rows inside HTML comments', () => {
  const html = `<table>${row('10/05/2026', 'Visible National Trust Bank')}<!--\n${row('02/18/2026', 'Withdrawn Bank A')}\n${row('01/27/2026', 'Withdrawn Bank B')}\n--></table>`;
  const actual = extractOccApplicants(html);
  assert.equal(actual.length, 1, 'commented-out application rows must not enter current source state');
  assert.equal(actual[0].applicant, 'Visible National Trust Bank');
});

test('visible OCC rows retain deterministic ordering, dedupe and absolute application links', () => {
  const early = row('09/04/2026', 'Earlier &amp; Visible Bank');
  const late = row('10/05/2026', 'Later Visible Bank');
  const actual = extractOccApplicants(`<table>${late}${early}${early}</table>`);
  assert.equal(actual.length, 2);
  assert.equal(actual[0].applicant, 'Earlier & Visible Bank');
  assert.equal(actual[0].dateReceivedIso, '2026-09-04');
  assert.equal(actual[0].linkUrl, 'https://www.occ.treas.gov/application.pdf');
  assert.equal(actual[0].dedupeKey, mod.exports.buildOccApplicantDedupeKey(actual[0]));
  assert.equal(actual[1].applicant, 'Later Visible Bank');
});

test('multiple comments cannot inject rows before or after the visible table', () => {
  const hidden = `<!--${row('10/06/2026', 'Hidden Bank')}-->`;
  const actual = extractOccApplicants(`${hidden}<table>${row('10/05/2026', 'Visible Bank')}</table>${hidden}`);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].applicant, 'Visible Bank');
  assert.equal(extractOccApplicants(`<!--${row('10/06/2026', 'Hidden Bank')}-->`).length, 0);
});
