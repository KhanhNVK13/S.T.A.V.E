/** First character of `displayName`, falling back to `username`, then `?`. Used for avatar-initial placeholders. */
export function getInitials(
  displayName: string | null | undefined,
  username: string | null | undefined,
): string {
  return (displayName?.[0] ?? username?.[0] ?? '?').toUpperCase();
}
