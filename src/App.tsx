import { Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import BigO from './pages/BigO';
import Catalog from './pages/Catalog';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import LessonPage from './pages/LessonPage';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="data-structures" element={<Catalog category="data-structures" />} />
        <Route path="algorithms" element={<Catalog category="algorithms" />} />
        <Route path="data-structures/:lessonId" element={<LessonPage category="data-structures" />} />
        <Route path="algorithms/:lessonId" element={<LessonPage category="algorithms" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="big-o" element={<BigO />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
