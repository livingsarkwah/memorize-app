import type { ContentDoc, Manifest } from '../domain';
import { cafeDialogue } from './cafeDialogue';
import { shortToast } from './shortToast';
import { tuhfatulAtfaal } from './tuhfatulAtfaal';

export interface SampleItem {
  manifest: Manifest;
  content: ContentDoc;
}

export const SAMPLE_ITEMS: readonly SampleItem[] = [
  {
    manifest: {
      schemaVersion: 1, contentId: 'tuhfatul-atfaal', version: 1, title: 'Tuhfatul Atfaal',
      titleNative: 'تُحْفَةُ الْأَطْفَالِ', language: 'ar', contentType: 'poem', author: 'Sulayman al-Jamzuri',
    },
    content: tuhfatulAtfaal,
  },
  {
    manifest: {
      schemaVersion: 1, contentId: 'at-the-cafe', version: 1, title: 'At the Café',
      titleNative: 'En el café', language: 'es', contentType: 'dialogue', author: 'Original sample text',
    },
    content: cafeDialogue,
  },
  {
    manifest: {
      schemaVersion: 1, contentId: 'a-short-toast', version: 1, title: 'A Short Toast',
      language: 'en', contentType: 'speech', author: 'Original sample text',
    },
    content: shortToast,
  },
];
