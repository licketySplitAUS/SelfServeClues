// Read the prepared snapshot without loading solver/dictionary history. Both
// the public read endpoint and the mutation service share this monitor shape.
export async function currentSnapshot(repo, importedSnapshot) {
  const { value } = await repo.control();
  const snapshot = value?.snapshotKey ? await repo.read(value.snapshotKey) : await importedSnapshot();
  return { ...snapshot, monitor: { lastCheck: value?.lastCheck || null, message: value?.message || null, candidate: value?.candidate || null } };
}

export async function importedSnapshot() {
  const [{ loadBaseline }, { snapshotFor }] = await Promise.all([import('./baseline.mjs'), import('./stats.mjs')]);
  const baseline = await loadBaseline();
  return snapshotFor(baseline.aggregate, baseline.games, baseline.current, baseline.dictionary, {
    source: 'import', sourceVersion: baseline.sourceVersion, updatedAt: baseline.importedAt, status: 'Imported database snapshot.',
  });
}
