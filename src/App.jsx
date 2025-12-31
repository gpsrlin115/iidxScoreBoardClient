import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900">IIDX ScoreBoard</h1>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={
              <div className="text-center py-12">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">
                  Welcome to IIDX ScoreBoard
                </h2>
                <p className="text-gray-600">
                  Frontend scaffolding complete! ✅
                </p>
                <div className="mt-8 space-y-2">
                  <p className="text-sm text-gray-500">✅ React + Vite</p>
                  <p className="text-sm text-gray-500">✅ Tailwind CSS v4</p>
                  <p className="text-sm text-gray-500">✅ React Router</p>
                  <p className="text-sm text-gray-500">✅ Axios with CSRF</p>
                </div>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
