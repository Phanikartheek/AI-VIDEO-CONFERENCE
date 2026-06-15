import { Video, LogOut, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../ui/Button';

interface NavbarProps {
  user: { username: string; email: string } | null;
  onLogout: () => void;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Navbar({ user, onLogout, currentPage, onNavigate }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => onNavigate(user ? 'dashboard' : 'landing')}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">FocusMeet</span>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {user ? (
              <>
                <button
                  onClick={() => onNavigate('dashboard')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    currentPage === 'dashboard'
                      ? 'text-white bg-white/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => onNavigate('meetings')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    currentPage === 'meetings'
                      ? 'text-white bg-white/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Meetings
                </button>
                <button
                  onClick={() => onNavigate('report')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    currentPage === 'report'
                      ? 'text-white bg-white/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Report
                </button>
                <button
                  onClick={() => onNavigate('api-explorer')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    currentPage === 'api-explorer'
                      ? 'text-white bg-white/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  API Explorer
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    const el = document.getElementById('features');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Features
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('architecture');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Architecture
                </button>
              </>
            )}
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm text-gray-300">{user.username}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => onNavigate('login')}>
                  Sign In
                </Button>
                <Button variant="primary" size="sm" onClick={() => onNavigate('register')}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-gray-400 hover:text-white cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-gray-950/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-2">
            {user ? (
              <>
                <button onClick={() => { onNavigate('dashboard'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">Dashboard</button>
                <button onClick={() => { onNavigate('meetings'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">Meetings</button>
                <button onClick={() => { onNavigate('report'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">Report</button>
                <button onClick={() => { onNavigate('api-explorer'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">API Explorer</button>
                <hr className="border-white/10 my-2" />
                <button onClick={() => { onLogout(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 rounded-lg hover:bg-white/5 cursor-pointer">Logout</button>
              </>
            ) : (
              <>
                <button onClick={() => { onNavigate('login'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">Sign In</button>
                <button onClick={() => { onNavigate('register'); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">Get Started</button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
