/**
 * Inject --session-id <uuid> into a command string after the first token,
 * but only if the command starts with "claude".
 *
 * Examples:
 *   claude --verbose "read prompt.md"  →  claude --session-id <uuid> --verbose "read prompt.md"
 *   claude                             →  claude --session-id <uuid>
 *   echo hello                         →  echo hello  (no injection)
 */
export function injectSessionId(command: string, uuid: string): string {
  const trimmed = command.trimStart();
  const firstSpaceIdx = trimmed.indexOf(' ');

  const firstToken = firstSpaceIdx === -1 ? trimmed : trimmed.slice(0, firstSpaceIdx);
  const rest = firstSpaceIdx === -1 ? '' : trimmed.slice(firstSpaceIdx);

  if (firstToken !== 'claude') return command;

  return rest
    ? `${firstToken} --session-id ${uuid}${rest}`
    : `${firstToken} --session-id ${uuid}`;
}
