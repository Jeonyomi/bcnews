const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/mbaiHot24RequiredPicks.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(code, { module: moduleUnderTest, exports: moduleUnderTest.exports, require, Intl, Date }, { filename: 'mbaiHot24RequiredPicks.ts' });
const news = { title: 'Fixture 1.2%', summary: 'Fixture event.', whyItMatters: 'Fixture context.', sourceName: 'Fixture source', hotScore: 65.5, updateCount: 2, contentType: 'NEWS', asset: null };
for (const market of ['KOREA', 'US', 'CRYPTO']) {
  test(`${market} NEWS heading uses a literal middle dot without a visible backslash`, () => {
    const message = moduleUnderTest.exports.buildRequiredPickMessage({ market, kind: 'NEWS', news }, '2026-10-17T03:00:00.000Z');
    assert.equal(message.split('\n')[0], `🔥 *HOT 24 · ${market} NEWS*`);
    assert.equal(message.includes('\\·'), false);
    assert.equal(message.includes('Fixture 1\\.2%'), true, 'reserved punctuation stays escaped');
  });
}
