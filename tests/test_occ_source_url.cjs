const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const officialIndex = 'https://www2.occ.gov/topics/charters-and-licensing/digital-assets-licensing-applications/index-digital-assets-licensing-applications.html';
const source = fs.readFileSync(path.join(__dirname, '../lib/occApplicantPosting.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function load(fetchImpl) {
  const mod = { exports: {} };
  const isolatedRequire = (id) => {
    if (id === '@/lib/channelPosting') return {
      TELEGRAM_BREAKING_CHANNEL: '@Krypto_breaking',
      insertChannelPostSafe() { throw new Error('publishing forbidden in source test'); },
    };
    if (id === '@/lib/channelPostReasons') return { CHANNEL_POST_REASONS: {} };
    if (id === 'crypto') return require(id);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: isolatedRequire, URL, process: { env: {} }, fetch: fetchImpl });
  return mod.exports;
}

const visibleRow = '<table><tr><td>10/05/2026</td><td>Visible National Trust Bank</td><td><a href="/application.pdf">PDF</a></td></tr></table>';

test('OCC fetch targets the migrated official application index, not the old homepage redirect', async () => {
  const calls = [];
  const mod = load(async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, officialIndex, 'the old host redirects the application index to an empty homepage');
    return { ok: true, status: 200, text: async () => visibleRow };
  });
  const result = await mod.fetchOccApplicants();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(result.sourceUrl, officialIndex);
  assert.equal(result.applicants.length, 1);
  assert.equal(result.applicants[0].linkUrl, 'https://www2.occ.gov/application.pdf');
  assert.equal(result.applicants[0].dedupeKey, mod.buildOccApplicantDedupeKey(result.applicants[0]));
});

test('a successful HTTP response without applicant rows still fails closed', async () => {
  const mod = load(async () => ({ ok: true, status: 200, text: async () => '<html><title>OCC homepage</title></html>' }));
  await assert.rejects(mod.fetchOccApplicants(), /occ_parse_no_applicants/);
});
