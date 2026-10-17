import net from 'node:net';

/** Textual forms of a client IP address to search for (R-PRIV-1), including IPv4-mapped IPv6. */
export function addressForms(addr: string): string[] {
  const v4 = addr.replace(/^::ffff:/i, '');
  if (net.isIPv4(v4)) {
    const [a, b, c, d] = v4.split('.').map(Number);
    const hex = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    return [v4, `::ffff:${v4}`, `::ffff:${hex}`, `0:0:0:0:0:ffff:${hex}`];
  }
  return addr === '::1' ? ['::1', '0:0:0:0:0:0:0:1'] : [addr];
}
