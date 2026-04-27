import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  UsersRound,
  ClipboardList,
  TrendingUp,
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Coffee,
  ShoppingCart
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'head_waiter'] },
  { path: '/admin/tables', label: 'Masalar', icon: Users, roles: ['owner', 'head_waiter', 'waiter'], active: true },
  { path: '/admin/orders', label: 'Siparişler', icon: UtensilsCrossed, roles: ['owner', 'head_waiter', 'waiter'], active: true },
  { path: '/admin/waiter-order', label: 'Sipariş Al', icon: ShoppingCart, roles: ['owner', 'head_waiter', 'waiter'], active: true },
  { path: '/admin/staff', label: 'Personel', icon: UsersRound, roles: ['owner'], active: true },
  { path: '/admin/menu', label: 'Menü', icon: ClipboardList, roles: ['owner'], active: true },
  { path: '/admin/reports', label: 'Raporlar', icon: TrendingUp, roles: ['owner', 'head_waiter'], active: true },
  { path: '/admin/audit', label: 'Kayıtlar', icon: FileText, roles: ['owner'], active: true },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      navigate('/staff-login');
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch {
      navigate('/staff-login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/staff-login');
  };

  if (!user) return null;

  const filteredNav = NAV_ITEMS.filter(item =>
    item.roles.includes(user.role)
  );

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`bg-gray-900 text-white flex flex-col transition-all ${
        sidebarOpen ? 'w-64' : 'w-20'
      }`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className={`font-bold text-lg flex items-center gap-2 ${!sidebarOpen && 'hidden'}`}>
            <Coffee className="w-5 h-5" />
            CafePay Admin
          </span>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-gray-800 rounded">
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
              {user.name[0]}
            </div>
            {sidebarOpen && (
              <div>
                <p className="font-medium text-sm">{user.name}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {user.role === 'owner' ? 'Patron' :
                   user.role === 'head_waiter' ? 'Şef' : 'Garson'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav data-testid="admin-nav" className="flex-1 py-4">
          {filteredNav.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-800">
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className={`flex items-center gap-3 text-gray-400 hover:text-white transition-colors w-full ${
              !sidebarOpen && 'justify-center'
            }`}
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Çıkış</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
