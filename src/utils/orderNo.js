const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

let lastSecondKey = '';
let inSecondCounter = 0;

/**
 * OR + ddmmyyyy (IST) + 9-digit time-of-day in seconds, zero-padded.
 * Example: OR16112026000046994 (16-11-2026, 18:33:14 IST).
 *
 * The 4 leading zeros of the 9-digit part act as an in-second counter so that
 * multiple orders created within the same second stay unique while keeping the
 * same 19-character format (e.g. OR16112026000146994 for the 2nd in that second).
 */
export async function nextPayOrderNo(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();

  let secondsOfDay = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  const secondKey = `${yyyy}${mm}${dd}:${secondsOfDay}`;

  if (secondKey === lastSecondKey) {
    inSecondCounter += 1;
  } else {
    lastSecondKey = secondKey;
    inSecondCounter = 0;
  }

  // Extremely unlikely (>9999 orders in one second): move to the next second.
  if (inSecondCounter > 9999) {
    secondsOfDay += 1;
    inSecondCounter = 0;
    lastSecondKey = `${yyyy}${mm}${dd}:${secondsOfDay}`;
  }

  const timePart = `${String(inSecondCounter).padStart(4, '0')}${String(secondsOfDay).padStart(5, '0')}`;
  return `OR${dd}${mm}${yyyy}${timePart}`;
}
