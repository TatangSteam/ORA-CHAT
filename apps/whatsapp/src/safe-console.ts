let installed = false;

export const isSensitiveSignalSessionLog = (values: unknown[]): boolean =>
  typeof values[0] === 'string' && values[0].startsWith('Closing session:');

export const installSensitiveConsoleGuard = (): void => {
  if (installed) return;
  installed = true;
  const originalInfo = console.info.bind(console);
  console.info = (...values: unknown[]) => {
    if (isSensitiveSignalSessionLog(values)) {
      process.stdout.write('{"level":"info","event":"whatsapp_signal_session_rotated"}\n');
      return;
    }
    originalInfo(...values);
  };
};
