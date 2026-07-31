import { Outlet, useNavigate } from "react-router-dom"
import Sidebar from "./Sidebar"
import Topbar from "./Topbar"
import { useState } from "react"

export default function AdminLayout() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-admin-background text-admin-foreground flex">
      {/* Sidebar */}
      <Sidebar user={user} />

      {/* Main Content Area */}
      <main className="ml-64 flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          user={user}
          onLogout={handleLogout}
        />

        {/* Dashboard Content Container */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
