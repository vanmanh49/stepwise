import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';
import { lessonIdFromPath, loadLesson } from './lessons/registry';

// Opening a lesson directly: start downloading its content now, alongside the lesson page's
// code, instead of after it. Errors surface later on the page itself.
const lessonId = lessonIdFromPath(location.pathname, import.meta.env.BASE_URL);
if (lessonId) loadLesson(lessonId).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
