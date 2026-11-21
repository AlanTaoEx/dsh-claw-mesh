const command = process.argv.at(-1) ?? '';

if (command.includes('CM_OS')) {
  process.stdout.write([
    'CM_OS Linux 6.8.0-test x86_64',
    'CM_CORES 8',
    'CM_MEM 16777216',
    'CM_DISK /dev/test 100G 40G 60G 40% /',
    'CM_GPU VMware Virtual GPU|NVIDIA GeForce RTX 4090',
    '',
  ].join('\n'));
} else if (command === 'fail') {
  process.stderr.write('deliberate ssh failure\n');
  process.exitCode = 7;
} else if (command === 'large') {
  process.stdout.write('x'.repeat(70_000));
  process.stderr.write('z'.repeat(17_000));
} else if (command === 'check-askpass') {
  process.stdout.write(JSON.stringify({
    askpass: Boolean(process.env.SSH_ASKPASS),
    askpassRequired: process.env.SSH_ASKPASS_REQUIRE === 'force',
    batchModeDisabled: process.argv.includes('BatchMode=no'),
    passwordAuthentication: process.argv.includes('PreferredAuthentications=password,keyboard-interactive'),
  }));
} else {
  process.stdout.write(`ran:${command}\n`);
}
