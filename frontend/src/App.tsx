import { useState, useCallback, useEffect } from 'react';
import Navbar from './components/layout/Navbar';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import ApiExplorerPage from './pages/ApiExplorerPage';
import MeetingRoomPage from './pages/MeetingRoomPage';
import EngagementReport from './components/meeting/EngagementReport';
import { useAuth } from './hooks/useAuth';

type Page = 'landing' | 'login' | 'register' | 'dashboard' | 'meetings' | 'api-explorer' | 'meeting-room' | 'report';

const PROTECTED_PAGES: Page[] = ['dashboard', 'meetings'];

export default function App() {
  const { user, token, loading, error, login, register, logout, isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>(isAuthenticated ? 'dashboard' : 'landing');
  const [meetingRoomToken, setMeetingRoomToken] = useState<string | null>(null);
  const [meetingRoomTitle, setMeetingRoomTitle] = useState<string>('');
  const [meetingRoomId, setMeetingRoomId] = useState<string>('demo-meeting');
  const [meetingRoomIsHost, setMeetingRoomIsHost] = useState<boolean>(true);

  useEffect(() => {
    if (!isAuthenticated && PROTECTED_PAGES.includes(currentPage)) {
      setCurrentPage('login');
    }
  }, [isAuthenticated, currentPage]);

  const navigate = useCallback((page: string) => {
    setCurrentPage(page as Page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setCurrentPage('landing');
  }, [logout]);

  const handleEnterMeetingRoom = useCallback(
    (title?: string, livekitToken?: string, meetingId?: string, isHost?: boolean) => {
      setMeetingRoomTitle(title || 'FocusMeet Room');
      setMeetingRoomToken(livekitToken || null);
      setMeetingRoomId(meetingId || 'demo-meeting');
      setMeetingRoomIsHost(isHost ?? true);
      setCurrentPage('meeting-room');
    },
    [],
  );

  const handleLeaveMeetingRoom = useCallback(() => {
    setMeetingRoomToken(null);
    setMeetingRoomTitle('');
    setMeetingRoomId('demo-meeting');
    setMeetingRoomIsHost(true);
    setCurrentPage(isAuthenticated ? 'dashboard' : 'landing');
  }, [isAuthenticated]);

  if (currentPage === 'meeting-room') {
    return (
      <MeetingRoomPage
        livekitToken={meetingRoomToken}
        meetingTitle={meetingRoomTitle}
        meetingId={meetingRoomId}
        authToken={token}
        isHost={meetingRoomIsHost}
        onLeave={handleLeaveMeetingRoom}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={navigate} onEnterRoom={handleEnterMeetingRoom} />;
      case 'login':
        return (
          <AuthPage
            mode="login"
            onLogin={login}
            onRegister={register}
            onNavigate={navigate}
            loading={loading}
            error={error}
          />
        );
      case 'register':
        return (
          <AuthPage
            mode="register"
            onLogin={login}
            onRegister={register}
            onNavigate={navigate}
            loading={loading}
            error={error}
          />
        );
      case 'dashboard':
        if (!isAuthenticated || !user) return null;
        return <DashboardPage user={user} onNavigate={navigate} onEnterRoom={handleEnterMeetingRoom} />;
      case 'meetings':
        if (!isAuthenticated) return null;
        return <MeetingsPage onEnterRoom={handleEnterMeetingRoom} />;
      case 'api-explorer':
        return <ApiExplorerPage />;
      case 'report':
        return (
          <EngagementReport
            meetingId="demo-meeting"
            token={token}
            onBack={() => navigate(isAuthenticated ? 'dashboard' : 'landing')}
          />
        );
      default:
        return <LandingPage onNavigate={navigate} onEnterRoom={handleEnterMeetingRoom} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar
        user={user}
        onLogout={handleLogout}
        currentPage={currentPage}
        onNavigate={navigate}
      />
      {renderPage()}
    </div>
  );
}
