// Frozen verbatim PowerCmd.SetAmount from 7ed6661; do not edit.
  static SetAmount($T_T, target, amount, applier, cardSource): $.Task<T> {
    return $.async(function* () {
      if (CombatManager.Instance.IsEnding) {
        return null;
      }
      let existingPower = target.GetPower$_T1($T_T);
      if (existingPower == null) {
        return (yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1($T_T, target, amount, applier, cardSource, false));
      }
      yield PowerCmd.ModifyAmount(existingPower, $.dm(amount - existingPower.Amount), applier, cardSource, false);
      return existingPower;
    }, this);
  }
