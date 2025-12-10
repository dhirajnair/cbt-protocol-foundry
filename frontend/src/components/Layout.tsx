import { Outlet, Link, useLocation } from 'react-router-dom'
import { Activity, History, Home, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/history', label: 'History', icon: History },
]

export default function Layout() {
  const location = useLocation()
  const { theme } = useTheme()

  return (
    <div
      data-theme={theme}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50/30 to-secondary/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-200/30 rounded-full blur-3xl dark:bg-primary-500/10" />
        <div className="absolute top-1/2 -left-20 w-60 h-60 bg-secondary/20 rounded-full blur-3xl dark:bg-secondary/20" />
        <div className="absolute bottom-20 right-1/4 w-40 h-40 bg-accent/20 rounded-full blur-2xl dark:bg-amber-500/20" />
      </div>

      <div className="relative flex">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/50 bg-white/40 backdrop-blur-xl p-4 flex flex-col z-40 dark:border-slate-800 dark:bg-slate-900/70">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 px-3 py-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary flex items-center justify-center shadow-lg shadow-primary/30 dark:shadow-primary/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">CBT Foundry</h1>
              <p className="text-xs text-muted-foreground">CBT Protocol Foundry</p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Status indicator */}
          <div className="mt-auto pt-4 border-t border-slate-200/50 dark:border-slate-800">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/70">
              <Activity className="w-4 h-4 text-secondary" />
              <span className="text-xs text-muted-foreground">System Active</span>
              <div className="ml-auto w-2 h-2 bg-secondary rounded-full animate-pulse" />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="ml-64 flex-1 min-h-screen p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

