import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// Routes other than the landing page load on demand to keep the first load small.
const Catalog = lazy(() => import('./pages/Catalog'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BigO = lazy(() => import('./pages/BigO'));

export default function App() {
  return (
    <Suspense fallback={<p className="px-6 py-24 text-center text-muted">Loading…</p>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="data-structures" element={<Catalog category="data-structures" />} />
          <Route path="algorithms" element={<Catalog category="algorithms" />} />
          <Route path="data-structures/:lessonId" element={<LessonPage category="data-structures" />} />
          <Route path="algorithms/:lessonId" element={<LessonPage category="algorithms" />} />
          <Route path="sql" element={<Catalog category="sql" />} />
          <Route path="sql/:lessonId" element={<LessonPage category="sql" />} />
          <Route path="microservices" element={<Catalog category="microservices" />} />
          <Route path="microservices/:lessonId" element={<LessonPage category="microservices" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="big-o" element={<BigO />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
