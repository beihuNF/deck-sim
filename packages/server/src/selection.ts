// Same character requirements as UnlockState.Characters. Validate the original unlock snapshot, not a new DTO.
const epochs: Record<string, string | null> = {
  IRONCLAD: null, SILENT: 'SILENT1_EPOCH', REGENT: 'REGENT1_EPOCH',
  NECROBINDER: 'NECROBINDER1_EPOCH', DEFECT: 'DEFECT1_EPOCH',
};
export function validCharacterSelection(character: unknown, unlock: unknown, daily = false): boolean {
  if (typeof character !== 'string' || !Object.hasOwn(epochs, character)
    || typeof unlock !== 'string' || unlock.length > 48_000) return false;
  try {
    const state = JSON.parse(unlock);
    const unlocked = state?.UnlockedEpochs ?? state?.unlocked_epochs;
    return Array.isArray(unlocked) && unlocked.every((e: unknown) => typeof e === 'string')
      && Array.isArray(state?.EncountersSeen ?? state?.encounters_seen)
      && Number.isInteger(state?.NumberOfRuns ?? state?.number_of_runs)
      && (daily || epochs[character] === null || unlocked.includes(epochs[character]));
  } catch { return false; }
}
