"use client"
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderGit2,
  Plus,
  Settings,
  HelpCircle,
  ChevronsRight,
  LogOut,
  Moon,
  Sun,
  ChevronUp,
} from "lucide-react";
import api from '@/lib/api';
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

interface SidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const DashboardSidebar = ({ open, setOpen }: SidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState({ username: '', email: '', avatar_url: '/avatar/OSLO-1.png' });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        if (res?.data?.user) {
          setProfile({
            username: res.data.user.username || '',
            email: res.data.user.email || '',
            avatar_url: res.data.user.avatar_url || '/avatar/OSLO-1.png',
          });
        }
      } catch (err) {
        // ignore, sidebar should not crash
        console.warn('Failed to load profile for sidebar', err);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <nav
      className={`sticky top-0 h-screen shrink-0 border-r transition-all duration-300 ease-in-out ${
        open ? 'w-64' : 'w-16'
      } border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-2 shadow-sm`}
    >
      <TitleSection open={open} setOpen={setOpen} />

      {/* Collapsed open button removed — logo click toggles sidebar now */}
      <div className="space-y-1 mb-8">
        <Option
          Icon={Home}
          title="Dashboard"
          href="/dashboard"
          currentPath={pathname}
          open={open}
        />
        <Option
          Icon={FolderGit2}
          title="Projects"
          href="/projects"
          currentPath={pathname}
          open={open}
        />
        <Option
          Icon={() => (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          )}
          title="Editor"
          href="/editor"
          currentPath={pathname}
          open={open}
        />
        <Option
          Icon={Plus}
          title="New Project"
          href="/projects/create"
          currentPath={pathname}
          open={open}
        />
        <Option
          Icon={Settings}
          title="Settings"
          href="/settings"
          currentPath={pathname}
          open={open}
        />
      </div>

      {/* Bottom profile with dropdown menu */}
      <div className="absolute left-0 right-0 bottom-0 mb-4 px-3" ref={menuRef}>
        {/* Dropdown Menu */}
        {showProfileMenu && (
          <div className="mb-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <Moon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
            <div className="border-t border-gray-200 dark:border-gray-800"></div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"
            >
              <LogOut className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                Logout
              </span>
            </button>
          </div>
        )}
        
        {/* Profile Card Button */}
        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className={`w-full flex items-center ${open ? 'gap-3' : ''} transition-colors ${open ? 'rounded-lg p-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'rounded-full p-0 bg-transparent justify-center'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 border-2 border-gray-200 dark:border-gray-800 shadow-sm">
              <img src={profile.avatar_url || '/avatar/OSLO-1.png'} alt="avatar" className="w-full h-full object-cover" />
            </div>
            {open && (
              <div className="flex flex-col text-left">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{profile.username || '-'}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile.email || '-'}</span>
              </div>
            )}
          </div>
          {open && (
            <ChevronUp className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showProfileMenu ? '' : 'rotate-180'}`} />
          )}
        </button>
      </div>
    </nav>
  );
};

interface OptionProps {
  Icon: any;
  title: string;
  href: string;
  currentPath: string;
  open: boolean;
  notifs?: number;
}

const Option = ({ Icon, title, href, currentPath, open, notifs }: OptionProps) => {
  const isSelected = currentPath === href || (href !== '/projects' && href !== '/dashboard' && currentPath.startsWith(href));
  
  return (
    <Link
      href={href}
      className={`relative flex h-11 w-full items-center rounded-md transition-all duration-200 ${
        isSelected 
          ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm" 
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
      }`}
    >
      <div className="grid h-full w-12 place-content-center">
        <Icon className="h-4 w-4" />
      </div>
      
      {open && (
        <span
          className={`text-sm font-medium transition-opacity duration-200 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {title}
        </span>
      )}

      {notifs && open && (
        <span className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs text-white dark:text-gray-900 font-medium">
          {notifs}
        </span>
      )}
    </Link>
  );
};

const TitleSection = ({ open, setOpen }: { open: boolean; setOpen?: (v: boolean) => void }) => {
  return (
    <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
    <div className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
        <div className="flex items-center gap-3">
          <Logo onClick={() => setOpen && setOpen(!open)} />
          {open && (
            <div className={`transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2">
                <div>
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                    NodePilot
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Deployment System
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center">
          {/* Icon-only hide button (only show within header when open) */}
          {open && (
            <button
              onClick={() => setOpen && setOpen(!open)}
              aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
            >
              <ChevronsRight className={`h-4 w-4 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Logo = ({ onClick }: { onClick?: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle sidebar"
      className="grid size-10 shrink-0 place-content-center rounded-lg focus:outline-none cursor-pointer"
    >
      <img src="/Logo/trans.png" alt="NodePilot" className="h-13 w-13 object-contain" />
    </button>
  );
};

// No bottom toggle — top icon-only toggle handles collapse
