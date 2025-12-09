import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, type Session } from '@/lib/api'
import { formatDate, truncate } from '@/lib/utils'
import {
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Search,
  FileText,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
]

export default function History() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [page, statusFilter])

  const loadSessions = async () => {
    setIsLoading(true)
    try {
      const response = await api.getSessions(page, perPage, statusFilter || undefined)
      setSessions(response.items)
      setTotal(response.total)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredSessions = sessions.filter((s) =>
    searchTerm ? s.intent.toLowerCase().includes(searchTerm.toLowerCase()) : true
  )

  const totalPages = Math.ceil(total / perPage)

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success'
      case 'pending_review':
        return 'warning'
      case 'running':
        return 'info'
      case 'failed':
      case 'rejected':
        return 'danger'
      default:
        return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-800">
            Session <span className="gradient-text">History</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse all past protocol generation sessions
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-panel">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by intent..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                className="h-10 px-3 rounded-lg border border-input bg-background text-sm"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-primary" />
            Sessions ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-muted-foreground">No sessions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="w-full p-4 rounded-xl bg-white/60 hover:bg-white border border-slate-200/50 hover:border-primary/30 transition-all text-left group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-700 group-hover:text-primary transition-colors">
                        {truncate(session.intent, 80)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(session.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {session.safety_score !== null && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Safety</p>
                          <p className="text-sm font-medium text-secondary">
                            {session.safety_score}
                          </p>
                        </div>
                      )}
                      {session.empathy_score !== null && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Empathy</p>
                          <p className="text-sm font-medium text-pink-500">
                            {session.empathy_score}
                          </p>
                        </div>
                      )}
                      <Badge variant={getStatusVariant(session.status)}>
                        {session.status.replace('_', ' ')}
                      </Badge>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200/50">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

