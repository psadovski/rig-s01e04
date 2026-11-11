import { describe, expect, it } from 'vitest';
import { renderToString } from 'hono/jsx/dom/server';
import { DigestPage } from '../src/views/digest.js';

describe('digest view', () => {
  it('renders missing values and both warning conditions, escaping row content', () => {
    const html = renderToString(
      <DigestPage
        result={{
          kind: 'found',
          night: '2026-10-28',
          malformedRecords: 1,
          rows: [{
            job: '<job>',
            owner: null,
            runs: 4,
            retries: 3,
            status: 'ok',
            lastError: 'upstream <503>',
            first: '2026-10-28T01:00:00+01:00',
            last: '2026-10-28T02:00:00+01:00',
            hasFailed: true,
          }],
        }}
      />,
    );

    expect(html).toContain('malformed records: 1');
    expect(html).toContain('warning: many retries');
    expect(html).toContain('warning: failed');
    expect(html).toContain('—');
    expect(html).toContain('&lt;job&gt;');
    expect(html).toContain('upstream &lt;503&gt;');
    expect(html).not.toContain('<job>');
  });

  it('renders an empty found night as nothing ran', () => {
    const html = renderToString(
      <DigestPage result={{ kind: 'found', night: '2026-10-29', rows: [], malformedRecords: 0 }} />,
    );

    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });
});
