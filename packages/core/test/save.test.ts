import { describe, it, expect } from 'vitest';
import { boot } from './helpers';

describe('GodotFileIo', () => {
  it('returns null for a missing file and can read an existing file afterwards', () => {
    const G: any = boot();
    const io = new G.GodotFileIo();
    io.SaveDir = 'user://missing-file-test';
    expect(io.ReadFile('leaderboards.save')).toBeNull();
    io.WriteFile$String_String('progress.save', '{"runs":3}');
    expect(io.ReadFile('progress.save')).toBe('{"runs":3}');
    expect(io.ReadFile('leaderboards.save')).toBeNull();
    expect(io.ReadFile('progress.save')).toBe('{"runs":3}');
  });

  it('writes through a .tmp that is gone afterwards (sync and async)', async () => {
    const G: any = boot();
    const io = new G.GodotFileIo();
    io.SaveDir = 'user://savetest';
    io.WriteFile$String_String('a.save', '{"a":1}');
    await io.WriteFileAsync$String_String('b.run', '{"b":2}');
    const files = G.$.vfs.list('user://savetest');
    expect(files.filter((f: string) => f.endsWith('.tmp'))).toEqual([]);
    expect(G.$.vfs.read('user://savetest/a.save')).toBe('{"a":1}');
    expect(G.$.vfs.read('user://savetest/b.run')).toBe('{"b":2}');
  });
});

describe('SavedProperty round trip', () => {
  it('every relic survives ToSerializable → FromSerializable (FUR_COAT int[], PAELS_TOOTH empty list)', () => {
    const G: any = boot();
    const bad: string[] = [];
    for (const r of [...G.ModelDb.AllRelics]) {
      try { G.RelicModel.FromSerializable(r.ToMutable().ToSerializable()); } catch (e) { bad.push(`${r.Id.Entry}: ${e}`); }
    }
    expect(bad).toEqual([]);
    const fur = [...G.ModelDb.AllRelics].find((r: any) => r.Id.Entry === 'FUR_COAT').ToMutable();
    fur.FurCoatCoordCols = [3, 1]; fur.FurCoatCoordRows = [5, 7]; fur.FurCoatCoordsSet = true;
    const back = G.RelicModel.FromSerializable(fur.ToSerializable());
    expect([...back.FurCoatCoordCols]).toEqual([3, 1]);
    expect([...back.FurCoatCoordRows]).toEqual([5, 7]);
  });
});

describe('model round trips', () => {
  it('every card, enchanted card and potion survives ToSerializable → FromSerializable', () => {
    const G: any = boot();
    const bad: string[] = [];
    for (const c of [...G.ModelDb.AllCards]) {
      try {
        const m = c.ToMutable();
        const back = G.CardModel.FromSerializable(m.ToSerializable());
        if (back.Id.Entry !== c.Id.Entry) bad.push(`card ${c.Id.Entry}: came back as ${back.Id.Entry}`);
      } catch (e) { bad.push(`card ${c.Id.Entry}: ${e}`); }
    }
    for (const p of [...G.ModelDb.AllPotions]) {
      try { G.PotionModel.FromSerializable(p.ToMutable().ToSerializable(0)); } catch (e) { bad.push(`potion ${p.Id.Entry}: ${e}`); }
    }
    expect(bad).toEqual([]);
  });
});

describe('v0.113.1 save compatibility', () => {
  it('migrates GameMode.Custom (3) and nested RewardType.SpecialCard (6) only when $webSaveVersion < 3', () => {
    const G: any = boot();
    const reward = (rt: number) => ({
      $t: 'MegaCrit.Sts2.Core.Saves.Runs.SerializableReward',
      RewardType: rt,
    });
    const run = (ver: number | undefined, gm: number, rt: number) => ({
      ...(ver !== undefined ? { $webSaveVersion: ver } : {}),
      $t: 'MegaCrit.Sts2.Core.Saves.SerializableRun',
      GameMode: gm,
      IsCustomGame: false,
      PreFinishedRoom: {
        $t: 'MegaCrit.Sts2.Core.Saves.Runs.SerializableRoom',
        Rewards: [reward(rt)],
      },
    });
    // v0.111.0 ($webSaveVersion=2) 与 v0.98.3 (无版本标记) 必须转换旧枚举值
    for (const ver of [undefined, 2]) {
      const restored = G.$.restore(run(ver, 3, 6));
      expect(restored.GameMode).toBe(G.GameMode.Standard);
      expect(restored.IsCustomGame).toBe(true);
      expect(restored.PreFinishedRoom.Rewards[0].RewardType).toBe(G.RewardType.SpecialCard);

      const hist = G.$.restore({
        ...(ver !== undefined ? { $webSaveVersion: ver } : {}),
        $t: 'MegaCrit.Sts2.Core.Runs.RunHistory',
        GameMode: 3,
        IsCustomGame: false,
      });
      expect(hist.GameMode).toBe(G.GameMode.Standard);
      expect(hist.IsCustomGame).toBe(true);
    }

    // $webSaveVersion=3 的新版存档保留 Dread(3) 与 UpgradeCard(6)
    const v3Run = G.$.restore(run(3, 3, 6));
    expect(v3Run.GameMode).toBe(G.GameMode.Dread);
    expect(v3Run.IsCustomGame).toBe(false);
    expect(v3Run.PreFinishedRoom.Rewards[0].RewardType).toBe(G.RewardType.UpgradeCard);

    const v3Hist = G.$.restore({
      $webSaveVersion: 3,
      $t: 'MegaCrit.Sts2.Core.Runs.RunHistory',
      GameMode: 3,
      IsCustomGame: false,
    });
    expect(v3Hist.GameMode).toBe(G.GameMode.Dread);
    expect(v3Hist.IsCustomGame).toBe(false);
  });

  it('fills missing NonCombatGeneration RNG counter in v0.98.3 SerializablePlayerRngSet', () => {
    const G: any = boot();
    const raw = {
      $t: 'MegaCrit.Sts2.Core.Saves.SerializablePlayerRngSet',
      Seed: 12345,
      Counters: { $d: [[0, 3], [1, 2], [2, 5]] }, // 缺少 NonCombatGeneration (3)
    };
    const dto = G.$.restore(raw);
    const rngSet = G.PlayerRngSet.FromSerializable(dto);
    expect(rngSet.GetRng(G.PlayerRngType.Rewards)._counter).toBe(3);
    expect(rngSet.GetRng(G.PlayerRngType.NonCombatGeneration)._counter).toBe(0);
  });
});
