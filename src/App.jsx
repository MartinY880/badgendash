import { Routes, Route } from 'react-router-dom';
import ScanScreen from './components/ScanScreen';
import AdminPanel from './components/AdminPanel';

function App() {
  return (
    <Routes>
      <Route path="/" element={<ScanScreen />} />
      <Route path="/admin" element={<AdminPanel />} />
    </Routes>
  );
}

export default App;
