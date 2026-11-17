const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const state = {
  secondKey: '',
  counters: new Map(),
};

/**
 * <prefix> + ddmmyyyy (IST) + 9-digit time-of-day in seconds, zero-padded.
 * Example: OR16112026000046994 (16-11-2026, 18:33:14 IST).
 *
 * The 4 leading zeros of the 9-digit part act as a per-prefix in-second counter
 * so multiple IDs created within the same second stay unique while keeping the
 * same shape (e.g. OR16112026000146994 for the 2nd OR in that second).
 */
function nextTimeBasedId(prefix, date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();

  let secondsOfDay = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  let secondKey = `${yyyy}${mm}${dd}:${secondsOfDay}`;

  if (secondKey !== state.secondKey) {
    state.secondKey = secondKey;
    state.counters.clear();
  }

  let counter = state.counters.get(prefix) ?? 0;
  state.counters.set(prefix, counter + 1);

  // Extremely unlikely (>9999 IDs per second per prefix): move to the next second.
  if (counter > 9999) {
    secondsOfDay += 1;
    counter = 0;
    secondKey = `${yyyy}${mm}${dd}:${secondsOfDay}`;
    state.secondKey = secondKey;
    state.counters.clear();
    state.counters.set(prefix, 1);
  }

  const timePart = `${String(counter).padStart(4, '0')}${String(secondsOfDay).padStart(5, '0')}`;
  return `${prefix}${dd}${mm}${yyyy}${timePart}`;
}

/** Payment order number: prefix + ddmmyyyy + 9-digit time-of-day seconds. */
export async function nextPayOrderNo(prefix = 'OR', date = new Date()) {
  return nextTimeBasedId(prefix, date);
}

/** Transaction reference: TRN + ddmmyyyy + 9-digit time-of-day seconds. */
export async function nextTransactionNo(date = new Date()) {
  return nextTimeBasedId('TRN', date);
}
