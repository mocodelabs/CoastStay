import { lazy, Suspense } from 'react'
import type * as React from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { AcceptInvitePage } from '@/features/auth/accept-invite-page'
import { LoginPage } from '@/features/auth/login-page'
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/password-pages'
import { SignupPage } from '@/features/auth/signup-page'
import { OnboardingPage } from '@/features/onboarding/onboarding-page'
import type { Permission } from '@/lib/permissions'
import { NotFound, RouteError } from './route-error'
import { FullPageSpinner, RequireAuth, RequireOrg, RequirePermission } from './guards'

/** Lazy-load a named export so each module ships as its own chunk. */
function page<M, K extends keyof M>(loader: () => Promise<M>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))
}

const DashboardPage = page(() => import('@/features/dashboard/dashboard-page'), 'DashboardPage')
const PropertiesPage = page(() => import('@/features/properties/properties-page'), 'PropertiesPage')
const PropertyDetailPage = page(() => import('@/features/properties/property-detail-page'), 'PropertyDetailPage')
const PropertyNewPage = page(() => import('@/features/properties/property-edit-pages'), 'PropertyNewPage')
const PropertyEditPage = page(() => import('@/features/properties/property-edit-pages'), 'PropertyEditPage')
const GuestsPage = page(() => import('@/features/guests/guests-page'), 'GuestsPage')
const GuestDetailPage = page(() => import('@/features/guests/guest-detail-page'), 'GuestDetailPage')
const BookingsPage = page(() => import('@/features/bookings/bookings-page'), 'BookingsPage')
const BookingNewPage = page(() => import('@/features/bookings/booking-edit-pages'), 'BookingNewPage')
const BookingEditPage = page(() => import('@/features/bookings/booking-edit-pages'), 'BookingEditPage')
const BookingDetailPage = page(() => import('@/features/bookings/booking-detail-page'), 'BookingDetailPage')
const BookingPrintPage = page(() => import('@/features/bookings/booking-print-page'), 'BookingPrintPage')
const CalendarPage = page(() => import('@/features/calendar/calendar-page'), 'CalendarPage')
const FinancesPage = page(() => import('@/features/finances/finances-page'), 'FinancesPage')
const HousekeepingPage = page(() => import('@/features/housekeeping/housekeeping-page'), 'HousekeepingPage')
const TaskDetailPage = page(() => import('@/features/housekeeping/task-detail-page'), 'TaskDetailPage')
const MaintenancePage = page(() => import('@/features/maintenance/maintenance-page'), 'MaintenancePage')
const MaintenanceDetailPage = page(() => import('@/features/maintenance/maintenance-detail-page'), 'MaintenanceDetailPage')
const InventoryPage = page(() => import('@/features/inventory/inventory-page'), 'InventoryPage')
const SettingsLayout = page(() => import('@/features/settings/settings-layout'), 'SettingsLayout')
const ProfileSettings = page(() => import('@/features/settings/profile-settings'), 'ProfileSettings')
const BusinessSettings = page(() => import('@/features/settings/business-settings'), 'BusinessSettings')
const BookingSettings = page(() => import('@/features/settings/booking-settings'), 'BookingSettings')
const StaffSettings = page(() => import('@/features/settings/staff-settings'), 'StaffSettings')
const TemplateSettings = page(() => import('@/features/settings/template-settings'), 'TemplateSettings')
const ChecklistSettings = page(() => import('@/features/settings/checklist-settings'), 'ChecklistSettings')
const FinanceSettings = page(() => import('@/features/settings/finance-settings'), 'FinanceSettings')
const AutomationSettings = page(() => import('@/features/settings/automation-settings'), 'AutomationSettings')
const IntegrationSettings = page(() => import('@/features/settings/automation-settings'), 'IntegrationSettings')
const ReportsPage = page(() => import('@/features/reports/reports-page'), 'ReportsPage')
const MessagesPage = page(() => import('@/features/comms/messages-page'), 'MessagesPage')
const BillingSettings = page(() => import('@/features/settings/billing-settings'), 'BillingSettings')
const LandingPage = page(() => import('@/features/landing/landing-page'), 'LandingPage')
const PlatformPage = page(() => import('@/features/platform/platform-page'), 'PlatformPage')

function guard(anyOf: Permission[], element: React.ReactNode) {
  return <RequirePermission anyOf={anyOf}>{element}</RequirePermission>
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        path: '/welcome',
        element: (
          <Suspense fallback={<FullPageSpinner />}>
            <LandingPage />
          </Suspense>
        ),
      },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      {
        path: '/onboarding',
        element: (
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        ),
      },
      {
        path: '/platform',
        element: (
          <RequireAuth>
            <Suspense fallback={<FullPageSpinner />}>
              <PlatformPage />
            </Suspense>
          </RequireAuth>
        ),
      },
      {
        path: '/',
        element: (
          <RequireAuth>
            <RequireOrg>
              <AppShell />
            </RequireOrg>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'properties', element: guard(['property.view'], <PropertiesPage />) },
          { path: 'properties/new', element: guard(['property.create'], <PropertyNewPage />) },
          { path: 'properties/:id', element: guard(['property.view'], <PropertyDetailPage />) },
          { path: 'properties/:id/edit', element: guard(['property.edit'], <PropertyEditPage />) },
          { path: 'bookings', element: guard(['booking.view'], <BookingsPage />) },
          { path: 'bookings/new', element: guard(['booking.manage'], <BookingNewPage />) },
          { path: 'bookings/:id', element: guard(['booking.view'], <BookingDetailPage />) },
          { path: 'bookings/:id/edit', element: guard(['booking.manage'], <BookingEditPage />) },
          { path: 'bookings/:id/print', element: guard(['booking.view'], <BookingPrintPage />) },
          { path: 'calendar', element: guard(['booking.view'], <CalendarPage />) },
          { path: 'guests', element: guard(['guest.view'], <GuestsPage />) },
          { path: 'guests/:id', element: guard(['guest.view'], <GuestDetailPage />) },
          { path: 'finances', element: guard(['finance.view'], <FinancesPage />) },
          { path: 'housekeeping', element: guard(['housekeeping.view'], <HousekeepingPage />) },
          { path: 'housekeeping/:id', element: guard(['housekeeping.view'], <TaskDetailPage />) },
          { path: 'maintenance', element: guard(['maintenance.view'], <MaintenancePage />) },
          { path: 'maintenance/:id', element: guard(['maintenance.view'], <MaintenanceDetailPage />) },
          { path: 'inventory', element: guard(['inventory.view'], <InventoryPage />) },
          { path: 'reports', element: guard(['reports.operational', 'reports.financial'], <ReportsPage />) },
          { path: 'messages', element: guard(['comms.send'], <MessagesPage />) },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="profile" replace /> },
              { path: 'profile', element: <ProfileSettings /> },
              { path: 'business', element: guard(['org.settings'], <BusinessSettings />) },
              { path: 'bookings', element: guard(['org.settings'], <BookingSettings />) },
              { path: 'staff', element: guard(['staff.manage'], <StaffSettings />) },
              { path: 'templates', element: guard(['comms.templates'], <TemplateSettings />) },
              { path: 'checklists', element: guard(['housekeeping.manage'], <ChecklistSettings />) },
              { path: 'expenses', element: guard(['org.settings'], <FinanceSettings />) },
              { path: 'notifications', element: guard(['org.settings'], <AutomationSettings />) },
              { path: 'integrations', element: guard(['integrations.manage'], <IntegrationSettings />) },
              { path: 'billing', element: guard(['billing.manage'], <BillingSettings />) },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
