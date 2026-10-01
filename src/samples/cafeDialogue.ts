import type { ContentDoc } from '../domain';

/** Original sample text: a left-to-right dialogue with speaker labels and translations. */
export const cafeDialogue: ContentDoc = {
  sections: [
    {
      id: 'cafe',
      segments: [
        { id: 'c1', speaker: 'Camarero', text: 'Buenas tardes. ¿Qué desea tomar?', translation: 'Good afternoon. What would you like to drink?' },
        { id: 'c2', speaker: 'Clienta', text: 'Buenas tardes. Un café con leche, por favor.', translation: 'Good afternoon. A coffee with milk, please.' },
        { id: 'c3', speaker: 'Camarero', text: '¿Algo para comer?', translation: 'Anything to eat?' },
        { id: 'c4', speaker: 'Clienta', text: 'Sí, una tostada con tomate.', translation: 'Yes, a tomato toast.' },
        { id: 'c5', speaker: 'Camarero', text: 'Perfecto. Enseguida se lo traigo.', translation: 'Perfect. I’ll bring it right away.' },
        { id: 'c6', speaker: 'Clienta', text: 'Gracias. ¿Me trae también la cuenta?', translation: 'Thank you. Could you also bring me the bill?' },
        { id: 'c7', speaker: 'Camarero', text: 'Claro que sí.', translation: 'Of course.' },
      ],
    },
  ],
};
