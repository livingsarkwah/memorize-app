import type { ContentDoc } from '../domain';

/** Original sample text: a section with ungrouped segments and no titles. */
export const shortToast: ContentDoc = {
  sections: [
    {
      id: 'toast',
      segments: [
        { id: 't1', text: 'Thank you all for being here tonight.' },
        { id: 't2', text: 'A good evening is built from small kindnesses,' },
        { id: 't3', text: 'a table made a little wider, a story told twice,' },
        { id: 't4', text: 'and a friend who stays to help with the dishes.' },
        { id: 't5', text: 'So here is to the people who show up.' },
        { id: 't6', text: 'May we always make room for one more chair,' },
        { id: 't7', text: 'and may we never be too busy to say thank you.' },
        { id: 't8', text: 'To all of you: cheers.' },
      ],
    },
  ],
};
