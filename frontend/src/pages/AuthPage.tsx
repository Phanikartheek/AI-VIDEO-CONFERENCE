import { useState, useEffect } from 'react';
import { Video, Mail, User, Lock, ArrowRight, Eye, EyeOff, WifiOff } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Scene3D from '../components/three/Scene3D';

interface AuthPageProps {
  mode: 'login' | 'register';
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
  onNavigate: (page: string) => void;
  loading: boolean;
  error: string | null;
}

export default function AuthPage({ mode, onLogin, onRegister, onNavigate, loading, error }: AuthPageProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Clear local errors when switching between login/register
  useEffect(() => {
    setLocalError(null);
  }, [mode]);

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Client-side validation
    if (!email.trim() || !email.includes('@')) {
      setLocalError('Please enter a valid email address');
      return;
    }
    if (mode === 'register' && username.trim().length < 3) {
      setLocalError('Username must be at least 3 characters');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(email, username, password);
      }
      // Success — navigate to dashboard
      onNavigate('dashboard');
    } catch {
      // Error is already set by useAuth; stay on this page
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 pt-20">
      <Scene3D />
      <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-md">
        <Card className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
              <Video className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {mode === 'login'
                ? 'Sign in to your FocusMeet account'
                : 'Start hosting secure meetings'}
            </p>
          </div>

          {/* Offline badge */}
          <div className="flex items-center justify-center gap-1.5 mb-5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mx-auto w-fit">
            <WifiOff className="w-3 h-3 text-amber-400" />
            <span className="text-[11px] text-amber-300 font-medium">
              Demo mode — data stored locally in your browser
            </span>
          </div>

          {/* Error */}
          {displayError && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {displayError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLocalError(null); }}
              icon={<Mail className="w-4 h-4" />}
              required
            />

            {mode === 'register' && (
              <Input
                label="Username"
                type="text"
                placeholder="johndoe"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setLocalError(null); }}
                icon={<User className="w-4 h-4" />}
                required
                minLength={3}
              />
            )}

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(null); }}
                icon={<Lock className="w-4 h-4" />}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          {/* Switch */}
          <p className="text-center text-sm text-gray-400 mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => onNavigate(mode === 'login' ? 'register' : 'login')}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
