const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const input = fs.readFileSync(path.join(__dirname, '../lib', name), 'utf8');
  const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, Intl, Date, console }, { filename: name });
  return module.exports;
}
const required = load('mbaiHot24RequiredPicks.ts');
const legacy = load('mbaiHot24Config.ts');
const observed = '2026-10-14T03:00:00.000Z';
const fixture = { title: 'Fixture BTC 1.2%', summary: 'Fixture BTC changed 1.2%.', whyItMatters: 'Fixture risk check.', sourceName: 'Fixture source', hotScore: 65.5, updateCount: 2, contentType: 'NEWS', asset: null };
const footer = '※ 투자 판단을 위한 참고 정보이며 매수·매도 권유가 아닙니다\\.';
test('required NEWS footer escapes its period for MarkdownV2', () => {
  const message = required.buildRequiredPickMessage({ market: 'CRYPTO', kind: 'NEWS', news: fixture }, observed);
  assert.equal(message.split('\n').at(-1), footer);
  assert.equal(message.includes('Fixture BTC changed 1\\.2%\\.'), true);
});
test('legacy HOT24 footer escapes its period for MarkdownV2', () => {
  const message = legacy.buildHot24Message(fixture, observed);
  assert.equal(message.split('\n').at(-1), footer);
});
for (const market of ['KOREA', 'US', 'CRYPTO']) {
  for (const kind of ['NEWS', 'ASSET']) {
    test(`${market} ${kind} preserves escaped footer and generated decimals`, () => {
      const asset = { market, symbol: 'FIX', name: 'Fixture, Inc.', price: 12.34, changePercent: -1.25, turnover: 12345678, marketCap: 123456789, currency: market === 'KOREA' ? 'KRW' : 'USD', asOf: observed, sessionKey: '2026-10-14', source: 'Fixture.source', url: 'https://example.com/fixture' };
      const pick = kind === 'NEWS' ? { market, kind, news: fixture } : { market, kind, asset };
      const message = required.buildRequiredPickMessage(pick, observed);
      assert.equal(message.split('\n').at(-1), footer);
      assert.equal(message.split('').some((character, index) => character === '.' && (index === 0 || message.charCodeAt(index - 1) !== 92)), false, 'no bare periods in the actual generated MarkdownV2');
      assert.equal(message.length < 3900, true);
    });
  }
}
