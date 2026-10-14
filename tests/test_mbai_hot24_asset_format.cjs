const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const input = fs.readFileSync(path.join(__dirname, '../lib/mbaiHot24RequiredPicks.ts'), 'utf8');
const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, require, Intl, Date, console });
const { buildRequiredPickMessage } = mod.exports;
const observedAt = '2026-10-14T11:30:00.000Z';
const asset = (overrides = {}) => ({ market: 'CRYPTO', symbol: 'BTC', name: 'Bitcoin', price: 83326, changePercent: -0.18, turnover: 26510000000, marketCap: 1500000000000, currency: 'USD', asOf: '2026-10-14T11:28:00.000Z', sessionKey: '2026-10-14', source: 'CoinGecko', url: 'https://www.coingecko.com/en/coins/bitcoin', ...overrides });
const render = (leader) => buildRequiredPickMessage({ market: leader.market, kind: 'ASSET', asset: leader }, observedAt);
const plain = (value) => value.replace(/\\([_\*\[\]\(\)~`>#+\-=|{}.!\\])/g, '$1').replace(/\*/g, '');

test('approved asset format separates spot quote, rolling metrics, evidence limits and next check', () => {
  const message = render(asset());
  const displayed = plain(message);
  assert.equal(displayed.split('\n')[0], '🔥 HOT 24 · Bitcoin (BTC)');
  assert.match(displayed, /조회 시점 가격은 \$83,326/);
  assert.match(displayed, /최근 24시간 변동률은 -0\.18%/);
  assert.match(displayed, /같은 기간 집계 거래대금은 \$26\.51B/);
  assert.match(displayed, /가격은 소폭 하락했습니다/);
  assert.match(displayed, /이전 기간이나 평소 거래대금과 비교한 자료가 없어/);
  assert.match(displayed, /매도 압력이 커졌거나 시장의 관심이 늘었다고 해석하기도 어렵습니다/);
  assert.match(displayed, /주요 코인/);
  assert.match(displayed, /시세 기준: 2026-10-14 20:28 KST/);
  assert.match(displayed, /조회: 2026-10-14 20:30 KST/);
  assert.doesNotMatch(displayed, /오늘의 장면|숫자가 말하는 것|큰 거래대금|실제 매수·매도 공방|기준 세션|\\·/);
});

test('directional and neutral messages preserve signed metrics without inventing volume intensity', () => {
  for (const [changePercent, expected] of [[-2.1, '가격은 하락했습니다'], [-0.18, '가격은 소폭 하락했습니다'], [-0.02, '가격은 보합권이었습니다'], [0, '가격은 보합권이었습니다'], [0.02, '가격은 보합권이었습니다'], [0.18, '가격은 소폭 상승했습니다'], [2.1, '가격은 상승했습니다']]) {
    const displayed = plain(render(asset({ changePercent })));
    assert.ok(displayed.includes(expected));
    assert.ok(displayed.includes(`${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`));
    assert.doesNotMatch(displayed, /큰 거래대금|관심은 컸|관심이 컸|순유입|매집|매도세가 확인/);
    assert.match(displayed, /비교한 자료가 없어/);
  }
});

for (const market of ['KOREA', 'US', 'CRYPTO']) {
  test(`${market} preserves MarkdownV2, source time, disclaimer, length and input data`, () => {
    const leader = asset({ market, name: 'Fixture_[Asset].(Test)', source: 'Fixture.Source', currency: market === 'KOREA' ? 'KRW' : 'USD' });
    const before = JSON.stringify(leader);
    const message = render(leader);
    assert.equal(JSON.stringify(leader), before);
    assert.doesNotMatch(message, /\\·/);
    assert.equal(message.split('\n').at(-1), '※ 투자 판단을 위한 참고 정보이며 매수·매도 권유가 아닙니다\\.');
    for (const [i, character] of message.split('').entries()) {
      if ('_[]()~`>#+-=|{}.!'.includes(character)) {
        let slashes = 0;
        for (let j = i - 1; j >= 0 && message[j] === '\\'; j--) slashes++;
        assert.equal(slashes % 2, 1, `unescaped ${character} at ${i}`);
      }
    }
    assert.ok(message.length < 3900);
    assert.match(plain(message), /시세 기준: 2026-10-14 20:28 KST/);
    if (market === 'CRYPTO') {
      assert.match(plain(message), /최근 24시간/);
      assert.doesNotMatch(plain(message), /거래일:|기준 세션/);
    } else {
      assert.match(plain(message), /해당 거래일 변동률/);
      assert.match(plain(message), /거래일: 2026-10-14/);
      assert.doesNotMatch(plain(message), /최근 24시간/);
    }
  });
}

test('US turnover is explicitly estimated, Korean turnover keeps reported KRW units', () => {
  assert.match(plain(render(asset({ market: 'US' }))), /추정 거래대금\(조회 가격×거래량\)/);
  const korean = plain(render(asset({ market: 'KOREA', currency: 'KRW', name: 'SK하이닉스', symbol: '000660', price: 1653000, turnover: 4720000000000 })));
  assert.match(korean, /1,653,000원/);
  assert.match(korean, /집계 거래대금은 4\.72조원/);
});

test('missing valid provider timestamp and overlength input fail closed', () => {
  assert.throws(() => render(asset({ asOf: 'not-a-time' })), /invalid_required_pick_asset_as_of/);
  assert.throws(() => render(asset({ name: 'A'.repeat(4000) })), /required_pick_message_too_long/);
});
