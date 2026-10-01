import type { ReactNode } from 'react'
import type { StatusConsulta } from '../data/mock'
import { statusLabel } from '../data/mock'

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatusBadge({ status }: { status: StatusConsulta }) {
  return <span className={`badge badge-${status}`}>{statusLabel[status]}</span>
}

export function Avatar({ nome, cor }: { nome: string; cor?: string }) {
  const iniciais = nome
    .replace(/^Dra?\.\s+/, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className="avatar sm" style={cor ? { background: cor } : undefined}>
      {iniciais}
    </span>
  )
}

export function Placeholder({ items }: { items: string[] }) {
  return (
    <ul className="roadmap">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        {children}
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
