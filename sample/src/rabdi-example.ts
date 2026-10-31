/** A fixed public seed, read by the server with Key B. Source rows stay in the browser. */
export async function loadRabdiExample() {
  const host = document.getElementById('rabdi-example');
  if (!host) return;
  host.textContent = 'Reading a generated schema from Rabdi...';
  try {
    const response = await fetch('/api/sample', { cache: 'no-store' });
    if (!response.ok) throw new Error('read unavailable');
    const result = await response.json();
    if (result.network !== 'Rabdi' || !Array.isArray(result.entities)) throw new Error('unexpected response');
    const row = result.entities[0];
    if (!row) { host.textContent = 'The public example needs reseeding after a network reset.'; return; }
    const label = document.createElement('p');
    label.textContent = 'Read from Rabdi: ' + row.title + ' · score ' + row.score + '.';
    const link = document.createElement('a');
    link.textContent = 'View the example entity';
    link.href = 'https://rabdi.explorer.arkiv.network/entity/' + row.key;
    link.target = '_blank'; link.rel = 'noreferrer';
    host.replaceChildren(label, link);
    host.dataset.loaded = 'true';
  } catch {
    host.textContent = 'The Rabdi example is unavailable. Offline schema conversion remains available.';
  }
}
