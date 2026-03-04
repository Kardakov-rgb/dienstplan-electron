import React, { useState } from 'react'
import Dashboard from './components/Dashboard/Dashboard'
import Personenverwaltung from './components/Personenverwaltung/Personenverwaltung'
import Dienstplanerstellung from './components/Dienstplanerstellung/Dienstplanerstellung'
import Statistiken from './components/Statistiken/Statistiken'

type Tab = 'dashboard' | 'personen' | 'dienstplan' | 'statistiken'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'personen', label: 'Personen', icon: '👥' },
  { id: 'dienstplan', label: 'Dienstplanerstellung', icon: '📅' },
  { id: 'statistiken', label: 'Statistiken', icon: '📊' }
]

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <span className="logo-icon">🏥</span>
          <span className="logo-text">Dienstplan-Manager</span>
        </div>
        <nav className="app-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'personen' && <Personenverwaltung />}
        {activeTab === 'dienstplan' && <Dienstplanerstellung />}
        {activeTab === 'statistiken' && <Statistiken />}
      </main>
    </div>
  )
}
