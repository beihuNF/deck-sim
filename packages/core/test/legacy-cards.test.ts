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
});
