// Frozen compatibility models from v0.98.3 generated at 7ed6661. Do not edit.
// Appended by cs2ts only while these types are absent upstream; excluded from new content pools.

export class DoorRevivalPower_Data {
  declare isHalfDead: boolean;
  static $name = "Data";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.DoorRevivalPower+Data";
  $fi_DoorRevivalPower_Data() {
    this.isHalfDead = false;
    return this;
  }
  $ctor_DoorRevivalPower_Data() {
    this.$fi_DoorRevivalPower_Data();
    return this;
  }
  static $new() { return new DoorRevivalPower_Data().$ctor_DoorRevivalPower_Data(); }
}

export class OutbreakPower_Data {
  declare timesPoisoned: number;
  static $name = "Data";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.OutbreakPower+Data";
  $fi_OutbreakPower_Data() {
    this.timesPoisoned = 0;
    return this;
  }
  $ctor_OutbreakPower_Data() {
    this.$fi_OutbreakPower_Data();
    return this;
  }
  static $new() { return new OutbreakPower_Data().$ctor_OutbreakPower_Data(); }
}

export class FollowThrough extends CardModel {
  static $name = "FollowThrough";
  static $fullName = "MegaCrit.Sts2.Core.Models.Cards.FollowThrough";
  get ShouldGlowGoldInternal() {
    return this.WasLastCardPlayedSkill;
  }
  get CanonicalVars() {
    return [new DamageVar().$ctor_DamageVar$2(6, ValueProp.Move), new PowerVar().$ctor_PowerVar$1(WeakPower, 1)];
  }
  get ExtraHoverTips() {
    return [HoverTipFactory.FromPower$_T1(WeakPower)];
  }
  get WasLastCardPlayedSkill() {
    let cardPlayStartedEntry = Enumerable$.LastOrDefault(CombatManager.Instance.History.CardPlaysStarted, ((e) => (((e.CardPlay.Card.Owner == this.Owner) && e.HappenedThisTurn(this.CombatState)) && (e.CardPlay.Card != this))));
    if (cardPlayStartedEntry == null) {
      return false;
    }
    return (cardPlayStartedEntry.CardPlay.Card.Type == CardType.Skill);
  }
  OnPlay(choiceContext, cardPlay): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.DynamicVars.Damage.BaseValue).FromCard(this).TargetingAllOpponents(this.CombatState).WithHitFx("vfx/vfx_attack_slash", null, null).Execute(choiceContext);
      if (this.WasLastCardPlayedSkill) {
        yield PowerCmd.Apply$IEnumerableCreature_Decimal_Creature_CardModel_Boolean_T1(WeakPower, this.CombatState.HittableEnemies, this.DynamicVars.Weak.BaseValue, this.Owner.Creature, this, false);
      }
    }, this);
  }
  OnUpgrade(): void {
    this.DynamicVars.Damage.UpgradeValueBy(2);
    this.DynamicVars.Weak.UpgradeValueBy(1);
  }
  $fi_FollowThrough() {

    return this;
  }
  $ctor_FollowThrough() {
    this.$fi_FollowThrough();
    this.$ctor_CardModel(1, CardType.Attack, CardRarity.Uncommon, TargetType.AllEnemies, true);
    return this;
  }
  static $new() { return new FollowThrough().$ctor_FollowThrough(); }
}

export class Grapple extends CardModel {
  static $name = "Grapple";
  static $fullName = "MegaCrit.Sts2.Core.Models.Cards.Grapple";
  get CanonicalVars() {
    return [new DamageVar().$ctor_DamageVar$2(7, ValueProp.Move), new PowerVar().$ctor_PowerVar$1(GrapplePower, 5)];
  }
  OnPlay(choiceContext, cardPlay): $.Task<void> {
    return $.async(function* () {
      ArgumentNullException$.ThrowIfNull(cardPlay.Target, "cardPlay.Target");
      yield DamageCmd.Attack$Decimal(this.DynamicVars.Damage.BaseValue).FromCard(this).Targeting(cardPlay.Target).WithHitFx("vfx/vfx_attack_slash", null, null).Execute(choiceContext);
      yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(GrapplePower, cardPlay.Target, this.DynamicVars.get_Item("GrapplePower").IntValue, this.Owner.Creature, this, false);
    }, this);
  }
  OnUpgrade(): void {
    this.DynamicVars.Damage.UpgradeValueBy(2);
    this.DynamicVars.get_Item("GrapplePower").UpgradeValueBy(2);
  }
  $fi_Grapple() {

    return this;
  }
  $ctor_Grapple() {
    this.$fi_Grapple();
    this.$ctor_CardModel(1, CardType.Attack, CardRarity.Uncommon, TargetType.AnyEnemy, true);
    return this;
  }
  static $new() { return new Grapple().$ctor_Grapple(); }
}

export class Favored extends EnchantmentModel {
  static $name = "Favored";
  static $fullName = "MegaCrit.Sts2.Core.Models.Enchantments.Favored";
  CanEnchantCardType(cardType): boolean {
    return (cardType == CardType.Attack);
  }
  EnchantDamageMultiplicative(originalDamage, props): number {
    if (!ValuePropExtensions.IsPoweredAttack(props)) {
      return 1;
    }
    return 2;
  }
  $fi_Favored() {

    return this;
  }
  $ctor_Favored() {
    this.$fi_Favored();
    this.$ctor_EnchantmentModel();
    return this;
  }
  static $new() { return new Favored().$ctor_Favored(); }
}

export class DoormakerBoss extends EncounterModel {
  static $name = "DoormakerBoss";
  static $fullName = "MegaCrit.Sts2.Core.Models.Encounters.DoormakerBoss";
  static readonly _doorSlot = "door";
  static readonly doormakerSlot = "doormaker";
  get RoomType() {
    return RoomType.Boss;
  }
  get Slots() {
    return ["doormaker", "door"];
  }
  get BossNodeSpineResource() {
    return null;
  }
  get BossNodePath() {
    return (("res://images/map/placeholder/" + (this.Id.Entry.ToLowerInvariant() ?? "")) + "_icon");
  }
  get CustomBgm() {
    return "event:/music/act3_boss_queen";
  }
  get HasCustomBackground() {
    return false;
  }
  get HasScene() {
    return true;
  }
  get AllPossibleMonsters() {
    return [ModelDb.Monster(Door), ModelDb.Monster(Doormaker)];
  }
  GetCameraScaling(): number {
    return 0.8999999761581421;
  }
  GetCameraOffset(): any {
    return Vector2$.op_Multiply(Vector2$.Down, 60);
  }
  GenerateMonsters(): [MonsterModel, string][] {
    return [[ModelDb.Monster(Door).ToMutable(), "door"]];
  }
  $fi_DoormakerBoss() {

    return this;
  }
  $ctor_DoormakerBoss() {
    this.$fi_DoormakerBoss();
    this.$ctor_EncounterModel();
    return this;
  }
  static $new() { return new DoormakerBoss().$ctor_DoormakerBoss(); }
}

export class ToadpolesNormal extends EncounterModel {
  static $name = "ToadpolesNormal";
  static $fullName = "MegaCrit.Sts2.Core.Models.Encounters.ToadpolesNormal";
  get RoomType() {
    return RoomType.Monster;
  }
  get AllPossibleMonsters() {
    return [ModelDb.Monster(Toadpole), ModelDb.Monster(CalcifiedCultist)];
  }
  GenerateMonsters(): [MonsterModel, string][] {
    return [[ModelDb.Monster(CalcifiedCultist).ToMutable(), null], [ModelDb.Monster(Toadpole).ToMutable(), null]];
  }
  $fi_ToadpolesNormal() {

    return this;
  }
  $ctor_ToadpolesNormal() {
    this.$fi_ToadpolesNormal();
    this.$ctor_EncounterModel();
    return this;
  }
  static $new() { return new ToadpolesNormal().$ctor_ToadpolesNormal(); }
}

export class Door extends MonsterModel {
  declare _dramaticOpenMove: MoveState;
  declare _deadState: MoveState;
  declare _doormaker: Creature;
  static $name = "Door";
  static $fullName = "MegaCrit.Sts2.Core.Models.Monsters.Door";
  static readonly initialMoveId = "DRAMATIC_OPEN_MOVE";
  get MinInitialHp() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.ToughEnemies, 165, 155);
  }
  get MaxInitialHp() {
    return this.MinInitialHp;
  }
  get DeadState() {
    return this._deadState;
  }
  set DeadState(value) {
    this.AssertMutable();
    this._deadState = value;
  }
  get DramaticOpenDamage() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 28, 25);
  }
  get EnforceDamage() {
    return 20;
  }
  get EnforceStrength() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 4, 3);
  }
  get DoorSlamDamage() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 15, 15);
  }
  get DoorSlamRepeat() {
    return 2;
  }
  get TakeDamageSfxType() {
    return DamageSfxType.ArmorBig;
  }
  get ShouldDisappearFromDoom() {
    return false;
  }
  get Doormaker() {
    return (this._doormaker ?? $.throw_(new InvalidOperationException$()));
  }
  set Doormaker(value) {
    this.AssertMutable();
    this._doormaker = value;
  }
  AfterAddedToRoom(): $.Task<void> {
    return $.async(function* () {
      yield MonsterModel.prototype.AfterAddedToRoom.call(this);
      yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(DoorRevivalPower, this.Creature, 1, this.Creature, null, false);
      let monster = ModelDb.Monster(Doormaker).ToMutable();
      this.Doormaker = this.CombatState.CreateCreature(monster, CombatSide.Enemy, "doormaker");
    }, this);
  }
  PrepareForRevival(): void {
    if (this._dramaticOpenMove != null) {
      this.DeadState.FollowUpState = this._dramaticOpenMove;
    }
  }
  PrepareForDeath(): void {
    this.DeadState.FollowUpState = this.DeadState;
  }
  GenerateMoveStateMachine(): MonsterMoveStateMachine {
    let list = [];
    this._dramaticOpenMove = new MoveState().$ctor_MoveState$3("DRAMATIC_OPEN_MOVE", $.bindFn(this, this.DramaticOpenMove), [new SingleAttackIntent().$ctor_SingleAttackIntent$Int32(this.DramaticOpenDamage)]);
    let dramaticOpenMove = this._dramaticOpenMove;
    let moveState = new MoveState().$ctor_MoveState$3("ENFORCE_MOVE", $.bindFn(this, this.EnforceMove), [new SingleAttackIntent().$ctor_SingleAttackIntent$Int32(this.EnforceDamage), new BuffIntent().$ctor_BuffIntent()]);
    let moveState2 = new MoveState().$ctor_MoveState$3("DOOR_SLAM_MOVE", $.bindFn(this, this.DoorSlamMove), [new MultiAttackIntent().$ctor_MultiAttackIntent$Int32_Int32(this.DoorSlamDamage, this.DoorSlamRepeat)]);
    this.DeadState = new MoveState().$ctor_MoveState$3("DEAD_MOVE", $.bindFn(this, this.DeadMove), []);
    this.DeadState.FollowUpState = this.DeadState;
    dramaticOpenMove.FollowUpState = moveState2;
    moveState2.FollowUpState = moveState;
    moveState.FollowUpState = dramaticOpenMove;
    list.Add(dramaticOpenMove);
    list.Add(moveState);
    list.Add(moveState2);
    list.Add(this.DeadState);
    return new MonsterMoveStateMachine().$ctor_MonsterMoveStateMachine(list, dramaticOpenMove);
  }
  DeadMove(targets): $.Task<void> {
    return Task$.CompletedTask;
  }
  DramaticOpenMove(targets): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.DramaticOpenDamage).FromMonster(this).WithAttackerAnim("Attack", 0.15000000596046448, null).WithHitFx("vfx/vfx_attack_blunt", null, null).Execute(null);
    }, this);
  }
  EnforceMove(targets): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.EnforceDamage).FromMonster(this).WithAttackerAnim("Attack", 0.15000000596046448, null).WithHitFx("vfx/vfx_attack_blunt", null, null).Execute(null);
      yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(StrengthPower, this.Creature, this.EnforceStrength, this.Creature, null, false);
    }, this);
  }
  DoorSlamMove(targets): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.DoorSlamDamage).WithHitCount(this.DoorSlamRepeat).FromMonster(this).WithAttackerAnim("Attack", 0.15000000596046448, null).WithHitFx("vfx/vfx_attack_blunt", null, null).Execute(null);
    }, this);
  }
  Close(): void {
    (NCombatRoom$.Instance?.GetCreatureNode(this.Creature))?.SetVisible(true);
  }
  Open(): void {
    (NCombatRoom$.Instance?.GetCreatureNode(this.Creature))?.SetVisible(false);
  }
  $fi_Door() {
    this._dramaticOpenMove = null;
    this._deadState = null;
    this._doormaker = null;
    return this;
  }
  $ctor_Door() {
    this.$fi_Door();
    this.$ctor_MonsterModel();
    return this;
  }
  static $new() { return new Door().$ctor_Door(); }
}

export class Doormaker extends MonsterModel {
  declare _visualsPaths: string[];
  declare _timesGotBackIn: number;
  static $name = "Doormaker";
  static $fullName = "MegaCrit.Sts2.Core.Models.Monsters.Doormaker";
  static readonly _doormakerTrackName = "queen_progress";
  static get _whatIsItLines() { Doormaker.$ci();
  return Object.hasOwn(Doormaker, "$s__whatIsItLines") ? Doormaker.$s__whatIsItLines : null; }
  static set _whatIsItLines(v) { Doormaker.$s__whatIsItLines = v; }
  get MinInitialHp() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.ToughEnemies, 512, 489);
  }
  get MaxInitialHp() {
    return this.MinInitialHp;
  }
  get LaserBeamDamage() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 34, 31);
  }
  get GetBackInMoveDamage() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 45, 40);
  }
  get StrengthScale() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.DeadlyEnemies, 4, 3);
  }
  get DoorHpScale() {
    return AscensionHelper.GetValueIfAscension$AscensionLevel_Int32_Int32(AscensionLevel.ToughEnemies, 25, 20);
  }
  get TakeDamageSfxType() {
    return DamageSfxType.Armor;
  }
  get TimesGotBackIn() {
    return this._timesGotBackIn;
  }
  set TimesGotBackIn(value) {
    this.AssertMutable();
    this._timesGotBackIn = value;
  }
  GenerateMoveStateMachine(): MonsterMoveStateMachine {
    let list = [];
    let moveState = new MoveState().$ctor_MoveState$3("WHAT_IS_IT_MOVE", $.bindFn(this, this.WhatIsItMove), [new StunIntent().$ctor_StunIntent()]);
    let moveState2 = new MoveState().$ctor_MoveState$3("BEAM_MOVE", $.bindFn(this, this.BeamMove), [new SingleAttackIntent().$ctor_SingleAttackIntent$Int32(this.LaserBeamDamage)]);
    let moveState3 = new MoveState().$ctor_MoveState$3("GET_BACK_IN_MOVE", $.bindFn(this, this.GetBackInMove), [new SingleAttackIntent().$ctor_SingleAttackIntent$Int32(this.GetBackInMoveDamage), new BuffIntent().$ctor_BuffIntent(), new EscapeIntent().$ctor_EscapeIntent()]);
    moveState.FollowUpState = moveState2;
    moveState2.FollowUpState = moveState3;
    moveState3.FollowUpState = moveState3;
    list.Add(moveState);
    list.Add(moveState2);
    list.Add(moveState3);
    return new MonsterMoveStateMachine().$ctor_MonsterMoveStateMachine(list, moveState);
  }
  WhatIsItMove(targets): $.Task<void> {
    let creature;
    let $L11 = 0;
    $g11: for (;;) {
      switch ($L11) {
        case 0:
          creature = Enumerable$.FirstOrDefault(this.Creature.CombatState.GetTeammatesOf(this.Creature), ((c) => (c.Monster instanceof Door)));
          if (creature == null) {
            { $L11 = 1; continue $g11; }
          }
          if (creature.IsDead) {
            let power = creature.GetPower$_T1(DoorRevivalPower);
            if ((power == null) || !power.IsHalfDead) {
              { $L11 = 1; continue $g11; }
            }
          }
          TalkCmd.Play(MonsterModel.L10NMonsterLookup(this.Rng.NextItem($.T.String, Doormaker._whatIsItLines)), this.Creature, -1, 5);
          { $L11 = 2; continue $g11; }
        case 1:
          TalkCmd.Play(MonsterModel.L10NMonsterLookup("DOORMAKER.moves.WHAT_IS_IT.deadDoorSpeakLine"), this.Creature, -1, 5);
          { $L11 = 2; continue $g11; }
        case 2:
          return Task$.CompletedTask;
      }
      break;
    }
  }
  BeamMove(targets): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.LaserBeamDamage).FromMonster(this).WithAttackerAnim("Attack", 0.15000000596046448, null).WithHitFx("vfx/vfx_attack_blunt", null, null).Execute(null);
    }, this);
  }
  GetBackInMove(targets): $.Task<void> {
    return $.async(function* () {
      yield DamageCmd.Attack$Decimal(this.GetBackInMoveDamage).FromMonster(this).WithAttackerAnim("Attack", 0.15000000596046448, null).WithHitFx("vfx/vfx_attack_blunt", null, null).Execute(null);
      if (this.Creature.IsDead) {
        return;
      }
      yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(StrengthPower, this.Creature, 5, this.Creature, null, false);
      this.TimesGotBackIn++;
      let door = Enumerable$.FirstOrDefault(this.Creature.CombatState.GetTeammatesOf(this.Creature), ((c) => (c.Monster instanceof Door)));
      if (door != null) {
        let power = door.GetPower$_T1(DoorRevivalPower);
        if (power != null) {
          yield power.DoRevive();
        }
        yield PowerCmd.SetAmount(StrengthPower, door, Math.imul(this.StrengthScale, this.TimesGotBackIn), this.Creature, null);
        yield CreatureCmd.SetMaxAndCurrentHp(door, (door.MaxHp + Math.imul(this.DoorHpScale, this.TimesGotBackIn)));
        yield Cmd.Wait$2(0.25, false);
        yield this.AnimOut();
        CombatManager.Instance.RemoveCreature(this.Creature);
        this.CombatState.RemoveCreature(this.Creature, false);
        yield Cmd.Wait$2(0.25, false);
      } else {
        yield this.AnimOut();
        yield CreatureCmd.Escape(this.Creature, false);
      }
    }, this);
  }
  RemoveCreatureWhenDone(creatureNode, tween): $.Task<void> {
    return $.async(function* () {
      yield tween.ToSignal(tween, Tween_SignalName$.Finished);
      NCombatRoom$.Instance?.RemoveCreatureNode(creatureNode);
      GodotTreeExtensions.QueueFreeSafely(creatureNode);
    }, this);
  }
  AnimOut(): $.Task<void> {
    return $.async(function* () {
      let nCreature = NCombatRoom$.Instance?.GetCreatureNode(this.Creature);
      if (nCreature != null) {
        let scale = nCreature.Visuals.Body.Scale;
        nCreature.ToggleIsInteractable(false);
        let tween = nCreature.CreateTween();
        tween.TweenProperty(nCreature.Visuals.Body, "scale", Vector2$.op_Multiply(scale, 0.5), 1.2000000476837158).SetEase(1 /*EaseType.Out*/).SetTrans(1 /*TransitionType.Sine*/);
        tween.Parallel().TweenProperty(nCreature.Visuals.Body, "modulate", Colors$.Black, 0.25).From(Colors$.White);
        tween.Parallel().TweenProperty(nCreature.Visuals.Body, "modulate", Colors$.Transparent, 0.25).From(Colors$.Black).SetDelay(0.25);
        TaskHelper.RunSafely(this.RemoveCreatureWhenDone(nCreature, tween));
        yield Cmd.CustomScaledWait(0.20000000298023224, 0.6000000238418579, false, $.defaultOf(CancellationToken$));
      }
    }, this);
  }
  AfterDeath(choiceContext, creature, wasRemovalPrevented, deathAnimLength): $.Task<void> {
    if (creature != this.Creature) {
      return Task$.CompletedTask;
    }
    NRunMusicController$.Instance?.UpdateMusicParameter("queen_progress", 5);
    return Task$.CompletedTask;
  }
  AnimIn(): $.Task<void> {
    return $.async(function* () {
      let nCreature = NCombatRoom$.Instance?.GetCreatureNode(this.Creature);
      NRunMusicController$.Instance?.UpdateMusicParameter("queen_progress", 1);
      if (nCreature != null) {
        let scale = nCreature.Visuals.Body.Scale;
        (nCreature.Visuals.Body).Texture = PreloadManager.Cache.GetTexture2D(ImageHelper.GetImagePath(this._visualsPaths[(this.TimesGotBackIn % this._visualsPaths.length)]));
        let tween = nCreature.CreateTween();
        tween.TweenProperty(nCreature.Visuals.Body, "scale", scale, 1.2000000476837158).From(Vector2$.op_Multiply(scale, 0.5)).SetEase(1 /*EaseType.Out*/).SetTrans(1 /*TransitionType.Sine*/);
        tween.Parallel().TweenProperty(nCreature.Visuals.Body, "modulate", Colors$.Black, 0.25).From(Colors$.Transparent);
        tween.Parallel().TweenProperty(nCreature.Visuals.Body, "modulate", Colors$.White, 0.25).From(Colors$.Black).SetDelay(0.25);
        TaskHelper.RunSafely(this.PlayLineAfterAnimIn(tween));
        yield Cmd.CustomScaledWait(0.20000000298023224, 0.6000000238418579, false, $.defaultOf(CancellationToken$));
      }
    }, this);
  }
  PlayLineAfterAnimIn(tween): $.Task<void> {
    return $.async(function* () {
      yield tween.ToSignal(tween, Tween_SignalName$.Finished);
      if (this.Creature.CombatState == null) {
        return;
      }
      let creature = Enumerable$.FirstOrDefault(this.Creature.CombatState.GetTeammatesOf(this.Creature), ((c) => (c.Monster instanceof Door)));
      let num;
      if (creature != null) {
        if (creature.IsDead) {
          let power = creature.GetPower$_T1(DoorRevivalPower);
          num = ((power == null) || !power.IsHalfDead ? 1 : 0);
        } else {
          num = 0;
        }
      } else {
        num = 1;
      }
      let line = (num != 0 ? MonsterModel.L10NMonsterLookup("DOORMAKER.moves.WHAT_IS_IT.deadDoorSpeakLine") : (this.TimesGotBackIn != 0 ? MonsterModel.L10NMonsterLookup(this.Rng.NextItem($.T.String, Doormaker._whatIsItLines)) : MonsterModel.L10NMonsterLookup("DOORMAKER.moves.WHAT_IS_IT.speakLineInitial")));
      TalkCmd.Play(line, this.Creature, -1, 5);
    }, this);
  }
  static $cctor() {
    let num = 2;
    let list = [];
    CollectionsMarshal$.SetCount(list, num);
    let span = CollectionsMarshal$.AsSpan(list);
    let num2 = 0;
    span[num2] = "DOORMAKER.moves.WHAT_IS_IT.speakLine1";
    num2++;
    span[num2] = "DOORMAKER.moves.WHAT_IS_IT.speakLine2";
    Doormaker._whatIsItLines = list;
  }
  $fi_Doormaker() {
    this._visualsPaths = ["monsters/beta/door_maker_placeholder_2.png", "monsters/beta/door_maker_placeholder_3.png", "monsters/beta/door_maker_placeholder_4.png"];
    this._timesGotBackIn = 0;
    return this;
  }
  static $ci() { if (!Object.hasOwn(Doormaker, "$cdone")) { Doormaker.$cdone = true; Doormaker.$cctor(); } }
  $ctor_Doormaker() {
    this.$fi_Doormaker();
    this.$ctor_MonsterModel();
    return this;
  }
  static $new() { return new Doormaker().$ctor_Doormaker(); }
}

export class BladeOfInkPower extends PowerModel {
  static $name = "BladeOfInkPower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.BladeOfInkPower";
  static readonly _strengthAppliedKey = "StrengthApplied";
  get Type() {
    return PowerType.Buff;
  }
  get StackType() {
    return PowerStackType.Counter;
  }
  get ExtraHoverTips() {
    return [HoverTipFactory.FromPower$_T1(StrengthPower)];
  }
  get CanonicalVars() {
    return [new DynamicVar().$ctor_DynamicVar("StrengthApplied", 0)];
  }
  AfterCardPlayed(context, cardPlay): $.Task<void> {
    return $.async(function* () {
      if ((cardPlay.Card.Owner == this.Owner.Player) && (cardPlay.Card.Type == CardType.Attack)) {
        this.Flash();
        yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(StrengthPower, this.Owner, this.Amount, this.Owner, null, true);
        this.DynamicVars.get_Item("StrengthApplied").BaseValue = $.dm(this.DynamicVars.get_Item("StrengthApplied").BaseValue + this.Amount);
        this.InvokeDisplayAmountChanged();
      }
    }, this);
  }
  AfterTurnEnd(choiceContext, side): $.Task<void> {
    return $.async(function* () {
      if (side == this.Owner.Side) {
        yield PowerCmd.Apply$Creature_Decimal_Creature_CardModel_Boolean_T1(StrengthPower, this.Owner, (-this.DynamicVars.get_Item("StrengthApplied").BaseValue), this.Owner, null, true);
        yield PowerCmd.Remove$PowerModel(this);
      }
    }, this);
  }
  $fi_BladeOfInkPower() {

    return this;
  }
  $ctor_BladeOfInkPower() {
    this.$fi_BladeOfInkPower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new BladeOfInkPower().$ctor_BladeOfInkPower(); }
}

export class DiamondDiademPower extends PowerModel {
  static $name = "DiamondDiademPower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.DiamondDiademPower";
  get Type() {
    return PowerType.Buff;
  }
  get StackType() {
    return PowerStackType.Single;
  }
  ModifyDamageMultiplicative(target, amount, props, dealer, cardSource): number {
    if (target != this.Owner) {
      return 1;
    }
    if (!ValuePropExtensions.IsPoweredAttack(props)) {
      return 1;
    }
    return 0.5;
  }
  AfterTurnEnd(choiceContext, side): $.Task<void> {
    return $.async(function* () {
      if (side == CombatSide.Enemy) {
        yield PowerCmd.Remove$PowerModel(this);
      }
    }, this);
  }
  $fi_DiamondDiademPower() {

    return this;
  }
  $ctor_DiamondDiademPower() {
    this.$fi_DiamondDiademPower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new DiamondDiademPower().$ctor_DiamondDiademPower(); }
}

export class DoorRevivalPower extends PowerModel {
  static $name = "DoorRevivalPower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.DoorRevivalPower";
  get Type() {
    return PowerType.Buff;
  }
  get StackType() {
    return PowerStackType.Single;
  }
  get IsVisibleInternal() {
    return false;
  }
  get IsHalfDead() {
    return this.GetInternalData(DoorRevivalPower_Data).isHalfDead;
  }
  InitInternalData(): any {
    return new DoorRevivalPower_Data().$ctor_DoorRevivalPower_Data();
  }
  BeforeDeath(creature): $.Task<void> {
    if (creature != this.Owner) {
      return Task$.CompletedTask;
    }
    this.GetInternalData(DoorRevivalPower_Data).isHalfDead = true;
    return Task$.CompletedTask;
  }
  AfterDeath(choiceContext, creature, wasRemovalPrevented, deathAnimLength): $.Task<void> {
    return $.async(function* () {
      if (creature == this.Owner) {
        if (wasRemovalPrevented) {
          this.GetInternalData(DoorRevivalPower_Data).isHalfDead = false;
          return;
        }
        let door = this.Owner.Monster;
        door.PrepareForDeath();
        door.SetMoveImmediate(door.DeadState, false);
        door.Open();
        yield CreatureCmd.Add$Creature(door.Doormaker);
        let doormaker = door.Doormaker.Monster;
        yield doormaker.AnimIn();
      }
    }, this);
  }
  DoRevive(): $.Task<void> {
    return $.async(function* () {
      this.GetInternalData(DoorRevivalPower_Data).isHalfDead = false;
      let door = this.Owner.Monster;
      yield CreatureCmd.SetMaxHp(this.Owner, this.Owner.Monster.MinInitialHp);
      yield CreatureCmd.Heal(this.Owner, this.Owner.MaxHp, true);
      door.PrepareForRevival();
      door.Close();
    }, this);
  }
  ShouldAllowHitting(creature): boolean {
    if (creature != this.Owner) {
      return true;
    }
    return !this.IsHalfDead;
  }
  ShouldStopCombatFromEnding(): boolean {
    if (!this.IsHalfDead) {
      return false;
    }
    let door = this.Owner.Monster;
    return door.Doormaker.IsAlive;
  }
  ShouldCreatureBeRemovedFromCombatAfterDeath(creature): boolean {
    if (creature == this.Owner) {
      return false;
    }
    let door = this.Owner.Monster;
    if ((creature == door.Doormaker) && !this.Owner.CombatState.ContainsCreature(creature)) {
      return false;
    }
    return true;
  }
  ShouldPowerBeRemovedAfterOwnerDeath(): boolean {
    return false;
  }
  $fi_DoorRevivalPower() {

    return this;
  }
  $ctor_DoorRevivalPower() {
    this.$fi_DoorRevivalPower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new DoorRevivalPower().$ctor_DoorRevivalPower(); }
}

export class DrumOfBattlePower extends PowerModel {
  static $name = "DrumOfBattlePower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.DrumOfBattlePower";
  get Type() {
    return PowerType.Buff;
  }
  get StackType() {
    return PowerStackType.Counter;
  }
  get ExtraHoverTips() {
    return [HoverTipFactory.FromKeyword(CardKeyword.Exhaust)];
  }
  BeforeHandDrawLate(player, choiceContext, combatState): $.Task<void> {
    return $.async(function* () {
      if (player.Creature != this.Owner) {
        return;
      }
      this.Flash();
      let drawPile = PileTypeExtensions.GetPile(PileType.Draw, this.Owner.Player);
      for (let i = 0; i < this.Amount; i++) {
        yield CardPileCmd.ShuffleIfNecessary(choiceContext, this.Owner.Player);
        let cardModel = Enumerable$.FirstOrDefault(drawPile.Cards);
        if (cardModel != null) {
          yield CardCmd.Exhaust(choiceContext, cardModel, false, false);
        }
      }
    }, this);
  }
  $fi_DrumOfBattlePower() {

    return this;
  }
  $ctor_DrumOfBattlePower() {
    this.$fi_DrumOfBattlePower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new DrumOfBattlePower().$ctor_DrumOfBattlePower(); }
}

export class GrapplePower extends PowerModel {
  static $name = "GrapplePower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.GrapplePower";
  get Type() {
    return PowerType.Debuff;
  }
  get StackType() {
    return PowerStackType.Counter;
  }
  get IsInstanced() {
    return true;
  }
  AfterBlockGained(creature, amount, props, cardSource): $.Task<void> {
    return $.async(function* () {
      if (!(amount <= 0) && (creature == this.Applier)) {
        this.Flash();
        yield CreatureCmd.Damage$PlayerChoiceContext_Creature_Decimal_ValueProp_Creature_CardModel(new ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), this.Owner, this.Amount, ValueProp.Unpowered, this.Owner, null);
      }
    }, this);
  }
  AfterTurnEnd(choiceContext, side): $.Task<void> {
    return $.async(function* () {
      yield PowerCmd.Remove$PowerModel(this);
    }, this);
  }
  $fi_GrapplePower() {

    return this;
  }
  $ctor_GrapplePower() {
    this.$fi_GrapplePower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new GrapplePower().$ctor_GrapplePower(); }
}

export class OutbreakPower extends PowerModel {
  static $name = "OutbreakPower";
  static $fullName = "MegaCrit.Sts2.Core.Models.Powers.OutbreakPower";
  static readonly poisonThreshold = 3;
  get Type() {
    return PowerType.Buff;
  }
  get StackType() {
    return PowerStackType.Counter;
  }
  get DisplayAmount() {
    return this.GetInternalData(OutbreakPower_Data).timesPoisoned;
  }
  get CanonicalVars() {
    return [new RepeatVar().$ctor_RepeatVar$1(3)];
  }
  get ExtraHoverTips() {
    return [HoverTipFactory.FromPower$_T1(PoisonPower)];
  }
  InitInternalData(): any {
    return new OutbreakPower_Data().$ctor_OutbreakPower_Data();
  }
  AfterPowerAmountChanged(power, amount, applier, cardSource): $.Task<void> {
    return $.async(function* () {
      if (((applier == this.Owner) && !(amount <= 0)) && (power instanceof PoisonPower)) {
        let data = this.GetInternalData(OutbreakPower_Data);
        data.timesPoisoned++;
        if (data.timesPoisoned >= 3) {
          this.InvokeDisplayAmountChanged();
          this.Flash();
          yield CreatureCmd.Damage$PlayerChoiceContext_IEnumerableCreature_Decimal_ValueProp_Creature_CardModel(new ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), this.Owner.CombatState.HittableEnemies, this.Amount, ValueProp.Unpowered, this.Owner, null);
          data.timesPoisoned %= 3;
        }
        this.InvokeDisplayAmountChanged();
      }
    }, this);
  }
  $fi_OutbreakPower() {

    return this;
  }
  $ctor_OutbreakPower() {
    this.$fi_OutbreakPower();
    this.$ctor_PowerModel();
    return this;
  }
  static $new() { return new OutbreakPower().$ctor_OutbreakPower(); }
}

export enum BattlewornDummyEventEncounter_DummySetting { None = 0, Setting1 = 1, Setting2 = 2, Setting3 = 3, }
$.enumMeta(BattlewornDummyEventEncounter_DummySetting, "DummySetting", false);

export class BattlewornDummyEventEncounter extends EncounterModel {
  declare _setting: BattlewornDummyEventEncounter_DummySetting;
  declare _ranOutOfTime: boolean;
  static $name = "BattlewornDummyEventEncounter";
  static $fullName = "MegaCrit.Sts2.Core.Models.Encounters.BattlewornDummyEventEncounter";
  static readonly _settingKey = "Setting";
  static readonly _ranOutOfTimeKey = "RanOutOfTime";
  get RoomType() {
    return RoomType.Monster;
  }
  get ShouldGiveRewards() {
    return false;
  }
  get Setting() {
    return this._setting;
  }
  set Setting(value) {
    this.AssertMutable();
    this._setting = value;
  }
  get RanOutOfTime() {
    return this._ranOutOfTime;
  }
  set RanOutOfTime(value) {
    this.AssertMutable();
    this._ranOutOfTime = value;
  }
  get AllPossibleMonsters() {
    return [ModelDb.Monster(BattleFriendV1), ModelDb.Monster(BattleFriendV2), ModelDb.Monster(BattleFriendV3)];
  }
  GenerateMonsters(): [MonsterModel, string][] {
    let $s1411;
    return [[($s1411 = this.Setting, ($s1411 == BattlewornDummyEventEncounter_DummySetting.Setting1 ? ModelDb.Monster(BattleFriendV1) : ($s1411 == BattlewornDummyEventEncounter_DummySetting.Setting2 ? ModelDb.Monster(BattleFriendV2) : ($s1411 == BattlewornDummyEventEncounter_DummySetting.Setting3 ? ModelDb.Monster(BattleFriendV3) : $.throw_(new InvalidOperationException$("Setting must be set!")))))).ToMutable(), null]];
  }
  SaveCustomState(): $.Dictionary<string, string> {
    let $o1412;
    return ($o1412 = new Dictionary$(), $o1412.set_Item("Setting", $.enumStr(BattlewornDummyEventEncounter_DummySetting, this.Setting)), $o1412.set_Item("RanOutOfTime", $.str(this.RanOutOfTime)), $o1412);
  }
  LoadCustomState(state): void {
    this.Setting = Enum$.Parse(BattlewornDummyEventEncounter_DummySetting, state.get_Item("Setting"));
    this.RanOutOfTime = Boolean$.Parse(state.get_Item("RanOutOfTime"));
  }
  $fi_BattlewornDummyEventEncounter() {
    this._setting = 0;
    this._ranOutOfTime = false;
    return this;
  }
  $ctor_BattlewornDummyEventEncounter() {
    this.$fi_BattlewornDummyEventEncounter();
    this.$ctor_EncounterModel();
    return this;
  }
  static $new() { return new BattlewornDummyEventEncounter().$ctor_BattlewornDummyEventEncounter(); }
}
