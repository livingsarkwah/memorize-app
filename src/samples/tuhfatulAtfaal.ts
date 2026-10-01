import type { ContentDoc, GroupSource } from '../domain';

const verse = (id: string, n: number, pairs: [id: string, text: string, translation: string][]): GroupSource => ({
  id,
  label: `Verse ${n}`,
  segments: pairs.map(([sid, text, translation]) => ({ id: sid, text, translation })),
});

/**
 * Sample text only. Verify the Arabic against a trusted edition before using it
 * as official content.
 */
export const tuhfatulAtfaal: ContentDoc = {
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      titleNative: 'المقدمة',
      groups: [
        verse('v1', 1, [
          ['v1a', 'يَقُولُ رَاجِي رَحْمَةِ الْغَفُورِ', 'Says the one hoping for the mercy of the Forgiving,'],
          ['v1b', 'دَوْمًا سُلَيْمَانُ هُوَ الْجَمْزُورِي', 'Sulayman, always, known as al-Jamzuri.'],
        ]),
        verse('v2', 2, [
          ['v2a', 'الْحَمْدُ لِلَّهِ مُصَلِّيًا عَلَى', 'All praise is for Allah, sending blessings upon'],
          ['v2b', 'مُحَمَّدٍ وَآلِهِ وَمَنْ تَلَا', 'Muhammad, his family, and those who follow.'],
        ]),
        verse('v3', 3, [
          ['v3a', 'وَبَعْدُ هَذَا النَّظْمُ لِلْمُرِيدِ', 'And then, this poem is for the seeker,'],
          ['v3b', 'فِي النُّونِ وَالتَّنْوِينِ وَالْمُدُودِ', 'on the noon, the tanween, and the elongations.'],
        ]),
        verse('v4', 4, [
          ['v4a', 'سَمَّيْتُهُ بِتُحْفَةِ الْأَطْفَالِ', 'I named it Tuhfatul Atfaal (The Children’s Gift),'],
          ['v4b', 'عَنْ شَيْخِنَا الْمِيهِيِّ ذِي الْكَمَالِ', 'from our teacher al-Mihi, a man of excellence.'],
        ]),
        verse('v5', 5, [
          ['v5a', 'أَرْجُو بِهِ أَنْ يَنْفَعَ الطُّلَّابَا', 'I hope that through it students will benefit,'],
          ['v5b', 'وَالْأَجْرَ وَالْقَبُولَ وَالثَّوَابَا', 'and gain reward, acceptance, and recompense.'],
        ]),
      ],
    },
    {
      id: 'noon',
      title: 'Rules of noon and tanween',
      titleNative: 'أحكام النون الساكنة والتنوين',
      heading: {
        id: 'h2',
        text: 'أَحْكَامُ النُّونِ السَّاكِنَةِ وَالتَّنْوِينِ',
        translation: 'Rules of the silent noon and tanween',
      },
      groups: [
        verse('v6', 6, [
          ['v6a', 'لِلنُّونِ إِنْ تَسْكُنْ وَلِلتَّنْوِينِ', 'For the noon when it is silent, and for tanween,'],
          ['v6b', 'أَرْبَعُ أَحْكَامٍ فَخُذْ تَبْيِينِي', 'there are four rules, so take my explanation.'],
        ]),
        verse('v7', 7, [
          ['v7a', 'فَالْأَوَّلُ الْإِظْهَارُ قَبْلَ أَحْرُفِ', 'The first is clear pronunciation, before letters'],
          ['v7b', 'لِلْحَلْقِ سِتٌّ رُتِّبَتْ فَلْتَعْرِفِ', 'of the throat, six in number, so learn them.'],
        ]),
        verse('v8', 8, [
          ['v8a', 'هَمْزٌ فَهَاءٌ ثُمَّ عَيْنٌ حَاءُ', 'Hamza, then ha, then ayn and ha,'],
          ['v8b', 'مُهْمَلَتَانِ ثُمَّ غَيْنٌ خَاءُ', 'the two unpointed, then ghayn and kha.'],
        ]),
      ],
    },
  ],
};
