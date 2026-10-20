import { buildDiagnosticsFile } from './extractionReport.js';

/** Hands over the capture, the answer and the measurement, so a failure can be re-run offline. */
export const downloadDiagnostics = (input) => {
  const { name, json } = buildDiagnosticsFile(input);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
