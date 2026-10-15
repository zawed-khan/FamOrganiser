import { useState } from 'react'
import { useAppUpdate, useInstallPrompt } from './core/pwa'
import { tabs } from './core/tabs'
import './tabs'
import { useAccount } from './core/account'
import { isConfigured, supabase } from './core/supabase'
import AuthScreen from './screens/AuthScreen'
import ProfileSheet from './screens/ProfileSheet'
import { ApproveFamilies, CreateFamily, WaitingForApproval } from './screens/FamilyScreens'

function Modal({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="actions">{children}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const { canInstall, install, dismiss } = useInstallPrompt()
  const { needsUpdate, applyUpdate, later } = useAppUpdate()
  const account = useAccount()
  const current = tabs.find((t) => t.id === openId)
  const { family } = account

  return (
    <main className="app">
      <header className="app-header">
        {current ? (
          <>
            <button className="icon-btn" onClick={() => setOpenId(null)} aria-label="Back to home">‹</button>
            <h1><span aria-hidden>{current.icon}</span> {current.title}</h1>
          </>
        ) : (
          <>
            <span className="em" aria-hidden>🏠</span>
            <h1>Family Manager</h1>
          </>
        )}
        {account.session && (
          <>
            <button className="who-btn" onClick={() => setEditingName(true)} aria-label="Change your name">👤 {account.name || 'Add name'}</button>
            <button className="icon-btn" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">🚪</button>
          </>
        )}
      </header>

      {!isConfigured ? (
        <section className="panel">
          <h2>Almost ready</h2>
          <p>The app is not connected to its database yet. Add the project address and key in <code>.env.local</code> (see <code>.env.example</code>).</p>
        </section>
      ) : account.loading ? (
        <p className="hint">Loading…</p>
      ) : !account.session ? (
        <AuthScreen />
      ) : (
        <>
          {account.isSuperAdmin && <ApproveFamilies account={account} />}
          {!family ? (
            <CreateFamily onDone={account.refresh} />
          ) : family.status !== 'active' ? (
            <WaitingForApproval status={family.status} onCheck={account.refresh} />
          ) : current ? (
            current.render(account)
          ) : (
            <div className="tile-grid">
              {tabs.map((t) => (
                <button key={t.id} className="tile" style={{ background: t.color }} onClick={() => setOpenId(t.id)}>
                  <span className="tile-icon" aria-hidden>{t.icon}</span>
                  {t.title}
                  <span className="tile-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editingName && <ProfileSheet account={account} onClose={() => setEditingName(false)} />}

      {canInstall && (
        <Modal title="Install Family Manager" text="Add it to your home screen so you can open it like any other app.">
          <button onClick={install}>Install</button>
          <button className="secondary" onClick={dismiss}>Not now</button>
        </Modal>
      )}
      {needsUpdate && (
        <Modal title="A new version is ready" text="Update now to get the latest improvements.">
          <button onClick={() => applyUpdate()}>Update now</button>
          <button className="secondary" onClick={later}>Later</button>
        </Modal>
      )}
    </main>
  )
}
