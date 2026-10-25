import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../ui/TopBar';
import { BottomTabBar, type TabKey } from '../ui/BottomTabBar';
import { StatChip } from '../ui/StatChip';
import { SectionHeading } from '../ui/SectionHeading';
import { theme } from '../ui/theme';
import { useSafeInsets } from '../ui/safeInsets';
import { useAsync } from '../ui/hooks';
import { useNavStack } from '../ui/navStack';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../screens/LogoutButton';
import { hasAdminRole, hasSecurityRole, hasResidentRole } from './shared/roles';
import { NotificationsScreen } from './shared/NotificationsScreen';
import type { ResourceClients, GateOfflineQueue } from '../resources';
import type { Community, Unit } from '../models/community';
import { CommunityListScreen } from './admin/CommunityListScreen';
import { CommunityManageScreen } from './admin/CommunityManageScreen';
import { WingsScreen } from './admin/WingsScreen';
import { UnitListScreen } from './admin/UnitListScreen';
import { UnitDetailScreen } from './admin/UnitDetailScreen';
import { ResidentListScreen } from './admin/ResidentListScreen';
import { AddResidentScreen } from './admin/AddResidentScreen';
import { SecurityStaffListScreen } from './admin/SecurityStaffListScreen';
import { AnnouncementAdminScreen } from './admin/AnnouncementAdminScreen';
import { MyHouseholdScreen } from './resident/MyHouseholdScreen';
import { MyProfileScreen } from './resident/MyProfileScreen';
import { CommunicationPreferencesScreen } from './resident/CommunicationPreferencesScreen';
import { InviteVisitorScreen } from './resident/InviteVisitorScreen';
import { MyVisitorsScreen } from './resident/MyVisitorsScreen';
import { WalkInApprovalsScreen } from './resident/WalkInApprovalsScreen';
import { RecurringVisitorsScreen } from './resident/RecurringVisitorsScreen';
import { ParcelListScreen } from './resident/ParcelListScreen';
import { RaiseTicketScreen } from './resident/RaiseTicketScreen';
import { TicketListScreen } from './resident/TicketListScreen';
import { AnnouncementsScreen } from './resident/AnnouncementsScreen';
import { GuardLookupScreen } from './guard/LookupScreen';
import { VisitPassVerifyScreen } from './guard/VisitPassVerifyScreen';
import { WalkInCaptureScreen } from './guard/WalkInCaptureScreen';
import { EntryExitLogScreen } from './guard/EntryExitLogScreen';
import { WatchlistScreen } from './guard/WatchlistScreen';
import { SosScreen } from './guard/SosScreen';
import { RegisterParcelScreen } from './guard/RegisterParcelScreen';
import { ParcelCustodyScreen } from './guard/ParcelCustodyScreen';
import { ParcelHandoverScreen } from './guard/ParcelHandoverScreen';
import { WorkOrderListScreen } from './guard/WorkOrderListScreen';
import { AssetLookupScreen } from './guard/AssetLookupScreen';

export interface HomeNavigatorProps {
  resources: ResourceClients;
  /**
   * Legacy app kind — retained only for the guard offline-queue wiring. Feature VISIBILITY is driven
   * by the signed-in ROLES (see below), not by this, so one merged app serves resident + guard +
   * admin based on who logs in.
   */
  app: 'resident' | 'guard';
  /**
   * Whether to surface the admin management section. Computed from the signed-in roles; the server
   * still enforces real authz, so this flag only decides what to *offer*, never what is *allowed*.
   */
  isAdmin?: boolean;
  /** Shown as the home heading / app name fallback. */
  appTitle: string;
  /** Optional offline write queue (guard) for the gate entry/exit screen (Task 17.1). */
  offlineQueue?: GateOfflineQueue;
}

/**
 * Authenticated app shell: a persistent {@link TopBar} (society/app name + user, notification bell)
 * and {@link BottomTabBar} (Home · Services · Profile) around three tab bodies, with feature screens
 * pushed full-screen over the shell. Still a minimal state-based navigator (no navigation library) —
 * the surface is a tab switch plus a one-level drill-down, so a `useState` route is the smallest
 * correct thing. Everything is styled from the shared {@link theme}, so a global colour change flows
 * through the whole shell.
 */
export function HomeNavigator({ resources, isAdmin = false, appTitle, offlineQueue }: HomeNavigatorProps) {
  const { displayName, roles } = useAuth();
  // Feature visibility is driven by the signed-in ROLES (merged app): a login sees resident, guard
  // and/or admin features based on who they are. `isAdmin` is passed in (computed the same way) and
  // kept authoritative for the admin section. A user with none of admin/security is treated as a
  // resident so they still get a usable home. The server enforces real authz on every call.
  const isSecurity = useMemo(() => hasSecurityRole(roles), [roles]);
  const isAdminFromRoles = useMemo(() => hasAdminRole(roles), [roles]);
  const isAdminRole = isAdmin || isAdminFromRoles;
  const isResidentFromRoles = useMemo(() => hasResidentRole(roles), [roles]);
  const isResident = isResidentFromRoles || (!isSecurity && !isAdminRole);
  // A real route stack (not a single route): pushing a feature screen keeps the shell beneath it,
  // the Android hardware-back pops one screen, and only the top route renders (per-route rendering).
  const nav = useNavStack<Route>({ name: 'tabs', tab: 'home' });
  const route = nav.current;
  const go = (r: Route) => nav.push(r);
  const back = () => nav.pop();
  // Tab switching models standard app tab history so the hardware back is never a dead-end:
  //  - Home       → stack [Home]              (back from Home exits the app, as expected)
  //  - Services   → stack [Home, Services]    (back returns to Home, not out of the app)
  //  - Profile    → stack [Home, Profile]     (back returns to Home)
  // Any open feature screen is cleared by the rebuild (switching tabs resets the drill-down).
  const setTab = (tab: TabKey) => {
    const homeBase: Route = { name: 'tabs', tab: 'home' };
    nav.replaceAll(tab === 'home' ? [homeBase] : [homeBase, { name: 'tabs', tab }]);
  };

  // Society name for the top bar: the first community the signed-in user can see, else the app name.
  const societyQuery = useAsync(
    (signal) => resources.communities.list({ pageSize: 1 }, {}, { signal }),
    [resources],
  );
  const societyName =
    societyQuery.data?.items?.[0]?.name ?? `CommunityOS · ${appTitle}`;

  // Show the SIGNED-IN person's own real name in the header — resolved from THEIR OWN resident row
  // via `GET /residents/me` (the row whose UserId == the token's user id, the Resident→User link),
  // not phone/email and never a stranger. ONE self-targeted call — no list-and-filter. Works for
  // resident, guard and admin uniformly; a superadmin has no resident row (me.resident == null) →
  // fall back to the login identifier.
  const isResidentPrincipal = isResident && !isAdminRole && !isSecurity;
  const meQuery = useAsync(
    (signal) => resources.residents.me({ signal }).catch(() => null),
    [resources],
  );
  const myName = meQuery.data?.resident?.name;
  const userName = myName ?? displayName ?? 'Signed in';

  // Unread notification count for the top-bar bell. Reloaded on tab/route change (cheap count call)
  // so it refreshes after the user reads notifications or a new one arrives between navigations.
  const unreadQuery = useAsync(
    (signal) => resources.notifications.unreadCount({ signal }).catch(() => 0),
    [resources, route.name],
  );
  const unreadCount = unreadQuery.data ?? 0;

  // Only the top route renders. Feature detail screens render full-screen (their own back → pop).
  switch (route.name) {
    case 'communities':
      return (
        <CommunityListScreen
          resources={resources}
          onBack={back}
          canCreate
          onOpenCommunity={(community) => go({ name: 'communityManage', community })}
        />
      );
    case 'communityManage':
      return (
        <CommunityManageScreen
          resources={resources}
          community={route.community}
          onBack={back}
          onWings={() => go({ name: 'wings', community: route.community })}
          onViewUnits={() => go({ name: 'units', community: route.community })}
        />
      );
    case 'wings':
      return <WingsScreen resources={resources} community={route.community} onBack={back} />;
    case 'units':
      return (
        <UnitListScreen
          resources={resources}
          {...(route.community ? { community: route.community } : {})}
          onBack={back}
          onOpenUnit={(unit) => go({ name: 'unit', unit, origin: { name: 'units', community: route.community } })}
        />
      );
    case 'allUnits':
      return (
        <UnitListScreen
          resources={resources}
          onBack={back}
          onOpenUnit={(unit) => go({ name: 'unit', unit, origin: { name: 'allUnits' } })}
        />
      );
    case 'unit':
      return (
        <UnitDetailScreen
          resources={resources}
          unitId={route.unit.id}
          initialUnit={route.unit}
          onBack={back}
        />
      );
    case 'residents':
      return <ResidentListScreen resources={resources} onBack={back} onAddResident={() => go({ name: 'addResident' })} />;
    case 'queue':
      return <ResidentListScreen resources={resources} queueOnly onBack={back} />;
    case 'addResident':
      return <AddResidentScreen resources={resources} onBack={back} onSaved={() => back()} />;

    case 'securityStaff':
      return <SecurityStaffListScreen resources={resources} onBack={back} />;
    case 'announcementsAdmin':
      return <AnnouncementAdminScreen resources={resources} onBack={back} />;
    case 'myHousehold':
      return <MyHouseholdScreen resources={resources} onBack={back} />;
    case 'myProfile':
      return <MyProfileScreen resources={resources} onBack={back} />;
    case 'commPrefs':
      return <CommunicationPreferencesScreen resources={resources} onBack={back} />;
    case 'lookup':
      return <GuardLookupScreen resources={resources} onBack={back} />;
    case 'inviteVisitor':
      return <InviteVisitorScreen resources={resources} onBack={back} />;

    case 'myVisitors':
      return <MyVisitorsScreen resources={resources} onBack={back} />;
    case 'walkInApprovals':
      return <WalkInApprovalsScreen resources={resources} onBack={back} />;
    case 'notifications':
      return <NotificationsScreen resources={resources} onBack={back} />;
    case 'recurringVisitors':
      return <RecurringVisitorsScreen resources={resources} onBack={back} />;
    case 'myParcels':
      return <ParcelListScreen resources={resources} onBack={back} />;
    case 'raiseTicket':
      return <RaiseTicketScreen resources={resources} onBack={back} />;
    case 'myTickets':
      return <TicketListScreen resources={resources} onBack={back} />;
    case 'announcements':
      return <AnnouncementsScreen resources={resources} onBack={back} />;
    case 'verifyPass':
      return <VisitPassVerifyScreen resources={resources} onBack={back} />;
    case 'walkInCapture':
      return <WalkInCaptureScreen resources={resources} onBack={back} />;
    case 'entryExit':
      return (
        <EntryExitLogScreen
          resources={resources}
          {...(offlineQueue ? { offlineQueue } : {})}
          onBack={back}
        />
      );
    case 'watchlist':
      return <WatchlistScreen resources={resources} onBack={back} />;
    case 'sos':
      return <SosScreen resources={resources} onBack={back} />;
    case 'registerParcel':
      return <RegisterParcelScreen resources={resources} onBack={back} />;
    case 'parcelCustody':
      return <ParcelCustodyScreen resources={resources} onBack={back} />;
    case 'parcelHandover':
      return <ParcelHandoverScreen resources={resources} onBack={back} />;
    case 'workOrders':
      return (
        <WorkOrderListScreen
          resources={resources}
          {...(route.assetId ? { assetId: route.assetId } : {})}
          {...(route.title ? { title: route.title } : {})}
          onBack={back}
        />
      );
    case 'assetLookup':
      return (
        <AssetLookupScreen
          resources={resources}
          onOpenWorkOrders={(asset) =>
            go({ name: 'workOrders', assetId: asset.id, title: `Work orders · ${asset.name}` })
          }
          onBack={back}
        />
      );
    case 'tabs':
    default: {
      const tab = route.tab;
      return (
        <View style={styles.shell}>
          {tab !== 'home' ? (
            <TopBar
              title={tab === 'services' ? 'Services' : societyName}
              subtitle={tab === 'services' ? 'Community & Unit Directory' : userName}
              notificationCount={unreadCount}
              onPressNotifications={() => go({ name: 'notifications' })}
            />
          ) : null}
          <View style={styles.body}>
            {tab === 'home' ? (
              <DashboardTab
                isResident={isResident}
                isSecurity={isSecurity}
                userName={userName}
                societyName={societyName}
                unitLabel={meQuery.data?.units?.[0]?.unitNumber ?? null}
                unreadCount={unreadCount}
                onNavigate={go}
                onOpenServices={() => setTab('services')}
                onOpenNotifications={() => go({ name: 'notifications' })}
                onOpenProfile={() => setTab('profile')}
              />
            ) : tab === 'services' ? (
              <ServicesTab isResident={isResident} isSecurity={isSecurity} isAdmin={isAdminRole} onNavigate={go} />
            ) : (
              <ProfileTab
                userName={userName}
                appTitle={appTitle}
                societyName={societyName}
                roles={roles}
                isAdmin={isAdminRole}
                isSecurity={isSecurity}
                onOpenNotifications={() => go({ name: 'notifications' })}
                {...(isResidentPrincipal ? { onManageProfile: () => go({ name: 'myProfile' }) } : {})}
              />
            )}
          </View>
          <BottomTabBar active={tab} onChange={setTab} />
        </View>
      );
    }
  }
}

/** Where the unit detail returns to — the list the user opened it from. */
type UnitOrigin = { name: 'units'; community?: Community } | { name: 'allUnits' };

/** The internal route union for the authenticated area. `tabs` is the shell; the rest are detail screens. */
type Route =
  | { name: 'tabs'; tab: TabKey }
  | { name: 'communities' }
  | { name: 'communityManage'; community: Community }
  | { name: 'wings'; community: Community }
  | { name: 'units'; community?: Community }
  | { name: 'allUnits' }
  | { name: 'unit'; unit: Unit; origin: UnitOrigin }
  | { name: 'residents' }
  | { name: 'queue' }
  | { name: 'addResident' }
  | { name: 'securityStaff' }
  | { name: 'announcementsAdmin' }
  | { name: 'myHousehold' }
  | { name: 'myProfile' }
  | { name: 'commPrefs' }
  | { name: 'lookup' }
  | { name: 'inviteVisitor' }
  | { name: 'myVisitors' }
  | { name: 'walkInApprovals' }
  | { name: 'notifications' }
  | { name: 'recurringVisitors' }
  | { name: 'myParcels' }
  | { name: 'raiseTicket' }
  | { name: 'myTickets' }
  | { name: 'announcements' }
  | { name: 'verifyPass' }
  | { name: 'walkInCapture' }
  | { name: 'entryExit' }
  | { name: 'watchlist' }
  | { name: 'sos' }
  | { name: 'registerParcel' }
  | { name: 'parcelCustody' }
  | { name: 'parcelHandover' }
  | { name: 'workOrders'; assetId?: string; title?: string }
  | { name: 'assetLookup' };

/** A feature entry in the Services list. */
interface Feature {
  readonly route: Route;
  readonly label: string;
  /** One-line description shown under the label in the Services list. */
  readonly subtitle?: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly tint?: string;
}

/** A labelled group of features for the Services grid. */
interface FeatureGroup {
  readonly title: string;
  readonly features: readonly Feature[];
}

/** Resident feature groups (self-service). */
function residentGroups(): FeatureGroup[] {
  return [
    {
      title: 'My home',
      features: [
        { route: { name: 'myProfile' }, label: 'My Profile', subtitle: 'Your details and contact info', icon: 'person-circle', tint: theme.color.primary },
        { route: { name: 'myHousehold' }, label: 'My Household', subtitle: 'Unit, members, vehicles and pets', icon: 'home', tint: theme.color.info },
        { route: { name: 'commPrefs' }, label: 'Preferences', subtitle: 'Notification and contact settings', icon: 'options', tint: '#8250df' },
      ],
    },
    {
      title: 'Visitors',
      features: [
        { route: { name: 'inviteVisitor' }, label: 'Invite Visitor', subtitle: 'Create a pre-approved gate pass', icon: 'person-add', tint: '#1a7f37' },
        { route: { name: 'myVisitors' }, label: 'My Visitors', subtitle: 'See and manage your visitors', icon: 'people', tint: '#0969da' },
        { route: { name: 'walkInApprovals' }, label: 'Approvals', subtitle: 'Approve or reject walk-in visitors', icon: 'checkmark-done', tint: '#bf8700' },
        { route: { name: 'recurringVisitors' }, label: 'Recurring', subtitle: 'Regular visitors like staff or help', icon: 'repeat', tint: '#0969da' },
      ],
    },
    {
      title: 'Parcels',
      features: [
        { route: { name: 'myParcels' }, label: 'My Parcels', subtitle: 'Track deliveries held at the gate', icon: 'cube', tint: '#cf5500' },
      ],
    },
    {
      title: 'Helpdesk',
      features: [
        { route: { name: 'raiseTicket' }, label: 'Raise Ticket', subtitle: 'Report an issue or request', icon: 'create', tint: '#cf222e' },
        { route: { name: 'myTickets' }, label: 'My Tickets', subtitle: 'Track your open and past tickets', icon: 'list', tint: '#1f6feb' },
      ],
    },
    {
      title: 'Community',
      features: [
        { route: { name: 'announcements' }, label: 'Announcements', subtitle: 'Notices from your community', icon: 'megaphone', tint: '#8250df' },
      ],
    },
  ];
}

/** Guard feature groups (operations). */
function guardGroups(): FeatureGroup[] {
  return [
    {
      title: 'Gate',
      features: [
        { route: { name: 'verifyPass' }, label: 'Verify Pass', subtitle: 'Scan or enter a visitor pass code', icon: 'qr-code', tint: '#1a7f37' },
        { route: { name: 'walkInCapture' }, label: 'Walk-in', subtitle: 'Register an unexpected visitor', icon: 'person-add', tint: '#bf8700' },
        { route: { name: 'walkInApprovals' }, label: 'Walk-in Status', subtitle: 'See walk-ins & if approved', icon: 'people', tint: '#0969da' },
        { route: { name: 'entryExit' }, label: 'Entry / Exit', subtitle: 'Record who comes and goes', icon: 'swap-horizontal', tint: '#0969da' },
        { route: { name: 'watchlist' }, label: 'Watchlist', subtitle: 'Flagged people and vehicles', icon: 'alert-circle', tint: '#cf222e' },
      ],
    },
    {
      title: 'Parcels',
      features: [
        { route: { name: 'registerParcel' }, label: 'Register', subtitle: 'Log a parcel received at the gate', icon: 'cube', tint: '#cf5500' },
        { route: { name: 'parcelCustody' }, label: 'Custody', subtitle: 'Parcels currently held', icon: 'file-tray-stacked', tint: '#8250df' },
        { route: { name: 'parcelHandover' }, label: 'Handover', subtitle: 'Release a parcel to a resident', icon: 'hand-left', tint: '#1f6feb' },
      ],
    },
    {
      title: 'Security',
      features: [
        { route: { name: 'sos' }, label: 'SOS', subtitle: 'Raise an emergency alert', icon: 'warning', tint: '#cf222e' },
        { route: { name: 'lookup' }, label: 'Lookup', subtitle: 'Find a resident or unit', icon: 'people', tint: '#1f6feb' },
      ],
    },
  ];
  // Maintenance (Work Orders / Find Asset) is deliberately NOT offered to guards: managing work
  // orders + assets is a facility/maintenance-staff + admin function, and the Security role holds no
  // WorkOrder/Asset permission — so the server would 403 ("you don't have permission"). Rather than
  // grant guards rights they shouldn't have, we don't surface the tiles. (The screens + routes still
  // exist for an admin/maintenance surface.)
}

/** Admin management features (added when the signed-in roles look like an admin role). */
function adminGroup(): FeatureGroup {
  return {
    title: 'Management',
    features: [
      { route: { name: 'communities' }, label: 'Communities', subtitle: 'Manage societies and their setup', icon: 'business', tint: '#8250df' },
      { route: { name: 'allUnits' }, label: 'Units', subtitle: 'Browse, add or edit units', icon: 'grid', tint: '#0969da' },
      { route: { name: 'residents' }, label: 'Residents', subtitle: 'Add, edit and manage residents', icon: 'people', tint: '#1a7f37' },
      { route: { name: 'securityStaff' }, label: 'Security Staff', subtitle: 'Guard logins and access', icon: 'shield-half', tint: '#cf222e' },
      { route: { name: 'announcementsAdmin' }, label: 'Announcements', subtitle: 'Publish and manage notices', icon: 'megaphone', tint: '#8250df' },
      { route: { name: 'queue' }, label: 'Verification', subtitle: 'Approve pending residents', icon: 'shield-checkmark', tint: '#bf8700' },
    ],
  };
}

/** A rich quick action for the dashboard. */
interface QuickAction {
  route: Route;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

/** A friendly, time-of-day greeting. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Today's date, formatted for the hero subline. */
function todayLabel(): string {
  try {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

/**
 * Home tab — society-app dashboard (reference image 1): a blue gradient header card holding the
 * profile (avatar + name + unit), SOS + notification bell, and a Community/Personal segmented tab,
 * over a clean 2-column grid of feature tiles. "Community" shows community features; "Personal"
 * shows the resident's own-account tiles.
 */
function DashboardTab({
  isResident,
  isSecurity,
  userName,
  societyName,
  unitLabel,
  unreadCount,
  onNavigate,
  onOpenServices,
  onOpenNotifications,
  onOpenProfile,
}: {
  isResident: boolean;
  isSecurity: boolean;
  userName: string;
  societyName: string;
  unitLabel: string | null;
  unreadCount: number;
  onNavigate: (r: Route) => void;
  onOpenServices: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
}) {
  const insets = useSafeInsets();
  const [segment, setSegment] = useState<'community' | 'personal'>('community');

  // Community tiles: role-aware (guard gate ops first, then resident features). Personal tiles:
  // the resident's own-account actions. Each tile is an icon + label in the image-1 grid style.
  const communityTiles: DashTile[] = useMemo(() => {
    const guard: DashTile[] = [
      { route: { name: 'verifyPass' }, label: 'Verify Pass', icon: 'qr-code', tint: theme.color.primary },
      { route: { name: 'walkInCapture' }, label: 'Register Walk-in', icon: 'person-add', tint: '#0ea5e9' },
      { route: { name: 'entryExit' }, label: 'Entry / Exit', icon: 'swap-horizontal', tint: '#16a34a' },
      { route: { name: 'registerParcel' }, label: 'Register Parcel', icon: 'cube', tint: '#d97706' },
      { route: { name: 'walkInApprovals' }, label: 'Walk-in Status', icon: 'people', tint: '#8250df' },
      { route: { name: 'watchlist' }, label: 'Watchlist', icon: 'shield-checkmark', tint: '#dc2626' },
    ];
    const resident: DashTile[] = [
      { route: { name: 'inviteVisitor' }, label: 'Visitors', icon: 'person-add', tint: theme.color.primary },
      { route: { name: 'myVisitors' }, label: 'My Visitors', icon: 'people', tint: '#8250df' },
      { route: { name: 'announcements' }, label: 'Notices', icon: 'megaphone', tint: '#0ea5e9' },
      { route: { name: 'raiseTicket' }, label: 'Help Desk', icon: 'chatbubble-ellipses', tint: '#16a34a' },
      { route: { name: 'myParcels' }, label: 'Parcels', icon: 'cube', tint: '#d97706' },
      { route: { name: 'recurringVisitors' }, label: 'Daily Help', icon: 'repeat', tint: '#db2777' },
    ];
    return [...(isSecurity ? guard : []), ...(isResident ? resident : [])];
  }, [isResident, isSecurity]);

  const personalTiles: DashTile[] = useMemo(
    () => [
      { route: { name: 'myProfile' }, label: 'My Profile', icon: 'person-circle', tint: theme.color.primary },
      { route: { name: 'myHousehold' }, label: 'My Household', icon: 'home', tint: '#16a34a' },
      { route: { name: 'myVisitors' }, label: 'My Visitors', icon: 'people', tint: '#8250df' },
      { route: { name: 'myParcels' }, label: 'My Parcels', icon: 'cube', tint: '#d97706' },
      { route: { name: 'notifications' }, label: 'Notifications', icon: 'notifications', tint: '#0ea5e9' },
      { route: { name: 'commPrefs' }, label: 'Preferences', icon: 'options', tint: '#64748b' },
    ],
    [],
  );

  // Personal tab only makes sense for a resident principal; a guard-only login stays on Community.
  const showPersonal = isResident;
  const tiles = segment === 'personal' && showPersonal ? personalTiles : communityTiles;

  return (
    <ScrollView contentContainerStyle={styles.dashScroll} showsVerticalScrollIndicator={false}>
      {/* Emerald gradient hero header card */}
      <View style={[styles.dashHeader, { paddingTop: Math.max(theme.spacing.lg, insets.top + theme.spacing.sm) }]}>
        <View style={styles.dashHeaderBlobA} />
        <View style={styles.dashHeaderBlobB} />

        <View style={styles.dashHeaderTop}>
          <View style={styles.dashBrandRow}>
            <View style={styles.dashBrandIcon}>
              <Ionicons name="home" size={13} color="#fff" />
            </View>
            <Text style={styles.dashBrand}>URBANNEST</Text>
          </View>
          <View style={styles.dashHeaderIcons}>
            {/* SOS is a guard gate operation (needs Create SosAlert) — only security can raise it.
                Residents don't have that permission, so the button is security-only. */}
            {isSecurity ? (
              <Pressable
                onPress={() => onNavigate({ name: 'sos' })}
                accessibilityRole="button"
                accessibilityLabel="SOS emergency"
                hitSlop={8}
                style={styles.dashIconBtn}
              >
                <Text style={styles.dashSosText}>SOS</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onOpenNotifications}
              accessibilityRole="button"
              accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              hitSlop={8}
              style={styles.dashIconBtn}
            >
              <Ionicons name="notifications" size={18} color="#fff" />
              {unreadCount > 0 ? (
                <View style={styles.dashBadge}>
                  <Text style={styles.dashBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.dashProfileRow} onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Open profile">
          <View style={styles.dashAvatar}>
            <Text style={styles.dashInitials}>{initialsOf(userName)}</Text>
          </View>
          <View style={styles.dashProfileText}>
            <Text style={styles.dashGreeting}>{greeting()},</Text>
            <Text style={styles.dashName} numberOfLines={1}>{userName}</Text>
            <View style={styles.dashUnitRow}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
              <Text style={styles.dashUnit} numberOfLines={1}>
                {unitLabel ? `${unitLabel} • ` : ''}{societyName}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Community / Personal segmented tabs (inside the header card). */}
        {showPersonal ? (
          <View style={styles.dashTabs}>
            <DashTab label="Community" active={segment === 'community'} onPress={() => setSegment('community')} />
            <DashTab label="Personal" active={segment === 'personal'} onPress={() => setSegment('personal')} />
          </View>
        ) : null}
      </View>

      {/* Feature tile grid. */}
      <View style={styles.dashGrid}>
        {tiles.map((t) => (
          <Pressable
            key={`${t.label}-${t.route.name}`}
            onPress={() => onNavigate(t.route)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={({ pressed }) => [styles.dashTile, pressed ? styles.dashTilePressed : null]}
          >
            <View style={[styles.dashTileIcon, { backgroundColor: `${t.tint}1a` }]}>
              <Ionicons name={t.icon} size={26} color={t.tint} />
            </View>
            <Text style={styles.dashTileLabel} numberOfLines={2}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Explore all services */}
      <Pressable
        onPress={onOpenServices}
        accessibilityRole="button"
        accessibilityLabel="Explore all services"
        style={({ pressed }) => [styles.exploreCard, pressed ? styles.explorePressed : null]}
      >
        <View style={styles.exploreBadge}>
          <Ionicons name="apps" size={22} color={theme.color.primary} />
        </View>
        <View style={styles.exploreText}>
          <Text style={styles.exploreTitle}>Explore all services</Text>
          <Text style={styles.exploreSub}>Everything you can do, in one place</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={theme.color.primary} />
      </Pressable>
    </ScrollView>
  );
}

/** One feature tile descriptor for the dashboard grid. */
interface DashTile {
  route: Route;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

/** A segmented tab inside the gradient header (Community / Personal). */
function DashTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.dashTab, active ? styles.dashTabActive : null]}
    >
      <Text style={[styles.dashTabText, active ? styles.dashTabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

/** Services tab: every feature as a styled grid, grouped by area. */
function ServicesTab({
  isResident,
  isSecurity,
  isAdmin,
  onNavigate,
}: {
  isResident: boolean;
  isSecurity: boolean;
  isAdmin: boolean;
  onNavigate: (r: Route) => void;
}) {
  // Compose the menu from the user's roles (a person can be several): resident self-service, guard
  // gate operations, and/or the admin management section.
  const groups = useMemo(() => {
    const g: FeatureGroup[] = [];
    if (isResident) g.push(...residentGroups());
    if (isSecurity) g.push(...guardGroups());
    if (isAdmin) g.push(adminGroup());
    return g;
  }, [isResident, isSecurity, isAdmin]);

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.servicesHeader}>
        <Text style={styles.servicesTitle}>Services</Text>
        <Text style={styles.servicesSub}>Everything you can do, in one place</Text>
      </View>
      {groups.map((group) => (
        <View key={group.title} style={styles.serviceGroup}>
          <Text style={styles.groupLabel}>{group.title.toUpperCase()}</Text>
          {/* Grouped "inset" card: full-width rows with hairline dividers between them. */}
          <View style={styles.insetCard}>
            {group.features.map((f, i) => (
              <ServiceRow
                key={f.label}
                feature={f}
                first={i === 0}
                onPress={() => onNavigate(f.route)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** One full-width Services row: colored icon tile + label + subtitle + chevron (iOS-settings style). */
function ServiceRow({ feature, first, onPress }: { feature: Feature; first: boolean; onPress: () => void }) {
  const tint = feature.tint ?? theme.color.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={feature.label}
      accessibilityHint={feature.subtitle ? `${feature.subtitle}. Opens ${feature.label}` : `Open ${feature.label}`}
      style={({ pressed }) => [styles.serviceRow, !first ? styles.serviceRowDivider : null, pressed ? styles.serviceRowPressed : null]}
    >
      <View style={[styles.serviceIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={feature.icon} size={20} color={tint} />
      </View>
      <View style={styles.serviceText}>
        <Text style={styles.serviceLabel} numberOfLines={1}>{feature.label}</Text>
        {feature.subtitle ? <Text style={styles.serviceSubtitle} numberOfLines={1}>{feature.subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
    </Pressable>
  );
}

/** Two-letter initials from a name/identifier for the avatar. */
function initialsOf(name: string): string {
  const cleaned = name.replace(/@.*$/, '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** One row in the profile info/settings list. */
function ProfileRow({
  icon,
  label,
  value,
  tint,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  tint?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const accent = tint ?? theme.color.primary;
  const body = (
    <View style={[styles.pRow, last ? null : styles.pRowBorder]}>
      <View style={[styles.pRowIcon, { backgroundColor: `${accent}1f` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={styles.pRowText}>
        <Text style={styles.pRowLabel}>{label}</Text>
        {value ? <Text style={styles.pRowValue} numberOfLines={1}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => (pressed ? styles.pRowPressed : null)}>
        {body}
      </Pressable>
    );
  }
  return body;
}

/** Per-role identity used in the profile hero (icon, chip label, accent). */
function roleIdentity(isAdmin: boolean, isSecurity: boolean): {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
} {
  if (isAdmin) return { icon: 'ribbon', label: 'Administrator', tint: '#8250df' };
  if (isSecurity) return { icon: 'shield-half', label: 'Security', tint: theme.color.info };
  return { icon: 'home', label: 'Resident', tint: theme.color.success };
}

/**
 * Profile tab — one shared screen for resident / security / admin, styled in the app's
 * glass + clay + neumorphism language (same as the login screen). The hero adapts its badge,
 * accent and role label per role; the resident "Manage" card only shows when `onManageProfile`
 * is passed. Pure RN (no blur/gradient deps) so it reloads over JS with no native rebuild.
 */
function ProfileTab({
  userName,
  appTitle,
  societyName,
  roles,
  isAdmin,
  isSecurity,
  onManageProfile,
  onOpenNotifications,
}: {
  userName: string;
  appTitle: string;
  societyName: string;
  roles: readonly string[];
  isAdmin: boolean;
  isSecurity: boolean;
  onManageProfile?: () => void;
  onOpenNotifications?: () => void;
}) {
  const roleLabel = roles.length > 0 ? roles.join(', ') : appTitle;
  const ident = roleIdentity(isAdmin, isSecurity);
  const quickActions: { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; onPress: () => void }[] = [
    { icon: 'notifications', label: 'Alerts', tint: theme.color.warning, onPress: onOpenNotifications ?? (() => {}) },
    ...(onManageProfile ? [{ icon: 'create' as const, label: 'Edit', tint: theme.color.primary, onPress: onManageProfile }] : []),
    { icon: 'lock-closed', label: 'Security', tint: theme.color.danger, onPress: () => {} },
    { icon: 'help-buoy', label: 'Help', tint: theme.color.info, onPress: () => {} },
  ];
  return (
    <ScrollView contentContainerStyle={styles.pScroll} showsVerticalScrollIndicator={false}>
      {/* Full-bleed banner: coloured role wash + blobs, avatar sits half-overlapping the card below. */}
      <View style={[styles.pBanner, { backgroundColor: ident.tint }]}>
        <View style={styles.pBannerBlobA} />
        <View style={styles.pBannerBlobB} />
      </View>

      {/* Floating identity card that overlaps the banner (distinct overlapping-card layout). */}
      <View style={styles.pIdentityWrap}>
        <View style={styles.pAvatarClay}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>{initialsOf(userName)}</Text>
          </View>
          <View style={[styles.pAvatarBadge, { backgroundColor: ident.tint }]}>
            <Ionicons name={ident.icon} size={14} color={theme.color.primaryText} />
          </View>
        </View>
        <View style={styles.pIdentityCard}>
          <View style={styles.pAvatarSpacer} />
          <Text style={styles.pIdName} numberOfLines={1}>{userName}</Text>
          <View style={[styles.pIdRolePill, { backgroundColor: `${ident.tint}1f` }]}>
            <Ionicons name={ident.icon} size={13} color={ident.tint} />
            <Text style={[styles.pIdRoleText, { color: ident.tint }]} numberOfLines={1}>{ident.label}</Text>
          </View>
          <View style={styles.pIdCommunity}>
            <Ionicons name="business" size={13} color={theme.color.mutedText} />
            <Text style={styles.pIdCommunityText} numberOfLines={1}>{societyName}</Text>
          </View>

          {/* Horizontal quick-action chips (new element — not in the old list design). */}
          <View style={styles.pQuickRow}>
            {quickActions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                style={({ pressed }) => [styles.pQuick, pressed ? styles.pQuickPressed : null]}
              >
                <View style={[styles.pQuickIcon, { backgroundColor: `${a.tint}1f` }]}>
                  <Ionicons name={a.icon} size={20} color={a.tint} />
                </View>
                <Text style={styles.pQuickLabel} numberOfLines={1}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Account info only (read-only). The actionable items live in the quick-action chips above,
          so we don't repeat Notifications/Security/Help/Manage as a second list here. */}
      <View style={styles.pBody}>
        <Text style={styles.pSection}>Account</Text>
        <View style={styles.pCard}>
          <ProfileRow icon="person-outline" label="Signed in as" value={userName} tint={theme.color.primary} />
          <ProfileRow icon="ribbon-outline" label="Role" value={roleLabel} tint={ident.tint} />
          <ProfileRow icon="business-outline" label="Community" value={societyName} tint={theme.color.info} last />
        </View>

        <View style={styles.pLogout}>
          <LogoutButton title="Log out" variant="secondary" />
        </View>
        <Text style={styles.pVersion}>CommunityOS · {appTitle} · v0.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  body: { flex: 1 },
  tabContent: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  hero: {
    backgroundColor: theme.color.hero,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
    overflow: 'hidden',
    ...theme.shadow.hero,
  },
  // Decorative translucent "blobs" that fake a gradient without a native gradient dependency.
  heroBlobA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: theme.color.heroAlt,
    opacity: 0.9,
  },
  heroBlobB: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.color.primary,
    opacity: 0.25,
  },
  heroHi: { fontSize: theme.fontSize.body, color: theme.color.primaryText, opacity: 0.85 },
  heroName: { fontSize: theme.fontSize.display, fontWeight: '800', color: theme.color.primaryText },
  heroDate: { fontSize: theme.fontSize.caption, color: theme.color.primaryText, opacity: 0.7, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  sectionRow: { marginTop: theme.spacing.sm },
  actionList: { gap: theme.spacing.md },
  // --- Dashboard (society-app, reference image 1) ---
  dashScroll: { padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  dashHeader: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadow.hero,
  },
  dashHeaderBlobA: {
    position: 'absolute', top: -50, right: -30, width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dashHeaderBlobB: {
    position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  dashHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dashBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dashBrandIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashBrand: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  dashHeaderIcons: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dashIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  dashSosText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  dashBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: theme.color.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: theme.color.primary,
  },
  dashBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  dashProfileRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  dashAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  dashInitials: { color: '#fff', fontSize: theme.fontSize.body, fontWeight: '800' },
  dashProfileText: { flex: 1 },
  dashGreeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: theme.fontSize.caption,
    fontWeight: '600',
  },
  dashName: { color: '#fff', fontSize: theme.fontSize.title, fontWeight: '800' },
  dashUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dashUnit: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.caption },
  dashTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: theme.radius.pill,
    padding: 4,
  },
  dashTab: { flex: 1, paddingVertical: 8, borderRadius: theme.radius.pill, alignItems: 'center' },
  dashTabActive: { backgroundColor: '#fff' },
  dashTabText: { color: 'rgba(255,255,255,0.9)', fontSize: theme.fontSize.label, fontWeight: '700' },
  dashTabTextActive: { color: theme.color.primary },
  dashGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: theme.spacing.md },
  dashTile: {
    width: '48.2%',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...theme.shadow.soft,
  },
  dashTilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  dashTileIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dashTileLabel: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text, textAlign: 'center' },
  // 2-column quick-action grid: each tile is ~half width, wraps to the next row.
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: theme.spacing.md,
  },
  quickTile: {
    width: '48.5%',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
    minHeight: 128,
    ...theme.shadow.soft,
  },
  quickTilePressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  quickTileBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  quickTileTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  quickTileSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 16 },
  exploreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  explorePressed: { opacity: 0.85 },
  exploreBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreText: { flex: 1 },
  exploreTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  exploreSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },
  group: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  servicesHeader: { marginBottom: theme.spacing.sm },
  servicesTitle: { fontSize: theme.fontSize.heading, fontWeight: '800', color: theme.color.text },
  servicesSub: { fontSize: theme.fontSize.label, color: theme.color.mutedText, marginTop: 2 },
  serviceGroup: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  // Small uppercase section label above each inset card (iOS-settings style).
  groupLabel: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.mutedText, letterSpacing: 0.6, marginLeft: theme.spacing.sm },
  // Grouped "inset" card holding the full-width rows.
  insetCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, overflow: 'hidden', ...theme.shadow.soft },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, minHeight: 64 },
  serviceRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border },
  serviceRowPressed: { backgroundColor: theme.color.background },
  serviceIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  serviceText: { flex: 1, gap: 2 },
  serviceLabel: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  serviceSubtitle: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  // --- Profile page (banner + overlapping identity card + quick actions) ---
  pScroll: { paddingBottom: theme.spacing.xxl },
  // Full-bleed role-coloured banner at the very top; the identity card overlaps its lower edge.
  pBanner: {
    height: 150,
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  pBannerBlobA: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pBannerBlobB: {
    position: 'absolute',
    bottom: -60,
    left: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  // Wrapper pulls the card up over the banner; the avatar floats on top of the card edge.
  pIdentityWrap: {
    marginTop: -72,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  // Clay avatar sits above the card, z-ordered on top (zIndex) so it overlaps the white edge.
  pAvatarClay: {
    width: 104,
    height: 104,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#0b1726',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pAvatarBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.color.surface,
  },
  profileInitials: { fontSize: theme.fontSize.display, fontWeight: '800', color: theme.color.primary },
  // White floating identity card, pulled up under the avatar.
  pIdentityCard: {
    marginTop: -52,
    width: '100%',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    paddingTop: 60,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
    ...theme.shadow.card,
  },
  pAvatarSpacer: { height: 0 },
  pIdName: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  pIdRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    paddingVertical: 5,
    paddingHorizontal: theme.spacing.md,
    marginTop: 2,
  },
  pIdRoleText: { fontSize: theme.fontSize.caption, fontWeight: '800' },
  pIdCommunity: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  pIdCommunityText: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600', flexShrink: 1 },
  // Quick-action chips row across the bottom of the identity card.
  pQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
  pQuick: { alignItems: 'center', gap: 6, flex: 1 },
  pQuickPressed: { opacity: 0.6 },
  pQuickIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pQuickLabel: { fontSize: theme.fontSize.caption, color: theme.color.text, fontWeight: '700' },
  // Below-card content gets the usual page padding.
  pBody: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.md },
  pSection: {
    fontSize: theme.fontSize.caption,
    fontWeight: '800',
    color: theme.color.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.md,
    marginLeft: theme.spacing.xs,
  },
  // Neumorphic card: soft extruded surface with a hairline light border.
  pCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
    ...theme.shadow.card,
  },
  pRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  pRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.border },
  pRowPressed: { opacity: 0.6 },
  pRowIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pRowText: { flex: 1 },
  pRowLabel: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text },
  pRowValue: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },
  pLogout: { marginTop: theme.spacing.lg },
  pVersion: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, marginTop: theme.spacing.md },
});
