// R-CLICK-*: one link per input, one redirect, then read the single breakdown entry from stats.
import { describe, expect, test } from 'vitest';
import { COUNTRY_HEADER } from '../../lib/config.ts';
import { utf8Header } from '../../lib/http.ts';
import { followRaw, oneClick } from '../../lib/links.ts';

const H = COUNTRY_HEADER;
/** Raw header list -> one redirect -> stats. */
const click = (headers: string[], omit: string[] = []) => oneClick((code) => followRaw(code, headers, omit));

describe('R-CLICK-1 referrer', () => {
  const cases: [string, string[], string][] = [
    ['absent', [], 'direct'],
    ['https://WWW.Example.com:8443/x (normative)', ['Referer', 'https://WWW.Example.com:8443/x'], 'example.com'],
    ['https://www.www.a.io/ (normative)', ['Referer', 'https://www.www.a.io/'], 'www.a.io'],
    ['example.com/page (normative)', ['Referer', 'example.com/page'], 'direct'],
    ['android-app://com.slack/ (normative)', ['Referer', 'android-app://com.slack/'], 'direct'],
    ['www. with nothing after it is kept', ['Referer', 'http://www./'], 'www.'],
    ['bare www host', ['Referer', 'https://www/'], 'www'],
    ['www without a dot is not stripped', ['Referer', 'https://wwwexample.com/'], 'wwwexample.com'],
    ['host literally "direct"', ['Referer', 'https://direct/'], 'direct'],
    ['www.direct strips to "direct"', ['Referer', 'https://www.direct/x'], 'direct'],
    ['UTF-8 IDN host is punycoded', ['Referer', utf8Header('https://bücher.example/p')], 'xn--bcher-kva.example'],
    ['invalid UTF-8 bytes', ['Referer', 'https://ex\xffample.com/'], 'direct'],
    ['header sent twice', ['Referer', 'https://one.example/', 'Referer', 'https://two.example/'], 'direct'],
    ['ftp scheme', ['Referer', 'ftp://example.com/'], 'direct'],
    ['file scheme (empty host)', ['Referer', 'file:///etc/passwd'], 'direct'],
    ['unparseable http://', ['Referer', 'http://'], 'direct'],
    ['empty value', ['Referer', ''], 'direct'],
    ['scheme-relative', ['Referer', '//example.com/x'], 'direct'],
    ['trailing-dot host is kept as parsed', ['Referer', 'https://EXAMPLE.org./'], 'example.org.'],
    ['IPv6 host', ['Referer', 'https://[::1]:3000/'], '[::1]'],
    ['hex IPv4 host is canonicalized', ['Referer', 'http://0xc0.0xa8.1/'], '192.168.0.1'],
    ['userinfo and www', ['Referer', 'https://user:pw@www.site.com/'], 'site.com'],
    ['upper-case scheme and www', ['Referer', 'HTTPS://WWW.X.io'], 'x.io'],
    ['URL inside the query is ignored', ['Referer', 'https://www.example.com/p?u=https://other.com/'], 'example.com'],
  ];
  test.concurrent.each(cases)('[R-CLICK-1] Referer %s -> %j', async (_l, headers, want) => {
    const s = await click(headers);
    expect(s.topReferrers).toEqual([{ name: want, clicks: 1 }]);
  });
});

describe('R-CLICK-2 country', () => {
  const cases: [string, string[], string][] = [
    ['lower-case us', [H, 'us'], 'US'],
    ['mixed-case Us', [H, 'Us'], 'US'],
    ['surrounding spaces and tabs', [H, ' \tgb \t'], 'GB'],
    ['not ISO-checked: xx', [H, 'xx'], 'XX'],
    ['header name matched case-insensitively', [H.toUpperCase(), 'de'], 'DE'],
    ['absent', [], 'unknown'],
    ['three letters', [H, 'USA'], 'unknown'],
    ['one letter', [H, 'U'], 'unknown'],
    ['empty', [H, ''], 'unknown'],
    ['digit', [H, '1A'], 'unknown'],
    ['inner space', [H, 'U S'], 'unknown'],
    ['non-ASCII letter (UTF-8)', [H, utf8Header('ÜS')], 'unknown'],
    ['header sent twice (same value)', [H, 'us', H, 'us'], 'unknown'],
    ['punctuation', [H, 'u-'], 'unknown'],
  ];
  test.concurrent.each(cases)('[R-CLICK-2] country header %s -> %j', async (_l, headers, want) => {
    const s = await click(headers);
    expect(s.topCountries).toEqual([{ name: want, clicks: 1 }]);
  });
});

describe('R-CLICK-3 device', () => {
  const cases: [string, string | null, string][] = [
    ['absent', null, 'unknown'],
    ['empty', '', 'unknown'],
    ['whitespace only', '   ', 'unknown'],
    ['Googlebot', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'bot'],
    ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'bot'],
    ['crawl', 'SomeCrawler/1.0', 'bot'],
    ['spider', 'Spider-X', 'bot'],
    ['preview (upper-case)', 'WhatsApp Link PREVIEW', 'bot'],
    ['facebookexternalhit', 'facebookexternalhit/1.1', 'bot'],
    ['ROBOT contains bot', 'ROBOT', 'bot'],
    ['bot wins over ipad', 'Mozilla/5.0 (iPad) Googlebot', 'bot'],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148', 'tablet'],
    ['tablet wins over android', 'Mozilla/5.0 (Linux; Android 14; SM-X710) Tablet', 'tablet'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', 'mobile'],
    ['Android phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'mobile'],
    ['Opera Mobi', 'Opera/9.80 (S60; SymbOS; Opera Mobi/499)', 'mobile'],
    ['ANDROID upper-case', 'ANDROID', 'mobile'],
    ['Windows Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', 'desktop'],
    ['curl', 'curl/8.4.0', 'desktop'],
  ];
  test.concurrent.each(cases)('[R-CLICK-3] User-Agent %s -> %j', async (_l, ua, want) => {
    const s = ua === null ? await click([], ['user-agent']) : await click(['User-Agent', ua]);
    expect(s.devices).toEqual([{ name: want, clicks: 1 }]);
  });
});
