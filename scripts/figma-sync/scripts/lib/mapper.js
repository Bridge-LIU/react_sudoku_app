export function mapNodesToFiles(diff, frames) {
  const allChanged = [...diff.added, ...diff.modified].map(x => x.nodeId);
  const byNodeId = new Map(frames.map(f => [f.nodeId, f]));
  const changedFilesSet = new Map();
  const unregistered = [];
  for (const nodeId of allChanged) {
    const frame = byNodeId.get(nodeId);
    if (frame) {
      if (!changedFilesSet.has(frame.file)) {
        changedFilesSet.set(frame.file, { ...frame, appliedNodeIds: [] });
      }
      changedFilesSet.get(frame.file).appliedNodeIds.push(nodeId);
    } else {
      unregistered.push(nodeId);
    }
  }
  return {
    changedFiles: Array.from(changedFilesSet.values()),
    unregistered,
  };
}
