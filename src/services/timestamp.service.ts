export interface TimestampResult {
  unix: number;
  iso: string;
  local: string;
  relative: string;
  utc: string;
}

export function unixToDate(timestamp: number): TimestampResult {
  // Support seconds and milliseconds
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);

  if (isNaN(date.getTime())) {
    throw new Error('Invalid Unix timestamp');
  }

  return {
    unix: Math.floor(ms / 1000),
    iso: date.toISOString(),
    local: date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }),
    relative: getRelativeTime(date),
    utc: date.toUTCString(),
  };
}

export function dateToUnix(dateString: string): TimestampResult {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    throw new Error('Invalid date string');
  }

  return {
    unix: Math.floor(date.getTime() / 1000),
    iso: date.toISOString(),
    local: date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }),
    relative: getRelativeTime(date),
    utc: date.toUTCString(),
  };
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return `${prefix}${seconds} second${seconds !== 1 ? 's' : ''}${suffix}`;
  if (minutes < 60) return `${prefix}${minutes} minute${minutes !== 1 ? 's' : ''}${suffix}`;
  if (hours < 24) return `${prefix}${hours} hour${hours !== 1 ? 's' : ''}${suffix}`;
  if (days < 30) return `${prefix}${days} day${days !== 1 ? 's' : ''}${suffix}`;
  if (months < 12) return `${prefix}${months} month${months !== 1 ? 's' : ''}${suffix}`;
  return `${prefix}${years} year${years !== 1 ? 's' : ''}${suffix}`;
}
