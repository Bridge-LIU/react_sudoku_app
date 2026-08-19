import fs from 'node:fs';
import path from 'node:path';

export function buildCommitMessage({ changedFiles, reportPath }) {
  const fileList = changedFiles
    .map((cf) => `- ${cf.file}: nodeId ${cf.appliedNodeIds.join(', ')}`)
    .join('\n');
  const allNodeIds = changedFiles.flatMap((cf) => cf.appliedNodeIds).join(', ');
  return `機能更新: Figma 同期による UI 反映

${fileList}

Figma nodeIds: ${allNodeIds}
Report: ${reportPath}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
}

export function rollbackBakFiles(changedFiles, repoRoot) {
  for (const cf of changedFiles) {
    const abs = path.join(repoRoot, cf.file);
    const bak = abs + '.bak';
    if (fs.existsSync(bak)) {
      fs.renameSync(bak, abs);
    }
  }
}

export function cleanupBakFiles(changedFiles, repoRoot) {
  for (const cf of changedFiles) {
    const bak = path.join(repoRoot, cf.file + '.bak');
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
  }
}

export async function commitAndPush(repoRoot, message, files) {
  // Dynamic import so this module still loads when simple-git isn't installed
  // (e.g. in unit tests that only exercise buildCommitMessage).
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoRoot);
  await git.add(files);
  await git.commit(message);
  const branch = (await git.branch()).current;
  // NOTE: push is disabled for now (per user rule "do not push automatically")
  // Uncomment when ready: await git.push('origin', branch);
  return branch;
}
