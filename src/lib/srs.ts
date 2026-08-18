/**
 * Simplified SM-2 spaced repetition (the algorithm behind Anki).
 * Given how well the user recalled a card (0-5) and its current state,
 * returns the new state: when it's due next, and how "easy" it is.
 *
 * quality: 0-2 = forgot it (reset), 3-5 = remembered (push interval out)
 */
export function scheduleNext(
  quality: number,
  current: { repetition: number; easeFactor: number; intervalDays: number }
): { repetition: number; easeFactor: number; intervalDays: number; dueAt: Date } {
  let { repetition, easeFactor, intervalDays } = current;

  if (quality < 3) {
    // Forgot it: reset repetition count, review again tomorrow
    repetition = 0;
    intervalDays = 1;
  } else {
    repetition += 1;
    if (repetition === 1) intervalDays = 1;
    else if (repetition === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  // Ease factor shifts based on how hard this recall was; never drops below 1.3
  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return { repetition, easeFactor, intervalDays, dueAt };
}
