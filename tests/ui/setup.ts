import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// jsdom lacks these browser APIs; the app uses them for downloads and audio.
beforeEach(() => {
  location.hash = '';
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
});
afterEach(() => cleanup());
