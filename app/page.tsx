'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useAppData } from '@/components/mentax/data'
import type { Navigate, Route } from '@/components/mentax/nav'
import { Home } from '@/components/mentax/screens/home'
import { Write } from '@/components/mentax/screens/write'
import { Diary, EntryView } from '@/components/mentax/screens/diary'
import { Week } from '@/components/mentax/screens/week'
import { WeekReview } from '@/components/mentax/screens/week-review'
import { GoalEditor, Goals } from '@/components/mentax/screens/goals'
import { Profile } from '@/components/mentax/screens/profile'
import { Onboarding } from '@/components/mentax/screens/onboarding'
import { AxisChat } from '@/components/mentax/screens/axis'
import { BottomNav, Loading, TAB_SCREENS } from '@/components/mentax/ui'
import { RETURN_TO_PROFILE_KEY } from '@/lib/ecosystem/client'
import { isRestorePending } from '@/lib/ecosystem/use-cloud-sync'
import { useEcosystem } from '@/components/mentax/ecosystem'
import { useScreenStack, type ScreenChange } from '@/lib/navigation/use-back'

const HOME: Route = { screen: 'home' }
const sameRoute = (a: Route, b: Route) => a.screen === b.screen && a.id === b.id

type NavDirection = 'forward' | 'back' | 'left' | 'right'

/** Entre pestañas, hacia el lado de la pestaña; al abrir una secundaria, hacia delante; al volver, hacia atrás. */
function directionOf({ from, to, kind }: ScreenChange<Route>): NavDirection {
  const a = TAB_SCREENS.indexOf(from.screen)
  const b = TAB_SCREENS.indexOf(to.screen)
  if (a >= 0 && b >= 0) return b > a ? 'right' : 'left'
  return kind === 'pop' || b >= 0 ? 'back' : 'forward'
}

/**
 * Cambia de pantalla como Finax: con View Transitions (Chrome/Android), la que sale se apaga y la
 * que entra llega desde su lado (globals.css). Sin soporte o con «reducir movimiento», sin esto;
 * la entrada escalonada de la pantalla sigue ahí.
 */
function animateScreenChange(direction: NavDirection, update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  document.documentElement.dataset.nav = direction
  const transition = doc.startViewTransition(() => flushSync(update))
  // Tocar muy seguido salta la transición en curso: el cambio de pantalla se hace igual.
  transition.ready.catch(() => {})
  transition.finished.catch(() => {})
}

export default function Page() {
  // Ir a una pantalla empieza arriba; al volver con «atrás», el navegador recupera donde estabas.
  const scrollToTop = useRef(false)
  // Cada pantalla es una entrada del historial, con Inicio como raíz: desde ella, «atrás» sale de la app.
  const { current: route, navigate: goTo } = useScreenStack<Route>(HOME, sameRoute, (update, change) => {
    const toTop = scrollToTop.current
    scrollToTop.current = false
    animateScreenChange(directionOf(change), () => {
      update()
      if (toTop) window.scrollTo(0, 0)
    })
  })
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const data = useAppData()
  const { cloud } = useEcosystem()

  const navigate: Navigate = useCallback((screen, id, options) => {
    scrollToTop.current = true
    goTo({ screen, id }, options)
    // Ya estaba en esa pantalla (tocar su pestaña otra vez): no hay cambio que animar, solo sube.
    if (scrollToTop.current) {
      scrollToTop.current = false
      window.scrollTo(0, 0)
    }
  }, [goTo])

  // Al volver de entrar con Google para el ecosistema AXIS, se reabre Perfil, donde se empezó.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(RETURN_TO_PROFILE_KEY) === null) return
      window.sessionStorage.removeItem(RETURN_TO_PROFILE_KEY)
      // Si se entró para recuperar los datos, se queda en Inicio.
      if (!isRestorePending('mentax')) navigate('profile')
    } catch {
      // Sin sessionStorage se queda en Inicio.
    }
  }, [navigate])

  const notify = useCallback((message: string) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  if (!data) return <main className="app-shell"><div className="phone-frame"><div className="screen"><Loading text="Cargando…" /></div></div></main>
  // Al volver de Google desde «¿Ya usas Mentax?», hasta que llegan los datos de la nube.
  if (cloud.restoring) return <main className="app-shell"><div className="phone-frame"><div className="screen"><Loading text="Recuperando tus datos…" /></div></div></main>

  const props = { data, navigate, notify }
  // La primera vez (sin onboarding ni entradas), Axis pregunta quién eres antes de nada.
  if (!data.about.completedAt && data.entries.length === 0) return <main className="app-shell"><div className="phone-frame"><Onboarding {...props} /></div></main>

  const { screen, id } = route
  const content = {
    home: <Home {...props} />,
    write: <Write key={id ?? 'new'} editId={id} today={data.today} navigate={navigate} notify={notify} />,
    diary: <Diary {...props} />,
    entry: <EntryView key={id} entry={id ? data.entries.find((e) => e.id === id) : undefined} {...props} />,
    week: <Week {...props} />,
    goals: <Goals {...props} />,
    goal: <GoalEditor key={id ?? 'new'} goal={id ? data.goals.find((g) => g.id === id) : undefined} {...props} />,
    axis: <AxisChat data={data} notify={notify} />,
    profile: <Profile {...props} />,
    weekReview: <WeekReview key={id} weekStart={id ?? ''} {...props} />,
    about: <Onboarding editing returnTo={id === 'home' ? 'home' : 'profile'} {...props} />,
  }[screen]

  return <main className="app-shell"><div className="phone-frame">{content}{TAB_SCREENS.includes(screen) && <BottomNav active={screen} navigate={navigate} />}{toast && <div className="toast" role="status">{toast}</div>}</div></main>
}
