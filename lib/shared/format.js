const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${UNITS[i]}`;
}

export function formatSpeed(bytesPerSec) {
  return `${formatSize(bytesPerSec)}/s`;
}

export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${String(rem).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatDate(mtime) {
  const d = new Date(mtime);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
