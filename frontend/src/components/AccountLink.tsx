import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

function AccountLink() {
  const { username } = useAuth()

  return (
    <nav className="account-nav">
      {username && (
        <Link to="/tickets" className="nav-link">
          My tickets
        </Link>
      )}
      <Link
        to="/login"
        className={username ? 'account-icon account-icon-active' : 'account-icon'}
        aria-label={username ? `Account: ${username}` : 'Log in'}
        title={username ?? 'Log in'}
      >
        👤
      </Link>
    </nav>
  )
}

export default AccountLink