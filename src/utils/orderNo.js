import Counter from '../models/Counter.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

async function nextSequence(key) {
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
}

/** PI + YYYYMMDD (IST) + 6-digit daily sequence, e.g. PI20261115000001 */
export async function nextPayOrderNo(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = [
    ist.getUTCFullYear(),
    String(ist.getUTCMonth() + 1).padStart(2, '0'),
    String(ist.getUTCDate()).padStart(2, '0'),
  ].join('');

  const seq = await nextSequence(`payin:${day}`);
  return `PI${day}${String(seq).padStart(6, '0')}`;
}
