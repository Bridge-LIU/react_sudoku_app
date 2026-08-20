/**
 * MCP tool 呼び出しの薄いラッパ。
 * 実運用時は Claude Code の tool 呼び出しをそのまま返す実装、
 * テスト時は mock で置き換える。
 *
 * このファイル自体は API 定義のみ。呼び出しは 01-*.mjs 等の script から行われる。
 * script 実装で「実運用実装」と「テスト mock」の両方を注入する形にする。
 */

export function createMcpClient(handlers) {
  return {
    getFileVersions: (args) => handlers.getFileVersions(args),
    diffVersions: (args) => handlers.diffVersions(args),
    getFileAtVersion: (args) => handlers.getFileAtVersion(args),
    getDesignContext: (args) => handlers.getDesignContext(args)
  };
}
