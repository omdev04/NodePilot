"use client"
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderGit2,
  Plus,
  Settings,
  HelpCircle,
  ChevronsRight,
} from "lucide-react";
import api from '@/lib/api';

interface SidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const DashboardSidebar = ({ open, setOpen }: SidebarProps) => {
  const pathname = usePathname();
  const [profile, setProfile] = useState({ username: '', email: '', avatar_url: '/avatar/OSLO-1.png' });

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
          Icon={Plus}
          title="New Project"
          href="/projects/create"
          currentPath={pathname}
          open={open}
        />
        {/* System Status removed from sidebar */}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-1">
        {open && (
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            System
          </div>
        )}
        <Option
          Icon={Settings}
          title="Settings"
          href="/settings"
          currentPath={pathname}
          open={open}
        />
        {open && (
          <Option
            Icon={HelpCircle}
            title="Documentation"
            href="/dashboard#help"
            currentPath={pathname}
            open={open}
          />
        )}
      </div>

      {/* Bottom profile */}
      <div className="absolute left-0 right-0 bottom-0 mb-4 px-3">
        <div className={`flex items-center ${open ? 'gap-3' : ''} transition-colors ${open ? 'rounded-lg p-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm justify-start' : 'rounded-full p-0 bg-transparent justify-center'}`}>
          <div className={`rounded-full overflow-hidden flex items-center justify-center ${open ? '' : 'shadow-sm'}`}>
            <img src={profile.avatar_url || '/avatar/OSLO-1.png'} alt="avatar" className={`object-cover ${'w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-800'}`} />
          </div>
          {open ? (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{profile.username || '-'}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile.email || '-'}</span>
            </div>
          ) : null}
        </div>
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
