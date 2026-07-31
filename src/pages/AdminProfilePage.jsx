import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Shield, Clock, Monitor, UserCheck, CalendarDays } from 'lucide-react';

export default function AdminProfilePage() {
  const navigate = useNavigate();
  const rawUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [accountForm, setAccountForm] = useState({
    fullName: rawUser.username || '',
    email: rawUser.email || '',
    phone: rawUser.phone || '',
  });

  const [accountErrors, setAccountErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState('idle');

  const handleAccountChange = (field) => (e) => {
    setAccountForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (accountErrors[field]) {
      setAccountErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const validateAccountForm = () => {
    const errors = {};
    if (!accountForm.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!accountForm.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountForm.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    return errors;
  };

  const handleSaveAccount = async () => {
    const errors = validateAccountForm();
    if (Object.keys(errors).length > 0) {
      setAccountErrors(errors);
      return;
    }

    setSaveStatus('saving');
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const updatedUser = { ...rawUser, username: accountForm.fullName, email: accountForm.email, phone: accountForm.phone };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'AD';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const isFormDirty =
    accountForm.fullName !== (rawUser.username || '') ||
    accountForm.email !== (rawUser.email || '') ||
    accountForm.phone !== (rawUser.phone || '');

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Profile Header */}
      <div className="bg-admin-card rounded-2xl border border-admin-border shadow-sm overflow-hidden">
        <div className="h-28 bg-admin-primary w-full relative">
          <div className="absolute inset-0 bg-gradient-to-r from-admin-primary to-admin-primary/80" />
        </div>
        <div className="px-6 pb-6 -mt-12 sm:-mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-admin-card bg-admin-card flex items-center justify-center text-3xl font-bold text-admin-primary shadow-md shrink-0 relative z-10">
              {getInitials(rawUser.username)}
            </div>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-admin-card-foreground">
                  {rawUser.username || 'Administrator'}
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-admin-primary/20 text-admin-primary bg-admin-primary/10">
                  Administrator
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-admin-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> {rawUser.email || 'No email provided'}
                </span>
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-admin-success" /> Active Account
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Column: Account Info & Security */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Information Card */}
          <div className="bg-admin-card rounded-2xl border border-admin-border shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="w-5 h-5 text-admin-primary" />
              <h2 className="text-xl font-bold text-admin-card-foreground">Account Information</h2>
            </div>
            <p className="text-sm text-admin-muted-foreground mb-6">Manage your administrator profile details.</p>

            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-admin-card-foreground">Full Name</label>
                  <input
                    type="text"
                    value={accountForm.fullName}
                    onChange={handleAccountChange('fullName')}
                    placeholder="Enter full name"
                    className={`w-full px-4 py-2.5 bg-admin-background border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 ${accountErrors.fullName ? 'border-admin-danger focus:ring-admin-danger/20' : 'border-admin-border focus:ring-admin-primary/20 focus:border-admin-primary'
                      }`}
                  />
                  {accountErrors.fullName && <p className="text-xs text-admin-danger mt-1">{accountErrors.fullName}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-admin-card-foreground">Phone Number</label>
                  <input
                    type="text"
                    value={accountForm.phone}
                    onChange={handleAccountChange('phone')}
                    placeholder="+84 123 456 789"
                    className="w-full px-4 py-2.5 bg-admin-background border border-admin-border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 focus:ring-admin-primary/20 focus:border-admin-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-admin-card-foreground">Email Address</label>
                <input
                  type="email"
                  value={accountForm.email}
                  onChange={handleAccountChange('email')}
                  placeholder="admin@example.com"
                  className={`w-full px-4 py-2.5 bg-admin-background border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 ${accountErrors.email ? 'border-admin-danger focus:ring-admin-danger/20' : 'border-admin-border focus:ring-admin-primary/20 focus:border-admin-primary'
                    }`}
                />
                {accountErrors.email && <p className="text-xs text-admin-danger mt-1">{accountErrors.email}</p>}
              </div>

              {saveStatus === 'success' && (
                <p className="text-sm text-admin-success font-medium bg-admin-success-soft border border-admin-success/20 rounded-xl px-4 py-2.5">
                  ✓ Profile updated successfully.
                </p>
              )}
              {saveStatus === 'error' && (
                <p className="text-sm text-admin-danger font-medium bg-admin-danger-soft border border-admin-danger/20 rounded-xl px-4 py-2.5">
                  ✗ Failed to save profile. Please try again.
                </p>
              )}

              <div className="pt-2">
                <button
                  onClick={handleSaveAccount}
                  disabled={!isFormDirty || saveStatus === 'saving'}
                  className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all ${!isFormDirty || saveStatus === 'saving'
                      ? 'bg-admin-muted text-admin-muted-foreground cursor-not-allowed'
                      : 'bg-admin-primary hover:bg-admin-primary/90 text-admin-primary-foreground shadow-sm'
                    }`}
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Security Card */}
          <div className="bg-admin-card rounded-2xl border border-admin-border shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-admin-card-foreground">Security</h2>
            </div>
            <p className="text-sm text-admin-muted-foreground mb-6">Update your account password.</p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-admin-card-foreground">Current Password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-admin-background border border-admin-border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 focus:ring-admin-primary/20" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-admin-card-foreground">New Password</label>
                  <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-admin-background border border-admin-border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 focus:ring-admin-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-admin-card-foreground">Confirm Password</label>
                  <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-admin-background border border-admin-border rounded-xl text-sm text-admin-foreground focus:outline-none focus:ring-2 focus:ring-admin-primary/20" />
                </div>
              </div>

              <div className="pt-2">
                <button className="px-6 py-2.5 bg-admin-card border border-admin-border text-admin-card-foreground hover:bg-admin-muted text-sm font-semibold rounded-xl transition-colors">
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: System Info & Meta */}
        <div className="space-y-6">
          <div className="bg-admin-card rounded-2xl border border-admin-border shadow-sm p-6">
            <h3 className="text-sm font-bold text-admin-card-foreground uppercase tracking-wider mb-4">System Details</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-admin-primary/10 flex items-center justify-center text-admin-primary shrink-0 mt-0.5">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-admin-card-foreground">Lingua Admin System</p>
                  <p className="text-xs text-admin-muted-foreground mt-0.5">Version 2.4.0 (Stable)</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-admin-success-soft flex items-center justify-center text-admin-success shrink-0 mt-0.5">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-admin-card-foreground">Permissions</p>
                  <p className="text-xs text-admin-muted-foreground mt-0.5">Full System Access (Super Admin)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-admin-card rounded-2xl border border-admin-border shadow-sm p-6">
            <h3 className="text-sm font-bold text-admin-card-foreground uppercase tracking-wider mb-4">Activity Log</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-admin-muted flex items-center justify-center text-admin-muted-foreground shrink-0 mt-0.5">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-admin-card-foreground">Account Created</p>
                  <p className="text-xs text-admin-muted-foreground mt-0.5">{rawUser.createdAt ? new Date(rawUser.createdAt).toLocaleDateString() : 'August 12, 2023'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-admin-muted flex items-center justify-center text-admin-muted-foreground shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-admin-card-foreground">Last Login</p>
                  <p className="text-xs text-admin-muted-foreground mt-0.5">{new Date().toLocaleString()}</p>
                  <p className="text-[11px] text-admin-muted-foreground mt-0.5">IP: 192.168.1.104</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
