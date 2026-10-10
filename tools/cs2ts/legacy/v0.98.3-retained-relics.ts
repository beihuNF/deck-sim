// Frozen verbatim model blocks from 7ed6661; do not edit.

export class LastingCandy extends RelicModel {
  declare _isActivating: boolean;
  declare _combatsSeen: number;
  static $name = "LastingCandy";
  static $fullName = "MegaCrit.Sts2.Core.Models.Relics.LastingCandy";
  get Rarity() {
    return RelicRarity.Rare;
  }
  get ShowCounter() {
    return true;
  }
  get DisplayAmount() {
    if (!this.IsActivating) {
      return (this.CombatsSeen % 2);
    }
    return 2;
  }
  get IsActivating() {
    return this._isActivating;
  }
  set IsActivating(value) {
    this.AssertMutable();
    this._isActivating = value;
    this.InvokeDisplayAmountChanged();
  }
  get CombatsSeen() {
    return this._combatsSeen;
  }
  set CombatsSeen(value) {
    this.AssertMutable();
    this._combatsSeen = value;
  }
  get IsInTriggeringCombat() {
    if (this.CombatsSeen > 0) {
      return ((this.CombatsSeen % 2) == 0);
    }
    return false;
  }
  IsAllowed(runState): boolean {
    return RelicModel.IsBeforeAct3TreasureChest(runState);
  }
  TryModifyCardRewardOptions(player, options, creationOptions): boolean {
    if (this.Owner != player) {
      return false;
    }
    if (creationOptions.Source != CardCreationSource.Encounter) {
      return false;
    }
    if (!this.IsInTriggeringCombat) {
      return false;
    }
    let customCardPool = Enumerable$.Where(creationOptions.GetPossibleCards(player), ((c) => ((c.Type == CardType.Power) && options.TrueForAll(((o) => ModelId.op_Inequality(o.originalCard.Id, c.Id))))));
    let options2 = new CardCreationOptions().$ctor_CardCreationOptions$3(customCardPool, CardCreationSource.Other, creationOptions.RarityOdds).WithFlags((CardCreationFlags.NoModifyHooks | CardCreationFlags.NoCardPoolModifications));
    let cardModel = Enumerable$.FirstOrDefault(CardFactory.CreateForReward(this.Owner, 1, options2))?.Card;
    if (cardModel != null) {
      let cardCreationResult = new CardCreationResult().$ctor_CardCreationResult(cardModel);
      cardCreationResult.ModifyCard$2(cardModel, this);
      options.Add(cardCreationResult);
    }
    return (cardModel != null);
  }
  AfterCombatEnd(room): $.Task<void> {
    this.CombatsSeen++;
    if (this.IsInTriggeringCombat) {
      TaskHelper.RunSafely(this.DoActivateVisuals());
    }
    this.InvokeDisplayAmountChanged();
    return Task$.CompletedTask;
  }
  DoActivateVisuals(): $.Task<void> {
    return $.async(function* () {
      this.IsActivating = true;
      this.Flash$0();
      yield Cmd.Wait$2(1, false);
      this.IsActivating = false;
    }, this);
  }
  $fi_LastingCandy() {
    this._isActivating = false;
    this._combatsSeen = 0;
    return this;
  }
  $ctor_LastingCandy() {
    this.$fi_LastingCandy();
    this.$ctor_RelicModel();
    return this;
  }
  static $new() { return new LastingCandy().$ctor_LastingCandy(); }
  static $members() { return Object.hasOwn(LastingCandy, "$m") ? LastingCandy.$m : (LastingCandy.$m = { CombatsSeen: { t: $.T.Int32, k: "p", a: [new SavedPropertyAttribute().$ctor_SavedPropertyAttribute$0()] } }); }
}

export class PumpkinCandle extends RelicModel {
  declare _activeAct: number;
  static $name = "PumpkinCandle";
  static $fullName = "MegaCrit.Sts2.Core.Models.Relics.PumpkinCandle";
  get Rarity() {
    return RelicRarity.Ancient;
  }
  get HasUponPickupEffect() {
    return true;
  }
  get CanonicalVars() {
    return [new EnergyVar().$ctor_EnergyVar$1(1)];
  }
  get ExtraHoverTips() {
    return [HoverTipFactory.ForEnergy$RelicModel(this)];
  }
  get ActiveAct() {
    return this._activeAct;
  }
  set ActiveAct(value) {
    this.AssertMutable();
    this._activeAct = value;
  }
  AfterObtained(): $.Task<void> {
    this.ActiveAct = this.Owner.RunState.CurrentActIndex;
    return Task$.CompletedTask;
  }
  ModifyMaxEnergy(player, amount): number {
    if (player != this.Owner) {
      return amount;
    }
    if (this.ActiveAct != this.Owner.RunState.CurrentActIndex) {
      return amount;
    }
    return $.dm(amount + this.DynamicVars.Energy.IntValue);
  }
  AfterRoomEntered(_): $.Task<void> {
    $.superSet(RelicModel.prototype, "Status", this, (this.ActiveAct != this.Owner.RunState.CurrentActIndex ? RelicStatus.Disabled : RelicStatus.Normal));
    return Task$.CompletedTask;
  }
  $fi_PumpkinCandle() {
    this._activeAct = (-1);
    return this;
  }
  $ctor_PumpkinCandle() {
    this.$fi_PumpkinCandle();
    this.$ctor_RelicModel();
    return this;
  }
  static $new() { return new PumpkinCandle().$ctor_PumpkinCandle(); }
  static $members() { return Object.hasOwn(PumpkinCandle, "$m") ? PumpkinCandle.$m : (PumpkinCandle.$m = { ActiveAct: { t: $.T.Int32, k: "p", a: [new SavedPropertyAttribute().$ctor_SavedPropertyAttribute$0()] } }); }
}

