import { describe, expect, it } from 'vitest';
import { boot } from './helpers';

function savedRelic(G: any, entry: string, name: string, value: number) {
  return G.$.restore({
    $t: 'MegaCrit.Sts2.Core.Saves.Runs.SerializableRelic',
    Id: { $t: 'MegaCrit.Sts2.Core.Models.ModelId', $_Category: 'RELIC', $_Entry: entry },
    Props: { $t: 'MegaCrit.Sts2.Core.Saves.Runs.SavedProperties', ints: [
      { $t: 'MegaCrit.Sts2.Core.Saves.Runs.SavedProperties+SavedProperty`1', name, value },
    ] },
    FloorAddedToDeck: 5,
  });
}

describe('shipped relic states', () => {
  it('Lasting Candy keeps its combat counter and trigger after loading and re-saving', async () => {
    const G: any = boot();
    let relic = G.RelicModel.FromSerializable(savedRelic(G, 'LASTING_CANDY', 'CombatsSeen', 3));
    expect(relic.Id.Entry).toBe('LASTING_CANDY');
    expect(relic.CombatsSeen).toBe(3);
    expect(relic.IsInTriggeringCombat).toBe(false);
    relic.Owner = { Creature: { IsDead: false } };
    await relic.AfterCombatEnd(null);
    expect(relic.CombatsSeen).toBe(4);
    expect(relic.IsInTriggeringCombat).toBe(true);
    relic = G.RelicModel.FromSerializable(G.$.restore(G.$.snapshot(relic.ToSerializable())));
    expect(relic.CombatsSeen).toBe(4);
    expect(relic.IsInTriggeringCombat).toBe(true);
    expect(relic.FloorAddedToDeck).toBe(5);
    expect(relic.Description.LocEntryKey).toBe('WEB_LEGACY_LASTING_CANDY.description');
  });

  it('Pumpkin Candle retains energy for its original act, then extinguishes', () => {
    const G: any = boot();
    let relic = G.RelicModel.FromSerializable(savedRelic(G, 'PUMPKIN_CANDLE', 'ActiveAct', 1));
    relic = G.RelicModel.FromSerializable(G.$.restore(G.$.snapshot(relic.ToSerializable())));
    const owner = { RunState: { CurrentActIndex: 1 } };
    relic.Owner = owner;
    expect(relic.ActiveAct).toBe(1);
    expect(relic.ModifyMaxEnergy(owner, 3)).toBe(4);
    owner.RunState.CurrentActIndex = 2;
    expect(relic.ModifyMaxEnergy(owner, 3)).toBe(3);
    expect(relic.Description.LocEntryKey).toBe('WEB_LEGACY_PUMPKIN_CANDLE.description');
  });

  it('newly acquired relics still use beta counters and effects', () => {
    const G: any = boot();
    const candy = G.ModelDb.Relic(G.LastingCandy).ToMutable();
    candy.CombatRewardsSeen = 3;
    const loadedCandy = G.RelicModel.FromSerializable(candy.ToSerializable());
    expect(loadedCandy.constructor).toBe(G.LastingCandy);
    expect(loadedCandy.CombatRewardsSeen).toBe(3);
    const candle = G.ModelDb.Relic(G.PumpkinCandle).ToMutable();
    candle.KindleCount = 4;
    const loadedCandle = G.RelicModel.FromSerializable(candle.ToSerializable());
    expect(loadedCandle.constructor).toBe(G.PumpkinCandle);
    expect(loadedCandle.KindleCount).toBe(4);
  });

  it('a saved Lasting Candy can still add a power to beta card rewards', async () => {
    const G: any = boot();
    if (G.RunManager.Instance.IsInProgress) G.RunManager.Instance.CleanUp(true);
    const run = await G.startNewSingleplayerRun({ character: G.ModelDb.Character(G.Ironclad), seed: 'LEGACYRELIC' });
    const owner = run.Players[0];
    const relic = G.RelicModel.FromSerializable(savedRelic(G, 'LASTING_CANDY', 'CombatsSeen', 2));
    relic.Owner = owner;
    const options = G.CardCreationOptions.ForRoom(owner, G.RoomType.Monster);
    const rewards: any[] = [...G.CardFactory.CreateForReward(owner, 3, options)];
    expect(relic.TryModifyCardRewardOptions(owner, rewards, options)).toBe(true);
    expect(rewards).toHaveLength(4);
    expect(rewards[3].Card.Type).toBe(G.CardType.Power);
  });
});
