import { Fragment, lazy } from 'react';
import { Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { CATEGORIES } from './lessons/labels';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// Routes other than the landing page load on demand to keep the first load small.
const Catalog = lazy(() => import('./pages/Catalog'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BigO = lazy(() => import('./pages/BigO'));

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        {CATEGORIES.map((category) => (
          <Fragment key={category}>
            <Route path={category} element={<Catalog category={category} />} />
            <Route path={`${category}/:lessonId`} element={<LessonPage category={category} />} />
          </Fragment>
        ))}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="big-o" element={<BigO />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
