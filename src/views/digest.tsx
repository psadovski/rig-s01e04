import type { DigestResult } from '../digest/types.js';

function Warning({ children }: { children: string }) {
  return <span class="warn">{children}</span>;
}

export function DigestPage({ result }: { result: Extract<DigestResult, { kind: 'found' }> }) {
  return (
    <>
      <h1>digest · {result.night}</h1>
      {result.malformedRecords > 0 && (
        <p class="warn">malformed records: {result.malformedRecords}</p>
      )}
      {result.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries}
                  {row.retries >= 3 && <> <Warning>warning: many retries</Warning></>}
                </td>
                <td>
                  {row.status}
                  {row.hasFailed && <> <Warning>warning: failed</Warning></>}
                </td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.first}</td>
                <td>{row.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
