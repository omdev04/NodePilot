'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { Bell, LogOut, User, Lock, Mail, Save, Image as ImageIcon, Check } from 'lucide-react';

const AVATARS = [
  'OSLO-1.png',
  'OSLO-2.png',
  'OSLO-3.png',
  'OSLO-4.png',
  'OSLO-5.png',
  'OSLO-6.png',
  'OSLO-7.png',
  'OSLO-8.png',
  'OSLO-9.png',
  'OSLO-10.png',
  'OSLO-11.png',
  'OSLO-12.png',
  'OSLO-13.png',
  'OSLO-14.png',
];

export default function SettingsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  
  // Profile state
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    avatar_url: '',
  });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchProfile();
  }, [router]);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/profile');
      setProfile({
        username: response.data.user.username || '',
        email: response.data.user.email || '',
        avatar_url: response.data.user.avatar_url || '/avatar/OSLO-1.png',
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);

    // Basic client-side validation
    if (!profile.username || profile.username.trim().length < 3) {
      setProfileError('Username must be at least 3 characters');
      setProfileLoading(false);
      return;
    }
    if (profile.email && !/\S+@\S+\.\S+/.test(profile.email)) {
      setProfileError('Please enter a valid email address');
      setProfileLoading(false);
      return;
    }

    try {
      const response = await api.put('/auth/profile', profile);
      // If server returned success, show message
      setProfileSuccess(response.data?.message || 'Profile updated successfully!');
      // Refresh profile state after successful update
      await fetchProfile();
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (error: any) {
      // Log full error and try to extract useful details
      console.error('Profile update error:', error.response || error);
      const serverErr = error.response?.data?.error;
      const serverDetails = error.response?.data?.details;
      let msg = serverErr || error.message || 'Failed to update profile';
      if (!serverErr && serverDetails && Array.isArray(serverDetails)) {
        msg = serverDetails.map((d: any) => `${d.path.join('.')}: ${d.message}`).join('; ');
      }
      setProfileError(msg);
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setPasswordLoading(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordSuccess('Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (error: any) {
      setPasswordError(error.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
        <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <div className="animate-pulse flex justify-between">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your account settings</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                <Bell className="h-5 w-5" />
              </button>
              <ThemeToggle />
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <main className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-800 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('profile')}
                className={`${
                  activeTab === 'profile'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <User className="h-4 w-4 mr-2" />
                Profile
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`${
                  activeTab === 'security'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Lock className="h-4 w-4 mr-2" />
                Security
              </button>
            </nav>
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Profile Information</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Update your account profile information
                </p>
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                {/* Avatar Selection */}
                <div className="space-y-3">
                  <Label className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Choose Avatar
                  </Label>
                  
                  {/* Current Avatar Preview */}
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <img 
                        src={profile.avatar_url || '/avatar/OSLO-1.png'} 
                        alt="Current Avatar"
                        className="h-28 w-28 rounded-full object-cover border-4 border-gray-900 dark:border-white shadow-lg"
                      />
                    </div>
                  </div>

                  {/* Avatar Grid */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
                    {AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setProfile({ ...profile, avatar_url: `/avatar/${avatar}` })}
                        className={`relative rounded-full overflow-hidden w-12 h-12 transition-all duration-200 hover:scale-110 ${
                          profile.avatar_url === `/avatar/${avatar}`
                            ? 'ring-4 ring-gray-900 dark:ring-white shadow-lg'
                            : 'ring-2 ring-gray-200 dark:ring-gray-800 hover:ring-gray-400 dark:hover:ring-gray-600'
                        }`}
                      >
                        <img 
                          src={`/avatar/${avatar}`} 
                          alt={avatar}
                          className="w-full h-full object-cover"
                        />
                        {profile.avatar_url === `/avatar/${avatar}` && (
                          <div className="absolute inset-0 bg-gray-900/50 dark:bg-white/50 flex items-center justify-center">
                            <Check className="h-6 w-6 text-white dark:text-gray-900" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={profile.username}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                    className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    placeholder="your.email@example.com"
                  />
                </div>

                {profileError && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                    {profileError}
                  </div>
                )}

                {profileSuccess && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg text-sm">
                    {profileSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={profileLoading}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {profileLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Change Password</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Update your password to keep your account secure
                </p>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Current Password
                  </Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Password must be at least 6 characters long
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    required
                  />
                </div>

                {passwordError && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg text-sm">
                    {passwordSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
