import { useApp } from '../AppState';
import { directionOf, titleParts } from '../format';

/** A text's English and native titles, following the "Titles" setting. */
export function Titles({ title, titleNative, language, englishClass, nativeClass }: {
  title: string; titleNative: string; language: string; englishClass: string; nativeClass: string;
}) {
  const { settings } = useApp();
  const parts = titleParts(title, titleNative, settings.titles);
  return (
    <>
      {parts.english && <div className={englishClass}>{parts.english}</div>}
      {parts.native && <div className={nativeClass} lang={language} dir={directionOf(language)}>{parts.native}</div>}
    </>
  );
}
