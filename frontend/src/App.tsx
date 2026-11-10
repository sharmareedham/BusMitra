import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './App.css'
import AccountLink from './components/AccountLink'
import BookingPage from './pages/BookingPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ResultsPage from './pages/ResultsPage'
import MyTicketsPage from './pages/MyTicketsPage'
import RouteDetailPage from './pages/RouteDetailPage'

function App() {
  return (
    <BrowserRouter>
      <main className="app">
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="brand-icon">B</span>
            <span>BusMitra</span>
          </Link>
          <span className="tagline">Your journey, with certainty.</span>
          <AccountLink />
        </header>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/route/:id" element={<RouteDetailPage />} />
          <Route path="/book/:id" element={<BookingPage />} />
          <Route path="/tickets" element={<MyTicketsPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>

        <footer>
          BusMitra · A student project for better bus information.
         <br />
           Bus data, bookings and payments are demo only.
        </footer>
      </main>
    </BrowserRouter>
  )
}

export default App