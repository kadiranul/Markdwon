import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Editor from './components/Editor';
import Viewer from './components/Viewer';
import { initTheme } from './theme';
import NotFound from './components/NotFound';
import './App.css';

function App() {
  // Initialize theme on app load
  initTheme();

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Editor />} />
          <Route path="/edit/:url" element={<Editor />} />
          <Route path="/:url" element={<Viewer />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
