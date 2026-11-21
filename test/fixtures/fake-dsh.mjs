let prompt = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  if (prompt.includes('MODE_TIMEOUT')) {
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1_000);
    return;
  }

  if (prompt.includes('MODE_OVERLONG_LINE')) {
    process.stdout.write(`${'x'.repeat(1024 * 1024 + 128)}\n`);
  }

  const text = prompt.includes('MODE_OVERLONG_LINE')
    ? 'after-overlong-line'
    : `done:${prompt.trim()}\n${'y'.repeat(2_500)}`;

  // Intentionally omit the trailing newline to exercise the close-time flush.
  process.stdout.write(JSON.stringify({
    type: 'final',
    text,
    reason: { kind: 'completed' },
  }));
});
