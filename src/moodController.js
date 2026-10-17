import { cloneMood, blendMoods, applyMood } from "./mood.js";

const TRANSITION_SECONDS = 1;
const smooth = (t) => t * t * (3 - 2 * t);

// Listens for the keys 1-4 and blends smoothly from one mood to the next.
export function createMoodController(moods, targets, startIndex = 0, keyCodes = moods.map((_, index) => `Digit${index + 1}`)) {
  const current = cloneMood(moods[startIndex]); // what is on screen right now
  let from = cloneMood(current);
  let to = moods[startIndex];
  let elapsed = TRANSITION_SECONDS; // already finished
  let activeIndex = startIndex;

  function setMood(index, instant = false) {
    if (index < 0 || index >= moods.length) return;
    activeIndex = index;
    from = cloneMood(current);
    to = moods[index];

    if (instant) {
      elapsed = TRANSITION_SECONDS;
      blendMoods(current, from, to, 1);
      applyMood(current, targets);
    } else {
      elapsed = 0;
    }
  }

  function update(delta) {
    if (elapsed >= TRANSITION_SECONDS) return;
    elapsed = Math.min(elapsed + delta, TRANSITION_SECONDS);
    blendMoods(current, from, to, smooth(elapsed / TRANSITION_SECONDS));
    applyMood(current, targets);
  }

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const index = keyCodes.indexOf(event.code);
    if (index >= 0) setMood(index);
  });

  setMood(startIndex, true);

  return {
    update,
    setMood,
    label: () => moods[activeIndex].label,
  };
}