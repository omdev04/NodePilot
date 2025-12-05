'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { Bell, LogOut, User, Lock, Mail, Save, Image as ImageIcon, Check, GitBranch, Shield, UserCircle } from 'lucide-react';
import { OAuthConnect } from '@/components/ui/oauth-connect';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'oauth'>('profile');
  
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
      <div className="flex min-h-screen w-full bg-white dark:bg-gray-950">
        <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="animate-pulse space-y-6">
              <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded"></div>
              <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
              <div className="h-64 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 overflow-auto">
        <main className="p-8">
          <div className="mx-auto max-w-4xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-gray-900 dark:text-white text-3xl font-bold leading-tight">Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 text-base font-normal leading-normal mt-1">Manage your account settings</p>
            </div>

            {/* Tabs */}
            <div className="mb-8 border-b border-gray-200 dark:border-gray-800">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`${
                    activeTab === 'profile'
                      ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-700'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
                >
                  <UserCircle className="h-4 w-4" />
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`${
                    activeTab === 'security'
                      ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-700'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
                >
                  <Shield className="h-4 w-4" />
                  Security
                </button>
                <button
                  onClick={() => setActiveTab('oauth')}
                  className={`${
                    activeTab === 'oauth'
                      ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-700'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors`}
                >
                  <GitBranch className="h-4 w-4" />
                  Git Providers
                </button>
              </nav>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-gray-900 dark:text-white text-xl font-bold leading-tight">Profile Information</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">Update your account profile information</p>
                </div>

                <form onSubmit={handleProfileUpdate} className="space-y-8">
                  {/* Avatar Selection */}
                  <div>
                    <p className="text-gray-900 dark:text-white text-sm font-medium leading-normal mb-4 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Choose Avatar
                    </p>
                    
                    {/* Avatar Grid with Current Preview */}
                    <div className="flex items-center gap-6">
                      {/* Current Avatar Preview */}
                      <div className="relative">
                        <img 
                          src={profile.avatar_url || '/avatar/OSLO-1.png'} 
                          alt="Selected Avatar"
                          className="w-24 h-24 rounded-full border-2 border-gray-900 dark:border-[#0099FF] object-cover"
                        />
                      </div>

                      {/* Avatar Grid */}
                      <div className="grid grid-cols-6 gap-4">
                        {AVATARS.map((avatar) => (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setProfile({ ...profile, avatar_url: `/avatar/${avatar}` })}
                            className={`w-12 h-12 rounded-full cursor-pointer transition-opacity ${
                              profile.avatar_url === `/avatar/${avatar}`
                                ? 'opacity-100 ring-2 ring-gray-900 dark:ring-[#0099FF]'
                                : 'opacity-50 hover:opacity-100'
                            }`}
                          >
                            <img 
                              src={`/avatar/${avatar}`} 
                              alt={avatar}
                              className="w-full h-full object-cover rounded-full"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Username Field */}
                  <div className="relative">
                    <label htmlFor="username" className="text-gray-900 dark:text-white text-sm font-medium leading-normal mb-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      className="flex w-full rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-[#0099FF]/50 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 h-12 placeholder:text-gray-500 dark:placeholder:text-gray-400 px-4 py-3 text-base font-normal leading-normal"
                      required
                    />
                  </div>

                  {/* Email Field */}
                  <div className="relative">
                    <label htmlFor="email" className="text-gray-900 dark:text-white text-sm font-medium leading-normal mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="flex w-full rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-[#0099FF]/50 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 h-12 placeholder:text-gray-500 dark:placeholder:text-gray-400 px-4 py-3 text-base font-normal leading-normal"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  {profileError && (
                    <div className="p-4 bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg text-sm">
                      {profileError}
                    </div>
                  )}

                  {profileSuccess && (
                    <div className="p-4 bg-green-900/20 border border-green-800/50 text-green-400 rounded-lg text-sm">
                      {profileSuccess}
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={profileLoading}
                      className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-3 text-sm font-bold text-white dark:text-gray-900 transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="h-4 w-4" />
                      {profileLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}

          {/* OAuth Tab */}
            {/* OAuth Tab */}
            {activeTab === 'oauth' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                  <div className="mb-6">
                    <h2 className="text-gray-900 dark:text-white text-xl font-bold leading-tight">Git Provider Integration</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Connect your GitHub, GitLab, or Bitbucket account to easily deploy repositories
                    </p>
                  </div>
                  <OAuthConnect />
                </div>
              </div>
            )}
            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-gray-900 dark:text-white text-xl font-bold leading-tight">Change Password</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Update your password to keep your account secure
                  </p>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-6">
                  {/* Current Password */}
                  <div className="space-y-2">
                    <label htmlFor="currentPassword" className="text-gray-900 dark:text-white text-sm font-medium leading-normal flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Current Password
                    </label>
                    <input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="flex w-full rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-[#0099FF]/50 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 h-12 placeholder:text-gray-500 dark:placeholder:text-gray-400 px-4 py-3 text-base font-normal leading-normal"
                      required
                    />
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <label htmlFor="newPassword" className="text-gray-900 dark:text-white text-sm font-medium leading-normal flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      New Password
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="flex w-full rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-[#0099FF]/50 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 h-12 placeholder:text-gray-500 dark:placeholder:text-gray-400 px-4 py-3 text-base font-normal leading-normal"
                      required
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Password must be at least 6 characters long
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-gray-900 dark:text-white text-sm font-medium leading-normal flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Confirm New Password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="flex w-full rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-[#0099FF]/50 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 h-12 placeholder:text-gray-500 dark:placeholder:text-gray-400 px-4 py-3 text-base font-normal leading-normal"
                      required
                    />
                  </div>

                  {passwordError && (
                    <div className="p-4 bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg text-sm">
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="p-4 bg-green-900/20 border border-green-800/50 text-green-400 rounded-lg text-sm">
                      {passwordSuccess}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-3 text-sm font-bold text-white dark:text-gray-900 transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lock className="h-4 w-4" />
                      {passwordLoading ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
