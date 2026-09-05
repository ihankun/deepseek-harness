/**
 * The dsh web profile's readiness line: `dsh web: <url>` printed once the
 * web server binds, carrying the launch token query the browser exchanges
 * for its session cookie, with an optional ` (LAN: ...)` suffix. Parsed by
 * the packaged app to discover its embedded server's OS-assigned port and
 * authenticated URL.
 * @module @deepseek-ai/dsh-electron-app/server-url
 */

/**
 * Extract the loopback URL from a readiness line, token query included.
 * @param line - one or more lines of the web profile's stdout.
 * @returns the loopback URL, or undefined when no ready line is present yet.
 */
export function serverUrlFromLine(line: string): string | undefined {
  const match = line.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+[^)\s]*)/)
  return match?.[1]
}
