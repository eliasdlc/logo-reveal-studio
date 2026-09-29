import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { EFFECTS } from '../engine/effects'
import { logoIssues, type LogoStatus } from '../state/issues'
import { useStudio, type LogoItem } from '../state/store'
import { Thumbnail } from './Thumbnail'

/** Sortable list of logos; the order is the order of the combined sequence. */
export function LogoList() {
  const logos = useStudio((s) => s.logos)
  const moveLogo = useStudio((s) => s.moveLogo)
  const sensors = useSensors(
    // A small threshold keeps plain clicks (select) from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) moveLogo(String(active.id), String(over.id))
  }

  if (logos.length === 0) return null
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={logos.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-1.5">
          {logos.map((logo, i) => (
            <LogoRow key={logo.id} logo={logo} index={i} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

const STATUS_BADGE: Record<LogoStatus, { icon: string; className: string; title: string }> = {
  processing: { icon: '…', className: 'text-neutral-500', title: 'Procesando' },
  error: { icon: '✕', className: 'text-red-400', title: 'Error' },
  warning: { icon: '⚠', className: 'text-amber-300', title: 'Revisar' },
  ok: { icon: '', className: '', title: '' },
}

function LogoRow({ logo, index }: { logo: LogoItem; index: number }) {
  const selected = useStudio((s) => s.selectedId === logo.id)
  const { selectLogo, removeLogo } = useStudio.getState()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: logo.id })
  const badge = STATUS_BADGE[logoIssues(logo).status]

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-md p-1.5 ring-1 transition-colors ${
        selected ? 'bg-white/10 ring-white/30' : 'bg-white/[0.02] ring-white/5 hover:bg-white/5'
      } ${isDragging ? 'relative z-10 shadow-lg shadow-black/50' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-neutral-600 hover:text-neutral-300 active:cursor-grabbing"
        aria-label={`Mover ${logo.name}`}
      >
        <svg viewBox="0 0 8 14" className="h-3.5 w-2" fill="currentColor" aria-hidden>
          {[1, 5, 9, 13].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1" />, <circle key={`b${y}`} cx="6" cy={y} r="1" />])}
        </svg>
      </button>
      <button
        type="button"
        onClick={() => selectLogo(logo.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-pressed={selected}
      >
        <span className="w-4 shrink-0 text-right font-mono text-[10px] text-neutral-500">{index + 1}</span>
        <Thumbnail logo={logo.processed?.stage ?? null} className="h-9 w-14 shrink-0 p-1" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-neutral-200" title={logo.name}>
            {logo.name}
          </span>
          <span className="text-[11px] text-neutral-500">{EFFECTS[logo.options.effect].label}</span>
        </span>
      </button>
      {badge.icon && (
        <span className={`shrink-0 text-xs ${badge.className}`} title={badge.title}>
          {badge.icon}
        </span>
      )}
      <button
        type="button"
        onClick={() => removeLogo(logo.id)}
        className="shrink-0 rounded px-1.5 py-1 text-neutral-500 opacity-60 transition group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-300"
        aria-label={`Eliminar ${logo.name}`}
        title="Eliminar"
      >
        ✕
      </button>
    </li>
  )
}
