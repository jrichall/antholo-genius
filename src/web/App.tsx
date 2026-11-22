import { Navigate, Route, Routes } from 'react-router-dom';
import TabBar from './components/TabBar';
import Home from './pages/Home';
import Search from './pages/Search';
import Series from './pages/Series';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/series/:id" element={<Series />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  );
}
