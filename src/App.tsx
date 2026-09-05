import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Spinner from './components/Spinner'
import AppShell from './components/AppShell'
import Placeholder from './components/Placeholder'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRedirect from './components/RoleRedirect'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyTwoFactor from './pages/auth/VerifyTwoFactor'
import RecoverTwoFactor from './pages/auth/RecoverTwoFactor'
import AcceptInvitation from './pages/auth/AcceptInvitation'
import StartWithCode from './pages/auth/StartWithCode'
import NotFound from './pages/NotFound'
import RoleShell from './components/RoleShell'
import AccountLayout from './pages/account/AccountLayout'
import DocumentTitle from './components/DocumentTitle'
import { ROLES, ROLE_CONFIG, type Role } from './lib/roles'

/**
 * SPLIT POINT — everything below is fetched only when someone opens it.
 *
 * The whole application used to arrive in one 709 kB file, so a parent on a
 * phone at a bus stop downloaded the platform admin's audit log, the school
 * admin's KPI charts and every other role's screens before the login form
 * could paint. Nobody has two roles; nobody needs a second one's code.
 *
 * WHAT STAYS EAGER, and why. The auth pages, the shell and the landing page
 * are what a first visit actually renders. Splitting those would trade one
 * download for two round trips at the exact moment there is nothing on screen
 * yet — worse, not better.
 *
 * Offline is unaffected: the service worker precaches every emitted chunk at
 * build time (globPatterns in vite.config.ts), so a lazy screen still opens
 * with no connection. That is worth knowing, because route splitting normally
 * breaks offline apps in precisely this way.
 */
// Landing is NOT here on purpose: RoleRedirect renders it at "/" for every
// signed-out visitor, which is the most common first request there is.
// Deferring the one thing a first-time visitor came to read would be splitting
// for the sake of a smaller number.
const DesignTokens = lazy(() => import('./pages/DesignTokens'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Enquiry = lazy(() => import('./pages/Enquiry'))
const ApplyAsSpecialist = lazy(() => import('./pages/ApplyAsSpecialist'))
const ForSchools = lazy(() => import('./pages/public/ForSchools'))
const ForParents = lazy(() => import('./pages/public/ForParents'))
const About = lazy(() => import('./pages/public/About'))
const Features = lazy(() => import('./pages/public/Features'))
const PublicSecurity = lazy(() => import('./pages/public/Security'))
const PublicSafeguarding = lazy(() => import('./pages/public/Safeguarding'))
const Privacy = lazy(() => import('./pages/public/Privacy'))
const Cookies = lazy(() => import('./pages/public/Cookies'))
const Help = lazy(() => import('./pages/public/Help'))
const Status = lazy(() => import('./pages/public/Status'))
const Security = lazy(() => import('./pages/account/Security'))
const AccountProfile = lazy(() => import('./pages/account/Profile'))
const AccountSchool = lazy(() => import('./pages/account/School'))

/**
 * ROLE SCREENS ARE ADDED HERE, BY THE PERSON WHO OWNS THAT ROLE.
 *
 *   parent/ and platformAdmin/  Saurab
 *   schoolAdmin/                Prabin
 *   educator/                   Osheit
 *   specialist/                 Tahmid
 *
 * Nothing here yet, on purpose. Every role screen currently renders as a
 * Placeholder — see BUILT_SCREENS below — which is why the application builds
 * and runs with none of them written.
 *
 * To add yours: put the lazy import in your own block below, then add its line
 * to BUILT_SCREENS (and DETAIL_ROUTES if it is a page reached by clicking a
 * row). Both are plain lists, so if two of us add to them at once git reports a
 * conflict — ALWAYS KEEP BOTH SIDES. It is never a real disagreement, only two
 * people adding two different screens to the same list.
 *
 * ORDER MATTERS ONCE: educator/ holds StudentRoster and StudentDetail, which
 * the school admin and the specialist both reuse rather than owning a second
 * copy of. So Osheit's pull request lands before Prabin's and Tahmid's. After
 * that the four of us are independent.
 */

// --- Saurab: parent/ and platformAdmin/ ---
const ParentDashboard = lazy(() => import('./pages/parent/Dashboard'))
const HomeObservations = lazy(() => import('./pages/parent/HomeObservations'))
const ParentAppointments = lazy(() => import('./pages/parent/Appointments'))
const AboutChild = lazy(() => import('./pages/parent/AboutChild'))
// --- db/088: somebody who belongs to no school ---
const IndividualHome = lazy(() => import('./pages/individual/Dashboard'))
const GoalsAndIep = lazy(() => import('./pages/parent/GoalsAndIep'))
const ParentMessages = lazy(() => import('./pages/parent/Messages'))
const ParentProgress = lazy(() => import('./pages/parent/Progress'))
const ParentPrivacy = lazy(() => import('./pages/parent/Privacy'))
const ParentFinance = lazy(() => import('./pages/parent/Finance'))
const LinkChild = lazy(() => import('./pages/parent/LinkChild'))

const GlobalOverview = lazy(() => import('./pages/platformAdmin/GlobalOverview'))
const StudentGoals = lazy(() => import('./pages/student/MyGoals'))
const Academy = lazy(() => import('./pages/shared/Academy'))
const Courses = lazy(() => import('./pages/platformAdmin/Courses'))
const Library = lazy(() => import('./pages/shared/Library'))
const Articles = lazy(() => import('./pages/platformAdmin/Articles'))
const Schools = lazy(() => import('./pages/platformAdmin/Schools'))
const AiGovernance = lazy(() => import('./pages/platformAdmin/AiGovernance'))
const Verification = lazy(() => import('./pages/platformAdmin/Verification'))
const AuditLog = lazy(() => import('./pages/platformAdmin/AuditLog'))
const Billing = lazy(() => import('./pages/platformAdmin/Billing'))
const Subscriptions = lazy(() => import('./pages/platformAdmin/Subscriptions'))
const Enquiries = lazy(() => import('./pages/platformAdmin/Enquiries'))
const Applications = lazy(() => import('./pages/platformAdmin/Applications'))
const Screening = lazy(() => import('./pages/platformAdmin/Screening'))
const SchoolPeopleDetail = lazy(
  () => import('./pages/platformAdmin/SchoolPeople'),
)
const PlatformRecordAccess = lazy(
  () => import('./pages/platformAdmin/RecordAccess'),
)

// --- Prabin: schoolAdmin/ ---
const SchoolAdminDashboard = lazy(() => import('./pages/schoolAdmin/Dashboard'))
const Safeguarding = lazy(() => import('./pages/schoolAdmin/Safeguarding'))
const Directory = lazy(() => import('./pages/schoolAdmin/Directory'))
const SchoolPeople = lazy(() => import('./pages/schoolAdmin/People'))
const Kpis = lazy(() => import('./pages/schoolAdmin/Kpis'))
const Compliance = lazy(() => import('./pages/schoolAdmin/Compliance'))
const Invoices = lazy(() => import('./pages/schoolAdmin/Invoices'))
const AccessLog = lazy(() => import('./pages/schoolAdmin/AccessLog'))
const AddStudents = lazy(() => import('./pages/schoolAdmin/AddStudents'))
const SchoolAdminMessages = lazy(() => import('./pages/schoolAdmin/Messages'))


// --- Osheit: educator/ ---

const EducatorDashboard = lazy(() => import('./pages/educator/Dashboard'))
const StudentRoster = lazy(() => import('./pages/educator/StudentRoster'))
const AddStudent = lazy(() => import('./pages/educator/AddStudent'))
const StudentDetail = lazy(() => import('./pages/educator/StudentDetail'))
const EducatorMessages = lazy(() => import('./pages/educator/Messages'))
const EducatorSchedule = lazy(() => import('./pages/educator/Schedule'))
const EducatorResources = lazy(() => import('./pages/educator/Resources'))
const IepPlans = lazy(() => import('./pages/shared/IepPlans'))
const IepPlanEditor = lazy(() => import('./pages/shared/IepPlanEditor'))
// --- Tahmid: specialist/ ---

const SpecialistDashboard = lazy(() => import('./pages/specialist/Dashboard'))
const Caseload = lazy(() => import('./pages/specialist/Caseload'))
const ReviewQueue = lazy(() => import('./pages/specialist/ReviewQueue'))
const SpecialistMessages = lazy(() => import('./pages/specialist/Messages'))
const SpecialistSchedule = lazy(() => import('./pages/specialist/Schedule'))
const Resources = lazy(() => import('./pages/specialist/Resources'))

/**
 * Screens that are actually built, keyed by `role:path` from ROLE_CONFIG.
 * Anything not listed here falls back to a Placeholder tagged with the
 * milestone that will build it — so a half-finished section is visibly
 * half-finished rather than quietly missing.
 */
const BUILT_SCREENS: Partial<Record<`${Role}:${string}`, React.ReactNode>> = {
  // Empty until each of us adds our own role's screens. Every sidebar link in
  // ROLE_CONFIG still routes; it simply renders a Placeholder saying which
  // milestone will build it. A half-finished product is visibly half-finished
  // rather than quietly missing, which is the whole reason this map exists.
  //
  // Add one line per screen, under your own name. KEEP BOTH SIDES on conflict.

  // --- Saurab: parent: and platform_admin: ---
  'parent:': <ParentDashboard />,
  'parent:about': <AboutChild />,
  'parent:observations': <HomeObservations />,
  'parent:appointments': <ParentAppointments />,
  'parent:goals': <GoalsAndIep />,
  'parent:messages': <ParentMessages />,
  'parent:progress': <ParentProgress />,
  'parent:link-child': <LinkChild />,
  'parent:privacy': <ParentPrivacy />,
  'parent:finance': <ParentFinance />,
  // 'parent:resources' is deliberately absent. That screen lives in
  // pages/specialist/Resources — a specialist uploads and shares, a family
  // reads and confirms, and RLS decides which resources each of them gets, so
  // a second copy would have nothing left to do. It stays a Placeholder until
  // Tahmid's pull request lands, and the line is added then.

  // Two links, two screens. These were both <Schools /> once — the landing
  // page answered the same question as the item below it.
  'student:': <StudentGoals />,
  // db/075. One component for every learner; db/075's policies decide
  // which courses arrive, so this is not five screens that look alike.
  'student:academy': <Academy />,
  'parent:academy': <Academy />,
  'educator:academy': <Academy />,
  'specialist:academy': <Academy />,
  'school_admin:academy': <Academy />,
  'platform_admin:courses': <Courses />,
  'platform_admin:articles': <Articles />,
  // db/079. One component for every reader; the policies decide what arrives.
  'student:library': <Library />,
  'parent:library': <Library />,
  'educator:library': <Library />,
  'specialist:library': <Library />,
  'school_admin:library': <Library />,
  'platform_admin:': <GlobalOverview />,
  'platform_admin:tenants': <Schools />,
  'platform_admin:ai-governance': <AiGovernance />,
  'platform_admin:verification': <Verification />,
  'platform_admin:audit': <AuditLog />,
  'platform_admin:billing': <Billing />,
  'platform_admin:subscriptions': <Subscriptions />,
  'platform_admin:record-access': <PlatformRecordAccess />,
  'platform_admin:enquiries': <Enquiries />,
  'platform_admin:applications': <Applications />,
  'platform_admin:screening': <Screening />,

  // --- Prabin: school_admin: ---
  
'school_admin:': <SchoolAdminDashboard />,
  'school_admin:safeguarding': <Safeguarding />,
  'school_admin:students': <StudentRoster />,
  'school_admin:directory': <Directory />,
  'school_admin:people': <SchoolPeople />,
  'school_admin:kpis': <Kpis />,
  'school_admin:compliance': <Compliance />,
  'school_admin:invoices': <Invoices />,
  'school_admin:access-log': <AccessLog />,
  'school_admin:messages': <SchoolAdminMessages />,
  
  // --- Osheit: educator: ---

  'educator:': <EducatorDashboard />,
  'educator:students': <StudentRoster />,
  'educator:messages': <EducatorMessages />,
  'educator:schedule': <EducatorSchedule />,
  'educator:resources': <EducatorResources />,

  // --- Tahmid: specialist: ---

  'specialist:': <SpecialistDashboard />,
  'specialist:caseload': <Caseload />,
  'specialist:review-queue': <ReviewQueue />,
  'specialist:messages': <SpecialistMessages />,
  'specialist:schedule': <SpecialistSchedule />,
  'specialist:resources': <Resources />,
  'parent:resources': <Resources />,

  // --- db/088: the individual. Three screens, and the two shared ones are
  // the SAME components every other role uses — the Academy and Library have
  // always been audience-driven, so a new role needed no new page. ---
  'individual:': <IndividualHome />,
  'individual:academy': <Academy />,
  'individual:library': <Library />,
}

/**
 * Routes that are not sidebar items — detail pages reached by clicking a row.
 * They still live inside the role's protected section and its AppShell.
 */
const DETAIL_ROUTES: Partial<
  Record<Role, { path: string; element: React.ReactNode }[]>
> = {
  // Empty until each of us adds our own. The shared screens these point at —
  // pages/shared/IepPlans, IepPlanEditor — ARE already committed; they simply
  // have no route to them yet.
  //
  // One ordering note that is easy to get wrong: three roles open a student
  // record through pages/educator/StudentDetail, and a school admin's
  // 'students/add' route must be listed BEFORE 'students/:studentId' or 'add'
  // is read as a student id.

  // --- Saurab: parent, platform_admin ---
  // Clicking a school opens who is in it. The Schools row answers "how is this
  // tenant doing"; this answers "who are they".
  platform_admin: [{ path: 'tenants/:schoolId', element: <SchoolPeopleDetail /> }],
  // parent has no detail routes: a family reaches everything from its own
  // sidebar, and the one child-level page they get to is the IEP inside Goals.

  // --- Prabin: school_admin ---
school_admin: [
    { path: 'students/add', element: <AddStudents /> },
    { path: 'students/:studentId', element: <StudentDetail /> },
    { path: 'students/:studentId/iep', element: <IepPlans /> },
    { path: 'students/:studentId/iep/:planId', element: <IepPlanEditor /> },
  ],


  // --- Osheit: educator ---

  educator: [
    { path: 'students/add', element: <AddStudent /> },
    { path: 'students/:studentId', element: <StudentDetail /> },
    { path: 'students/:studentId/iep', element: <IepPlans /> },
    { path: 'students/:studentId/iep/:planId', element: <IepPlanEditor /> },
  ],

  // --- Tahmid: specialist ---

  specialist: [
    { path: 'students/:studentId', element: <StudentDetail /> },
    { path: 'students/:studentId/iep', element: <IepPlans /> },
    { path: 'students/:studentId/iep/:planId', element: <IepPlanEditor /> },
  ],
}

/**
 * Every URL in the application.
 *
 * Role dashboards are generated from ROLE_CONFIG rather than typed out one by
 * one, so a sidebar link and its route cannot drift apart. Each role's whole
 * section is wrapped in <ProtectedRoute allow={[role]}>, which means adding a
 * screen to ROLE_CONFIG automatically gets it protected — there is no way to
 * add a route and forget the guard.
 *
 * Reminder: ProtectedRoute is convenience, not security. Row-Level Security in
 * the database is what actually protects the data.
 */
export default function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
      {/* Public */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
        <Route
          path="/pricing"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Pricing />
            </Suspense>
          }
        />
        {/* Public, and it must be: the person filling it in has no account and
            is asking for the conversation that eventually creates one. It is
            also the only place in the product where an anonymous visitor
            causes a row to be written — see db/045 for what guards it. */}
        <Route
          path="/enquiry"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Enquiry />
            </Suspense>
          }
        />
        {/* The public site — every link the footer and header offer. */}
        <Route
          path="/for-schools"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <ForSchools />
            </Suspense>
          }
        />
        <Route
          path="/for-parents"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <ForParents />
            </Suspense>
          }
        />
        <Route
          path="/about"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <About />
            </Suspense>
          }
        />
        <Route
          path="/features"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Features />
            </Suspense>
          }
        />
        <Route
          path="/security"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <PublicSecurity />
            </Suspense>
          }
        />
        <Route
          path="/safeguarding"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <PublicSafeguarding />
            </Suspense>
          }
        />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Privacy />
            </Suspense>
          }
        />
        <Route
          path="/cookies"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Cookies />
            </Suspense>
          }
        />
        <Route
          path="/help"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Help />
            </Suspense>
          }
        />
        <Route
          path="/status"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <Status />
            </Suspense>
          }
        />

        {/* Gate 1 — applying to the network. Public, and it creates no
            account: an applicant is a lead, not a user. See db/047. */}
        <Route
          path="/for-specialists"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <ApplyAsSpecialist />
            </Suspense>
          }
        />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {/* Public on purpose. The emailed link creates the session that this
          page then uses, so it cannot sit behind a signed-in guard. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Not wrapped in ProtectedRoute — that is what redirects here, and
          guarding it with the same check would be a loop. It refuses an
          unauthenticated visitor itself. */}
      <Route path="/verify-2fa" element={<VerifyTwoFactor />} />
      <Route path="/recover-2fa" element={<RecoverTwoFactor />} />
      {/* Public because the person opening it has no account yet. What it
          reveals before sign-in is deliberately thin — see the page. */}
      <Route path="/invite/:token" element={<AcceptInvitation />} />
      {/* The family's front door. A school hands out a code and nothing else,
          so there has to be somewhere to take it that does not first ask
          somebody to guess which kind of account they are. */}
      <Route path="/link" element={<StartWithCode />} />

        {/* Developer reference — no student data, safe to leave open. */}
        <Route
          path="/design-tokens"
          element={
            <Suspense fallback={<Spinner label="Loading" />}>
              <DesignTokens />
            </Suspense>
          }
        />

      {/* Account pages — the same for every role, so they live outside the
          per-role sections rather than being repeated inside all five. */}
      <Route
        path="/account"
        element={
          <ProtectedRoute allow={[...ROLES]}>
            <RoleShell />
          </ProtectedRoute>
        }
      >
        {/* Settings is a SECTION, not two unrelated pages — one header and a
            row of tabs, from the Figma. The layout is imported eagerly rather
            than lazily: it is the frame both tabs render inside, so splitting
            it would cost a round trip to draw the header of a page that has
            already started loading. */}
        <Route element={<AccountLayout />}>
          {/* Every role, one screen — see the note in Profile.tsx. */}
          <Route path="profile" element={<AccountProfile />} />
          <Route path="security" element={<Security />} />
          {/* Guarded by RLS and db/066 rather than by being unreachable: a
              non-school-admin who types the URL gets a page that can read
              nothing and write nothing. */}
          <Route path="school" element={<AccountSchool />} />
        </Route>
      </Route>

      {/* One protected section per role */}
      {ROLES.map((role) => {
        const config = ROLE_CONFIG[role]
        return (
          <Route
            key={role}
            path={config.basePath}
            element={
              <ProtectedRoute allow={[role]}>
                <AppShell role={role} />
              </ProtectedRoute>
            }
          >
            {config.nav.map((item) => {
              const screen = BUILT_SCREENS[`${role}:${item.path}`] ?? (
                <Placeholder title={item.label} milestone={item.milestone} />
              )
              return item.path === '' ? (
                <Route key="index" index element={screen} />
              ) : (
                <Route key={item.path} path={item.path} element={screen} />
              )
            })}

            {(DETAIL_ROUTES[role] ?? []).map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ))}
          </Route>
        )
      })}

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
