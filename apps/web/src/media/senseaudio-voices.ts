/**
 * SenseAudio TTS voice catalogue, used to populate the voice picker's
 * `<datalist>` in the new-project audio surface. Source:
 * https://docs.senseaudio.cn/guides/voice/catalog
 *
 * This is a UI convenience only — the daemon's renderSenseAudioTTS accepts
 * ANY voice_id string and just forwards it upstream, so the picker stays an
 * editable combobox (datalist): users pick a catalogue voice by friendly
 * name, or type a custom / premium-tier id the catalogue doesn't list.
 * Because the daemon never validates against this list, it does not need a
 * mirror copy — keeping the catalogue web-only avoids registry drift.
 */

export interface SenseAudioVoice {
  /** voice_id sent on the wire (voice_setting.voice_id). */
  id: string;
  /** Display name from the catalogue. */
  name: string;
  /** Coarse gender/age bucket for the option label. */
  kind: 'male' | 'female' | 'child';
}

export const SENSEAUDIO_VOICES: SenseAudioVoice[] = [
  { id: 'male_0029_a', name: '利落青年', kind: 'male' },
  { id: 'female_0038_a', name: '亲切女孩', kind: 'female' },
  { id: 'female_0037_a', name: '自然少女', kind: 'female' },
  { id: 'female_0036_a', name: '青春女声', kind: 'female' },
  { id: 'female_0016_a', name: '俏皮女孩', kind: 'female' },
  { id: 'male_0025_a', name: '温柔霸总', kind: 'male' },
  { id: 'female_0015_a', name: '哭泣少女', kind: 'female' },
  { id: 'female_0011_a', name: '美艳女人', kind: 'female' },
  { id: 'male_0017_a', name: '温柔青年', kind: 'male' },
  { id: 'female_0030_b', name: '沉稳帅姐', kind: 'female' },
  { id: 'male_0014_a', name: '风流浪子', kind: 'male' },
  { id: 'male_0021_a', name: '柔弱公子', kind: 'male' },
  { id: 'female_0012_a', name: '刁蛮小姐', kind: 'female' },
  { id: 'male_0008_a', name: '霸道男神', kind: 'male' },
  { id: 'male_0022_a', name: '阳光少年', kind: 'male' },
  { id: 'female_0030_e', name: '贴心女人', kind: 'female' },
  { id: 'male_0004_a', name: '儒雅道长', kind: 'male' },
  { id: 'female_0018_a', name: '森系少女', kind: 'female' },
  { id: 'female_0004_a', name: '乐天女孩', kind: 'female' },
  { id: 'male_0006_a', name: '纨绔青年', kind: 'male' },
  { id: 'female_0001_a', name: '战场指挥', kind: 'female' },
  { id: 'male_0009_a', name: '潇洒青叔', kind: 'male' },
  { id: 'female_0030_f', name: '心机少女', kind: 'female' },
  { id: 'female_0019_a', name: '冷艳御姐', kind: 'female' },
  { id: 'male_0005_a', name: '惬意老翁', kind: 'male' },
  { id: 'female_0023_a', name: '羞涩甜妹', kind: 'female' },
  { id: 'female_0030_a', name: '凌厉御姐', kind: 'female' },
  { id: 'female_0003_a', name: '傲娇少女', kind: 'female' },
  { id: 'male_0003_a', name: '暴躁大叔', kind: 'male' },
  { id: 'child_0001_a', name: '可爱萌娃', kind: 'child' },
  { id: 'female_0017_a', name: '冷酷少女', kind: 'female' },
  { id: 'male_0001_a', name: '酷痞青年', kind: 'male' },
  { id: 'male_0007_a', name: '病娇青年', kind: 'male' },
  { id: 'female_0030_c', name: '高能姐姐', kind: 'female' },
  { id: 'female_0009_a', name: '羞涩少女', kind: 'female' },
  { id: 'male_0020_a', name: '阳光甜弟', kind: 'male' },
  { id: 'male_0018_a', name: '沙哑青年', kind: 'male' },
  { id: 'male_0011_a', name: '冷面霸总', kind: 'male' },
  { id: 'male_0015_a', name: '英武老者', kind: 'male' },
];
