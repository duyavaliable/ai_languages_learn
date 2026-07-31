import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeProvider';
import { Settings, Shield, Bell, Moon, Sun, Monitor, ShieldCheck, Mail, Smartphone, Volume2 } from 'lucide-react';

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)} 
    className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-admin-primary/20 ${
      checked ? 'bg-admin-primary hover:bg-admin-primary/90' : 'bg-admin-muted hover:bg-admin-muted/80'
    }`}
  >
    <div className={`w-5 h-5 bg-admin-background rounded-full shadow-sm transition-transform duration-200 ease-in-out ${
      checked ? 'translate-x-5' : 'translate-x-0'
    }`}></div>
  </button>
);

export default function AdminSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('appearance');

  // Preferences State
  const [prefs, setPrefs] = useState({
    emailNotifs: true,
    pushNotifs: false,
    weeklyReport: true,
    soundEffects: true,
    language: 'en',
    privacyLevel: 'public',
    twoFactor: false
  });

  const handlePrefChange = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Sun },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'general', label: 'General', icon: Settings },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-admin-card-foreground">Settings</h1>
        <p className="text-admin-muted-foreground mt-1">Manage your platform preferences and configurations</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 flex flex-col gap-1 bg-admin-card rounded-2xl border border-admin-border p-3 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-admin-primary text-admin-primary-foreground shadow-sm shadow-admin-primary/20'
                  : 'text-admin-muted-foreground hover:bg-admin-muted hover:text-admin-card-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full bg-admin-card rounded-2xl border border-admin-border shadow-sm p-6 sm:p-8">
          
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-xl font-bold text-admin-card-foreground mb-1">Appearance</h2>
                <p className="text-sm text-admin-muted-foreground">Customize how Lingua Admin looks on your device.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex flex-col items-center gap-3 p-4 border-2 rounded-xl transition-all ${
                    theme === 'light' ? 'border-admin-primary bg-admin-primary/5' : 'border-admin-border bg-admin-card hover:border-admin-muted-foreground/30'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <Sun className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-admin-card-foreground">Light Mode</span>
                </button>

                <button
                  onClick={() => setTheme('dark')}
                  className={`flex flex-col items-center gap-3 p-4 border-2 rounded-xl transition-all ${
                    theme === 'dark' ? 'border-admin-primary bg-admin-primary/5' : 'border-admin-border bg-admin-card hover:border-admin-muted-foreground/30'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-slate-100">
                    <Moon className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-admin-card-foreground">Dark Mode</span>
                </button>

                <button
                  onClick={() => setTheme('system')}
                  className={`flex flex-col items-center gap-3 p-4 border-2 rounded-xl transition-all ${
                    theme === 'system' ? 'border-admin-primary bg-admin-primary/5' : 'border-admin-border bg-admin-card hover:border-admin-muted-foreground/30'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-admin-card-foreground">System Match</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-xl font-bold text-admin-card-foreground mb-1">Notifications</h2>
                <p className="text-sm text-admin-muted-foreground">Manage how you receive alerts and updates.</p>
              </div>

              <div className="space-y-5 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <Mail className="w-5 h-5 text-admin-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-admin-card-foreground">Email Notifications</p>
                      <p className="text-xs text-admin-muted-foreground mt-0.5">Receive weekly reports and critical security alerts</p>
                    </div>
                  </div>
                  <Toggle checked={prefs.emailNotifs} onChange={(val) => handlePrefChange('emailNotifs', val)} />
                </div>
                
                <hr className="border-admin-border" />
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <Smartphone className="w-5 h-5 text-admin-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-admin-card-foreground">Push Notifications</p>
                      <p className="text-xs text-admin-muted-foreground mt-0.5">Real-time alerts for system events</p>
                    </div>
                  </div>
                  <Toggle checked={prefs.pushNotifs} onChange={(val) => handlePrefChange('pushNotifs', val)} />
                </div>

                <hr className="border-admin-border" />
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <Volume2 className="w-5 h-5 text-admin-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-admin-card-foreground">Sound Effects</p>
                      <p className="text-xs text-admin-muted-foreground mt-0.5">Play audio when actions are completed</p>
                    </div>
                  </div>
                  <Toggle checked={prefs.soundEffects} onChange={(val) => handlePrefChange('soundEffects', val)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-xl font-bold text-admin-card-foreground mb-1">Security</h2>
                <p className="text-sm text-admin-muted-foreground">Keep your admin account secure.</p>
              </div>

              <div className="space-y-5 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-admin-card-foreground">Two-Factor Authentication (2FA)</p>
                      <p className="text-xs text-admin-muted-foreground mt-0.5">Add an extra layer of security to your account</p>
                    </div>
                  </div>
                  <Toggle checked={prefs.twoFactor} onChange={(val) => handlePrefChange('twoFactor', val)} />
                </div>
                
                <div className="pt-4">
                  <button className="px-4 py-2 border border-admin-border bg-admin-card hover:bg-admin-muted text-admin-card-foreground text-sm font-semibold rounded-xl transition-colors">
                    Review Login Sessions
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-xl font-bold text-admin-card-foreground mb-1">General Settings</h2>
                <p className="text-sm text-admin-muted-foreground">Basic platform configurations.</p>
              </div>

              <div className="space-y-5 pt-4">
                <div>
                  <label className="text-sm font-medium text-admin-card-foreground mb-2 block">System Language</label>
                  <select 
                    value={prefs.language}
                    onChange={(e) => handlePrefChange('language', e.target.value)}
                    className="w-full max-w-sm px-4 py-2.5 bg-admin-background border border-admin-border rounded-xl text-sm font-medium text-admin-card-foreground focus:outline-none focus:ring-2 focus:ring-admin-primary/30"
                  >
                    <option value="en">English (US)</option>
                    <option value="vi">Tiếng Việt</option>
                    <option value="ja">日本語</option>
                  </select>
                </div>

                <hr className="border-admin-border" />
                
                <div>
                  <p className="text-sm font-medium text-admin-danger mb-2 block">Danger Zone</p>
                  <button className="px-4 py-2 bg-admin-danger-soft text-admin-danger hover:bg-admin-danger/20 text-sm font-semibold rounded-xl transition-colors">
                    Deactivate Account
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
