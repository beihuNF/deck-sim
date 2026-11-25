import { describe, expect, it } from 'vitest';
import { boot } from './helpers';
import { travelTo, until } from './autoplay';

async function fight(character: string) {
  const G: any = boot();
  if (G.RunManager.Instance.IsInProgress) G.RunManager.Instance.CleanUp(true);
  const run = await G.startNewSingleplayerRun({ character: G.ModelDb.Character(G[character]), seed: 'LEGACYCARDS' });
  const first = Array.from(run.Map.StartingMapPoint.Children)[0];
  await travelTo(G, run, first);
  expect(await until(() => G.CombatManager.Instance.IsInProgress && G.CombatManager.Instance.IsPlayPhase)).toBe(true);
  expect(G.RunManager.Instance.ActionQueueSynchronizer.CombatState).toBe(G.ActionSynchronizerCombatState.PlayPhase);
  const me = run.Players[0], cs = run.CurrentRoom.CombatState;
  const enemy: any = Array.from(cs.Enemies).find((e: any) => e.IsHittable);
  enemy.SetMaxHpInternal(1000);
  enemy.SetCurrentHpInternal(1000); // keep the encounter alive while checking card hooks
  const add = (type: string) => {
    const card = cs.CreateCard$Player_T1(G[type], me);
    me.PlayerCombatState.Hand.AddInternal(card);
    return card;
  };
  return { G, me, enemy, add };
}

describe('retired cards in existing decks', () => {
  it('Follow Through still weakens enemies after a skill', async () => {
    const { G, me, enemy, add } = await fight('Silent');
    const skill = add('DefendSilent'), card = add('FollowThrough');
    expect(skill.TryManualPlay(null)).toBe(true);
    await until(() => me.Creature.Block > 0);
    expect(card.TryManualPlay(null)).toBe(true);
    await until(() => enemy.GetPowerAmount(G.WeakPower) > 0);
    expect(enemy.GetPowerAmount(G.WeakPower)).toBe(1);
  }, 30000);

  it('Grapple still deals additional damage when its player gains block', async () => {
    const { G, me, enemy, add } = await fight('Ironclad');
    const card = add('Grapple'), skill = add('DefendIronclad');
    expect(card.TryManualPlay(enemy)).toBe(true);
    await until(() => enemy.GetPowerAmount(G.GrapplePower) > 0);
    const hp = enemy.CurrentHp;
    expect(skill.TryManualPlay(null)).toBe(true);
    await until(() => enemy.CurrentHp < hp);
    expect(enemy.CurrentHp).toBe(hp - 5);
  }, 30000);

  it('OutbreakPower triggers AoE damage after 3 poison applications without overload mismatch', async () => {
    const { G, me, enemy } = await fight('Silent');
    await G.PowerCmd.Apply$PlayerChoiceContext_Creature_Decimal_Creature_CardModel_Boolean_T1(
      G.OutbreakPower, new G.ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), me.Creature, 11, me.Creature, null, true);
    const hp = enemy.CurrentHp;
    for (let i = 0; i < 3; i++) {
      await G.PowerCmd.Apply$PlayerChoiceContext_Creature_Decimal_Creature_CardModel_Boolean_T1(
        G.PoisonPower, new G.ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), enemy, 1, me.Creature, null, true);
    }
    expect(enemy.CurrentHp).toBe(hp - 11);
  }, 30000);

  it('DoorRevivalPower AfterDeath ignores non-null source and Doormaker.AnimOut uses SetIsInteractable', async () => {
    const { G, me } = await fight('Ironclad');
    const power = G.ModelDb.Power(G.DoorRevivalPower).ToMutable();
    let opened = false;
    let animInCalled = false;
    const doorMonster = {
      PrepareForDeath() {},
      SetMoveImmediate() {},
      Open() { opened = true; },
      DeadState: {},
      Doormaker: {
        Monster: {
          AnimIn() { animInCalled = true; return G.$.Task.CompletedTask; },
        },
      },
    };
    const origAdd = G.CreatureCmd.Add$Creature;
    G.CreatureCmd.Add$Creature = () => G.$.Task.CompletedTask;
    try {
      const doorCreature = { Monster: doorMonster };
      power._owner = doorCreature;
      power.BeforeDeath(doorCreature);
      expect(power.IsHalfDead).toBe(true);
      // v0.113.1 第 3 参为 source（非 null 的 CardModel），不应被误判为 wasRemovalPrevented
      await power.AfterDeath(new G.ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), doorCreature, me.Deck.Cards[0], false, 0);
      expect(opened).toBe(true);
      expect(animInCalled).toBe(true);
    } finally {
      G.CreatureCmd.Add$Creature = origAdd;
    }

    // Doormaker.AnimOut 调用 SetIsInteractable(false) 而非已删除的 ToggleIsInteractable
    const doormaker = G.ModelDb.Monster(G.Doormaker).ToMutable();
    const dmCreature = { Monster: doormaker };
    doormaker.Creature = dmCreature;
    let interactable: boolean | undefined;
    const NCombatRoom = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom');
    const origRoom = NCombatRoom.Instance;
    NCombatRoom.Instance = {
      GetCreatureNode: () => ({
        Visuals: { Body: { Scale: new G.$.Vector2(1, 1) } },
        SetIsInteractable: (v: boolean) => { interactable = v; },
        CreateTween: () => new G.$.WebTween(),
      }),
    };
    try {
      await doormaker.AnimOut();
      expect(interactable).toBe(false);
    } finally {
      NCombatRoom.Instance = origRoom;
    }
  }, 30000);
});
