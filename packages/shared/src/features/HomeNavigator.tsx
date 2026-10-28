import React, { useMemo, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../ui/TopBar';
import { BottomTabBar, type TabKey } from '../ui/BottomTabBar';
import { theme } from '../ui/theme';
import { useAsync } from '../ui/hooks';
import type { PagedData } from '../models/envelope';
import type { Visitor } from '../models/gate';
import { VisitorStatus } from '../models/gate';
import type { Parcel } from '../models/parcel';
import { ParcelStatus } from '../models/parcel';
import type { Announcement } from '../models/announcement';
import { useNavStack } from '../ui/navStack';
import { useAuth } from '../auth/AuthContext';
import { PermissionAction } from '../auth/permissions';
import { LogoutButton } from '../screens/LogoutButton';
import { hasAdminRole, hasSecurityRole, hasResidentRole } from './shared/roles';
import { NotificationsScreen } from './shared/NotificationsScreen';
import { VehicleLookupScreen } from './shared/VehicleLookupScreen';
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
import { MyKycProfileScreen } from './resident/MyKycProfileScreen';
import { RegisterScreen } from './resident/RegisterScreen';
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
  /** Optional app logo, shown in the home hero next to the brand name. */
  logo?: ImageSourcePropType;
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
export function HomeNavigator({ resources, isAdmin = false, appTitle, logo, offlineQueue }: HomeNavigatorProps) {
  const { displayName, roles, hasPermission } = useAuth();
  const canVehicleLookup = hasPermission(PermissionAction.View, 'Vehicle');
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
    societyQuery.data?.items?.[0]?.name ?? `AanganOS · ${appTitle}`;

  // Show the SIGNED-IN person's own real name in the header — resolved from THEIR OWN resident row
  // via `GET /residents/me` (the row whose UserId == the token's user id, the Resident→User link),
  // not phone/email and never a stranger. ONE self-targeted call — no list-and-filter. Works for
  // resident, guard and admin uniformly; a superadmin has no resident row (me.resident == null) →
  // fall back to the login identifier.
  const isResidentPrincipal = isResident && !isAdminRole && !isSecurity;
  // KYC verification applies to residents AND admin-added guards (Security), but never to
  // admins/superadmins. A guard is created as `draft` by the admin and must complete KYC on first
  // login, same as a resident. A superadmin has no resident row, so the `resident` null-check below
  // keeps them out of the gate regardless.
  const isVerifiablePrincipal = (isResidentPrincipal || isSecurity) && !isAdminRole;
  const meQuery = useAsync(
    (signal) => resources.residents.me({ signal }).catch(() => null),
    [resources],
  );
  const myName = meQuery.data?.resident?.name;
  const userName = myName ?? displayName ?? 'Signed in';

  const myVerificationStatus = meQuery.data?.resident?.verificationStatus;
  const isPendingResident =
    isVerifiablePrincipal &&
    !!meQuery.data?.resident &&
    myVerificationStatus !== 'verified';

  // Unread notification count for the top-bar bell. Reloaded on tab/route change (cheap count call)
  // so it refreshes after the user reads notifications or a new one arrives between navigations.
  const unreadQuery = useAsync(
    (signal) => resources.notifications.unreadCount({ signal }).catch(() => 0),
    [resources, route.name],
  );
  const unreadCount = unreadQuery.data ?? 0;

  // A pending (unverified) resident is confined to Profile + My Household until an admin approves.
  // A restricted shell renders its own tiles + a banner; any drilled-in feature route falls through
  // to it, so a restricted feature is unreachable even with a stale route on the stack.
  if (isPendingResident) {
    const canStartKyc = myVerificationStatus === 'draft' || myVerificationStatus === 'rejected';
    if (route.name === 'kyc') {
      return (
        <RegisterScreen
          resources={resources}
          mode="kyc"
          onBack={back}
          onKycDone={() => { meQuery.reload(); go({ name: 'tabs', tab: 'home' }); }}
        />
      );
    }
    const pendingBody =
      route.name === 'myProfile' ? (
        <MyProfileScreen resources={resources} onBack={back} />
      ) : route.name === 'myHousehold' ? (
        <MyHouseholdScreen resources={resources} onBack={back} />
      ) : route.name === 'notifications' ? (
        <NotificationsScreen resources={resources} onBack={back} />
      ) : null;
    if (pendingBody) return pendingBody;
    return (
      <PendingResidentHome
        userName={userName}
        societyName={societyName}
        unreadCount={unreadCount}
        canStartKyc={canStartKyc}
        onStartKyc={() => go({ name: 'kyc' })}
        onOpenProfile={() => go({ name: 'myProfile' })}
        onOpenHousehold={() => go({ name: 'myHousehold' })}
        onOpenNotifications={() => go({ name: 'notifications' })}
      />
    );
  }

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
    case 'myKyc':
      return <MyKycProfileScreen resources={resources} onBack={back} />;
    case 'commPrefs':
      return <CommunicationPreferencesScreen resources={resources} onBack={back} />;
    case 'lookup':
      return <GuardLookupScreen resources={resources} onBack={back} />;
    case 'vehicleLookup':
      return <VehicleLookupScreen resources={resources} onBack={back} />;
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
      const tab: TabKey = route.name === 'tabs' ? route.tab : 'home';
      return (
        <View style={styles.shell}>
          {tab === 'home' ? null : (
            <TopBar
              title={tab === 'services' ? 'Services' : societyName}
              subtitle={tab === 'services' ? 'Community & Unit Directory' : userName}
              notificationCount={unreadCount}
              onPressNotifications={() => go({ name: 'notifications' })}
            />
          )}
          <View style={styles.body}>
            {tab === 'home' ? (
              <DashboardTab
                resources={resources}
                routeKey={route.name}
                canVehicleLookup={canVehicleLookup}
                isResident={isResident}
                isSecurity={isSecurity}
                userName={userName}
                societyName={societyName}
                {...(logo ? { logo } : {})}
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
                onOpenSupport={() => go({ name: 'raiseTicket' })}
                {...(isResidentPrincipal || isSecurity ? { onManageProfile: () => go({ name: 'myKyc' }) } : {})}
              />
            )}
          </View>
          <BottomTabBar active={tab} onChange={setTab} />
        </View>
      );
    }
  }
}

function PendingResidentHome({
  userName,
  societyName,
  unreadCount,
  canStartKyc,
  onStartKyc,
  onOpenProfile,
  onOpenHousehold,
  onOpenNotifications,
}: {
  userName: string;
  societyName: string;
  unreadCount: number;
  canStartKyc: boolean;
  onStartKyc: () => void;
  onOpenProfile: () => void;
  onOpenHousehold: () => void;
  onOpenNotifications: () => void;
}) {
  const tiles: DashTile[] = [
    { route: { name: 'myProfile' }, label: 'My Profile', icon: 'person-circle', tint: theme.color.primary },
    { route: { name: 'myHousehold' }, label: 'My Household', icon: 'home', tint: '#16a34a' },
  ];
  const onTile = (name: Route['name']) => (name === 'myProfile' ? onOpenProfile() : onOpenHousehold());
  return (
    <View style={styles.shell}>
      <TopBar
        title={societyName}
        subtitle={userName}
        notificationCount={unreadCount}
        onPressNotifications={onOpenNotifications}
      />
      <ScrollView contentContainerStyle={styles.dashScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.pendingBanner}>
          <Ionicons name="time-outline" size={22} color={theme.color.warning} />
          <View style={styles.pendingBannerText}>
            <Text style={styles.pendingBannerTitle}>{canStartKyc ? 'Complete your verification' : 'Verification pending approval'}</Text>
            <Text style={styles.pendingBannerSub}>
              {canStartKyc
                ? 'Submit your KYC details to unlock all community features.'
                : 'Your details are under review. You can view your profile and household in the meantime.'}
            </Text>
          </View>
        </View>
        {canStartKyc ? (
          <Pressable
            onPress={onStartKyc}
            accessibilityRole="button"
            accessibilityLabel="Complete verification"
            style={({ pressed }) => [styles.kycCta, pressed ? styles.dashTilePressed : null]}
          >
            <Ionicons name="shield-checkmark" size={20} color={theme.color.primaryText} />
            <Text style={styles.kycCtaText}>Complete Verification</Text>
            <Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
          </Pressable>
        ) : null}
        <View style={styles.dashGrid}>
          {tiles.map((t) => (
            <Pressable
              key={t.label}
              onPress={() => onTile(t.route.name)}
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
        <View style={styles.pendingLogout}>
          <LogoutButton title="Log out" variant="secondary" />
        </View>
      </ScrollView>
    </View>
  );
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
  | { name: 'myKyc' }
  | { name: 'kyc' }
  | { name: 'commPrefs' }
  | { name: 'lookup' }
  | { name: 'vehicleLookup' }
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

const RECENT_NOTICE_DAYS = 15;
const DASH_HERO_URI = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=70';

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
  resources,
  routeKey,
  canVehicleLookup,
  isResident,
  isSecurity,
  userName,
  societyName,
  unitLabel,
  unreadCount,
  logo,
  onNavigate,
  onOpenServices,
  onOpenNotifications,
  onOpenProfile,
}: {
  resources: ResourceClients;
  routeKey: string;
  canVehicleLookup: boolean;
  isResident: boolean;
  isSecurity: boolean;
  userName: string;
  societyName: string;
  unitLabel: string | null;
  unreadCount: number;
  logo?: ImageSourcePropType;
  onNavigate: (r: Route) => void;
  onOpenServices: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
}) {
  const [segment, setSegment] = useState<'community' | 'personal'>('community');

  const pendingWalkIns = useAsync<PagedData<Visitor>>(
    (signal) =>
      isResident
        ? resources.gate.listVisitors({ pageSize: 5 }, { status: VisitorStatus.Pending }, { signal })
        : Promise.resolve(emptyPage<Visitor>()),
    [resources, isResident, routeKey],
  );

  const awaitingParcels = useAsync<PagedData<Parcel>>(
    (signal) =>
      isResident
        ? resources.parcels.listParcels(
            { pageSize: 5, sort: 'receivedAtUtc:desc' },
            { status: ParcelStatus.ReadyForPickup },
            { signal },
          )
        : Promise.resolve(emptyPage<Parcel>()),
    [resources, isResident, routeKey],
  );

  const approvedWalkIns = useAsync<PagedData<Visitor>>(
    (signal) =>
      isSecurity
        ? resources.gate.listVisitors({ pageSize: 200 }, { status: VisitorStatus.Approved }, { signal })
        : Promise.resolve(emptyPage<Visitor>()),
    [resources, isSecurity, routeKey],
  );

  const gateEvents = useAsync(
    (signal) =>
      isSecurity
        ? resources.gate.listEntryExitEvents({ pageSize: 200 }, {}, { signal })
        : Promise.resolve(null),
    [resources, isSecurity, routeKey],
  );

  const openTickets = useAsync(
    (signal) => (isResident ? resources.helpdesk.listTickets({ pageSize: 1 }, { status: 'new' }, { signal }).catch(() => emptyPage()) : Promise.resolve(emptyPage())),
    [resources, isResident, routeKey],
  );
  const inProgressTickets = useAsync(
    (signal) => (isResident ? resources.helpdesk.listTickets({ pageSize: 1 }, { status: 'in_progress' }, { signal }).catch(() => emptyPage()) : Promise.resolve(emptyPage())),
    [resources, isResident, routeKey],
  );
  const resolvedTickets = useAsync(
    (signal) => (isResident ? resources.helpdesk.listTickets({ pageSize: 1 }, { status: 'resolved' }, { signal }).catch(() => emptyPage()) : Promise.resolve(emptyPage())),
    [resources, isResident, routeKey],
  );
  const recentNotices = useAsync<PagedData<Announcement>>(
    (signal) => {
      const fromDate = new Date(Date.now() - RECENT_NOTICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      return resources.announcements.list({ pageSize: 3, sort: 'publishedAtUtc:desc' }, { fromDate }, { signal }).catch(() => emptyPage<Announcement>());
    },
    [resources, routeKey],
  );
  const recentNoticeItems = recentNotices.data?.items ?? [];

  const approvedNeedingCheckIn = useMemo(() => {
    if (!isSecurity) return 0;
    const checkedInIds = new Set<string>();
    for (const e of gateEvents.data?.items ?? []) {
      if (e.visitorId) checkedInIds.add(e.visitorId);
    }
    return (approvedWalkIns.data?.items ?? []).filter((v) => !checkedInIds.has(v.id)).length;
  }, [isSecurity, approvedWalkIns.data, gateEvents.data]);

  const attentionRows = useMemo<AttentionRowData[]>(() => {
    const rows: AttentionRowData[] = [];
    if (isResident) {
      const pending = pendingWalkIns.data?.totalCount ?? 0;
      if (pending > 0) {
        rows.push({ key: 'pending', label: 'Walk-ins to approve', count: pending, icon: 'people', tint: '#bf8700', onPress: () => onNavigate({ name: 'walkInApprovals' }) });
      }
      const parcels = awaitingParcels.data?.totalCount ?? 0;
      if (parcels > 0) {
        rows.push({ key: 'parcels', label: 'Parcels to collect', count: parcels, icon: 'cube', tint: '#cf5500', onPress: () => onNavigate({ name: 'myParcels' }) });
      }
    }
    if (isSecurity && approvedNeedingCheckIn > 0) {
      rows.push({ key: 'approved', label: 'Approved walk-ins', count: approvedNeedingCheckIn, icon: 'checkmark-done', tint: '#1a7f37', onPress: () => onNavigate({ name: 'walkInApprovals' }) });
    }
    return rows;
  }, [isResident, isSecurity, pendingWalkIns.data, awaitingParcels.data, approvedNeedingCheckIn, onNavigate]);

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
      { route: { name: 'walkInApprovals' }, label: 'Approvals', icon: 'checkmark-done-circle', tint: '#16a34a' },
      { route: { name: 'announcements' }, label: 'Notices', icon: 'megaphone', tint: '#0ea5e9' },
      { route: { name: 'raiseTicket' }, label: 'Help Desk', icon: 'chatbubble-ellipses', tint: '#16a34a' },
      { route: { name: 'myParcels' }, label: 'Parcels', icon: 'cube', tint: '#d97706' },
      { route: { name: 'recurringVisitors' }, label: 'Daily Help', icon: 'repeat', tint: '#db2777' },
    ];
    const extra: DashTile[] = canVehicleLookup
      ? [{ route: { name: 'vehicleLookup' }, label: 'Vehicle Lookup', icon: 'car-sport', tint: '#0ea5e9' }]
      : [];
    return [...(isSecurity ? guard : []), ...(isResident ? resident : []), ...extra];
  }, [isResident, isSecurity, canVehicleLookup]);

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
      <ImageBackground source={{ uri: DASH_HERO_URI }} style={styles.heroBg} imageStyle={styles.heroBgImg}>
        <View style={styles.heroScrim} />
        <View style={[styles.heroInner, { paddingTop: theme.spacing.xl }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBrandRow}>
              {logo ? <Image source={logo} style={styles.heroLogo} resizeMode="contain" accessibilityLabel="AanganOS" /> : null}
              <Text style={styles.heroBrand}>
                <Text style={styles.heroBrandDark}>Aangan</Text>
                <Text style={styles.heroBrandGreen}>OS</Text>
              </Text>
            </View>
            <View style={styles.heroTopIcons}>
              {isSecurity ? (
                <Pressable onPress={() => onNavigate({ name: 'sos' })} accessibilityRole="button" accessibilityLabel="SOS emergency" hitSlop={8} style={styles.heroSos}>
                  <Text style={styles.heroSosText}>SOS</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onOpenNotifications} accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={8} style={styles.heroIconBtn}>
                <Ionicons name="notifications-outline" size={20} color={theme.color.text} />
                {unreadCount > 0 ? <View style={styles.heroBadge} /> : null}
              </Pressable>
              <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{initialsOf(userName)}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.heroGreetBlock}>
            <Text style={styles.heroGreeting}>{greeting()},</Text>
            <Text style={styles.dashHeroName} numberOfLines={1}>{userName}</Text>
            <Text style={styles.heroUnit} numberOfLines={1}>{unitLabel ? `${unitLabel}, ` : ''}{societyName}</Text>
          </View>

          {showPersonal ? (
            <View style={styles.dashTabs}>
              <DashTab label="Community" active={segment === 'community'} onPress={() => setSegment('community')} />
              <DashTab label="Personal" active={segment === 'personal'} onPress={() => setSegment('personal')} />
            </View>
          ) : null}
        </View>
      </ImageBackground>

      {attentionRows.length > 0 ? (
        <View style={styles.attentionBlock}>
          <Text style={styles.attentionHeading}>Needs your attention</Text>
          <View style={styles.attentionCard}>
            {attentionRows.map((r, i) => (
              <AttentionRow
                key={r.key}
                label={r.label}
                count={r.count}
                icon={r.icon}
                tint={r.tint}
                first={i === 0}
                onPress={r.onPress}
              />
            ))}
          </View>
        </View>
      ) : null}

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

      {isResident && segment === 'community' ? (
        <Pressable
          onPress={() => onNavigate({ name: 'myTickets' })}
          accessibilityRole="button"
          accessibilityLabel="My requests"
          style={({ pressed }) => [styles.reqCard, pressed ? styles.dashTilePressed : null]}
        >
          <View style={styles.reqHead}>
            <View style={styles.reqHeadLeft}>
              <View style={[styles.reqHeadIcon, { backgroundColor: `${theme.color.primary}1a` }]}>
                <Ionicons name="construct" size={16} color={theme.color.primary} />
              </View>
              <Text style={styles.reqTitle}>My Requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
          </View>
          <View style={styles.reqStats}>
            <ReqStat value={openTickets.data?.totalCount ?? 0} label="Open" tint={theme.color.info} />
            <View style={styles.reqDivider} />
            <ReqStat value={inProgressTickets.data?.totalCount ?? 0} label="In Progress" tint="#d97706" />
            <View style={styles.reqDivider} />
            <ReqStat value={resolvedTickets.data?.totalCount ?? 0} label="Completed" tint={theme.color.primary} />
          </View>
        </Pressable>
      ) : null}

      <View style={styles.noticeHead}>
        <Text style={styles.noticeHeading}>Recent Notices</Text>
        <Pressable onPress={() => onNavigate({ name: 'announcements' })} hitSlop={6} accessibilityRole="button" accessibilityLabel="View all notices">
          <Text style={styles.noticeViewAll}>View All ›</Text>
        </Pressable>
      </View>
      <View style={styles.noticeCard}>
        {recentNoticeItems.length === 0 ? (
          <Text style={styles.noticeEmpty}>{recentNotices.loading ? 'Loading…' : `No notices in the last ${RECENT_NOTICE_DAYS} days.`}</Text>
        ) : (
          recentNoticeItems.map((n, i) => (
            <NoticeRow key={n.id} notice={n} first={i === 0} onPress={() => onNavigate({ name: 'announcements' })} />
          ))
        )}
      </View>

    </ScrollView>
  );
}

/** One stat in the "My Requests" card. */
function ReqStat({ value, label, tint }: { value: number; label: string; tint: string }) {
  return (
    <View style={styles.reqStat}>
      <Text style={[styles.reqStatValue, { color: tint }]}>{value}</Text>
      <Text style={styles.reqStatLabel}>{label}</Text>
    </View>
  );
}

const NOTICE_TINTS: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  maintenance: { icon: 'construct', tint: theme.color.primary },
  event: { icon: 'calendar', tint: theme.color.info },
  emergency: { icon: 'warning', tint: theme.color.danger },
  general: { icon: 'megaphone', tint: '#0ea5e9' },
};

/** One notice row in the Recent Notices card. */
function NoticeRow({ notice, first, onPress }: { notice: Announcement; first: boolean; onPress: () => void }) {
  const meta = NOTICE_TINTS[notice.category] ?? NOTICE_TINTS.general!;
  const date = new Date(notice.publishedAtUtc);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={notice.title} style={({ pressed }) => [styles.noticeRow, first ? null : styles.noticeRowDivider, pressed ? styles.attentionRowPressed : null]}>
      <View style={[styles.noticeIcon, { backgroundColor: `${meta.tint}1a` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.tint} />
      </View>
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle} numberOfLines={1}>{notice.title}</Text>
        <Text style={styles.noticeBody} numberOfLines={2}>{notice.body}</Text>
      </View>
      {dateLabel ? <Text style={styles.noticeDate}>{dateLabel}</Text> : null}
    </Pressable>
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

function emptyPage<T>(): PagedData<T> {
  return { items: [], page: 1, pageSize: 0, totalCount: 0 };
}

interface AttentionRowData {
  key: string;
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
}

function AttentionRow({
  label,
  count,
  icon,
  tint,
  first,
  onPress,
}: {
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} need${count === 1 ? 's' : ''} your attention`}
      style={({ pressed }) => [styles.attentionRow, first ? null : styles.attentionRowDivider, pressed ? styles.attentionRowPressed : null]}
    >
      <View style={[styles.attentionRowIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.attentionRowLabel} numberOfLines={1}>{label}</Text>
      <View style={[styles.attentionRowCount, { backgroundColor: tint }]}>
        <Text style={styles.attentionRowCountText}>{count > 99 ? '99+' : count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
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
  onOpenSupport,
}: {
  userName: string;
  appTitle: string;
  societyName: string;
  roles: readonly string[];
  isAdmin: boolean;
  isSecurity: boolean;
  onManageProfile?: () => void;
  onOpenNotifications?: () => void;
  onOpenSupport?: () => void;
}) {
  const roleLabel = roles.length > 0 ? roles.join(', ') : appTitle;
  const ident = roleIdentity(isAdmin, isSecurity);
  return (
    <ScrollView contentContainerStyle={styles.pgScroll} showsVerticalScrollIndicator={false}>
      {/* Identity hero card with a stat strip. */}
      <View style={styles.pgHero}>
        <View style={styles.pgHeroBlobA} />
        <View style={styles.pgHeroBlobB} />
        <View style={styles.pgHeroTop}>
          <View style={styles.pgHeroAvatar}>
            <Text style={styles.pgHeroInitials}>{initialsOf(userName)}</Text>
          </View>
          <View style={styles.pgHeroHead}>
            <Text style={styles.pgHeroName} numberOfLines={1}>{userName}</Text>
            <View style={styles.pgHeroTags}>
              <View style={styles.pgHeroTag}><Text style={styles.pgHeroTagText}>{ident.label.toUpperCase()}</Text></View>
            </View>
          </View>
        </View>
        <View style={styles.pgStatStrip}>
          <ProfileStat icon="business" value={societyName} label="Community" />
          <View style={styles.pgStatDivider} />
          <ProfileStat icon="ribbon" value={roleLabel} label="Role" />
        </View>
      </View>

      <ProfileSection title="Account Management" hint="Manage your profile and preferences">
        {onManageProfile ? (
          <ProfileNavRow icon="person-circle-outline" tint={theme.color.primary} title="My Profile" subtitle="Your details, family, vehicles" onPress={onManageProfile} first />
        ) : null}
        <ProfileNavRow icon="notifications-outline" tint={theme.color.warning} title="Notifications" subtitle="Manage alerts and preferences" onPress={onOpenNotifications ?? (() => {})} first={!onManageProfile} last />
      </ProfileSection>

      <ProfileSection title="Support & Legal" hint="Get help or learn more">
        <ProfileNavRow icon="help-buoy-outline" tint={theme.color.info} title="Help & Support" subtitle="Raise a ticket for help" onPress={onOpenSupport ?? (() => {})} first />
        <ProfileNavRow icon="document-text-outline" tint={theme.color.mutedText} title="Terms & Privacy" subtitle="Legal information" onPress={() => {}} last />
      </ProfileSection>

      <View style={styles.pgLogout}>
        <LogoutButton title="Log Out" variant="secondary" />
      </View>
      <Text style={styles.pgPowered}>Powered by AanganOS · {appTitle} · v0.1.0</Text>
    </ScrollView>
  );
}

/** One stat in the Profile hero strip. */
function ProfileStat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.pgStat}>
      <View style={styles.pgStatTop}>
        <Ionicons name={icon} size={14} color={theme.color.primaryText} />
        <Text style={styles.pgStatValue} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={styles.pgStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A titled section with a bold left title + muted right hint, wrapping a card of rows. */
function ProfileSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={styles.pgSection}>
      <View style={styles.pgSectionHead}>
        <Text style={styles.pgSectionTitle}>{title}</Text>
        <Text style={styles.pgSectionHint} numberOfLines={1}>{hint}</Text>
      </View>
      <View style={styles.pgSectionCard}>{children}</View>
    </View>
  );
}

/** A tappable navigation row inside a ProfileSection card. */
function ProfileNavRow({ icon, tint, title, subtitle, onPress, first = false, last = false }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; subtitle: string; onPress: () => void; first?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.pgRow, !first ? styles.pgRowDivider : null, pressed ? styles.pgPressed : null]}>
      <View style={[styles.pgRowIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.pgRowText}>
        <Text style={styles.pgRowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.pgRowSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
    </Pressable>
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
  dashScroll: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  heroBg: { marginHorizontal: -theme.spacing.lg, minHeight: 220, justifyContent: 'flex-end' },
  heroBgImg: { },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,24,18,0.42)' },
  heroInner: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: theme.spacing.md },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBrandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroLogo: { width: 32, height: 32, borderRadius: theme.radius.sm },
  heroBrand: { fontSize: theme.fontSize.title, fontWeight: '800', letterSpacing: -0.5 },
  heroBrandDark: { color: '#fff' },
  heroBrandGreen: { color: '#8ef0c0' },
  heroTopIcons: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroSos: { paddingHorizontal: 10, height: 34, borderRadius: 17, backgroundColor: theme.color.danger, alignItems: 'center', justifyContent: 'center' },
  heroSosText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  heroIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heroBadge: { position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: theme.color.danger, borderWidth: 1.5, borderColor: '#fff' },
  heroAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { color: theme.color.primary, fontSize: theme.fontSize.label, fontWeight: '800' },
  heroGreetBlock: { gap: 2 },
  heroGreeting: { color: 'rgba(255,255,255,0.9)', fontSize: theme.fontSize.body, fontWeight: '600' },
  dashHeroName: { color: '#fff', fontSize: theme.fontSize.heading, fontWeight: '800' },
  heroUnit: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.label, fontWeight: '600' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: `${theme.color.warning}1a`,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: `${theme.color.warning}55`,
    padding: theme.spacing.lg,
  },
  pendingBannerText: { flex: 1, gap: 2 },
  pendingBannerTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  pendingBannerSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
  kycCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary, paddingHorizontal: theme.spacing.lg,
  },
  kycCtaText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '800' },
  pendingLogout: { marginTop: theme.spacing.md },
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
  dashHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
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
  dashGrid: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.lg,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  dashTile: { width: '25%', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  dashTilePressed: { opacity: 0.6 },
  dashTileIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dashTileLabel: { fontSize: theme.fontSize.caption, fontWeight: '600', color: theme.color.text, textAlign: 'center', lineHeight: 14 },
  attentionBlock: { marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  attentionHeading: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  attentionCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadow.soft,
  },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md },
  attentionRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border },
  attentionRowPressed: { opacity: 0.7 },
  attentionRowIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  attentionRowLabel: { flex: 1, fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  attentionRowCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  attentionRowCountText: { color: '#fff', fontSize: theme.fontSize.caption, fontWeight: '800' },

  reqCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md, marginBottom: theme.spacing.md, gap: theme.spacing.sm, ...theme.shadow.soft },
  reqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reqHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  reqHeadIcon: { width: 30, height: 30, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  reqTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  reqStats: { flexDirection: 'row', alignItems: 'center' },
  reqStat: { flex: 1, alignItems: 'center', gap: 2 },
  reqStatValue: { fontSize: theme.fontSize.title, fontWeight: '800' },
  reqStatLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
  reqDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: theme.color.border, marginVertical: 4 },

  noticeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  noticeHeading: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  noticeViewAll: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.primary },
  noticeCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, ...theme.shadow.soft },
  noticeEmpty: { padding: theme.spacing.md, fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'center' },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, padding: theme.spacing.md },
  noticeRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border },
  noticeIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  noticeText: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text },
  noticeBody: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 17 },
  noticeDate: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },

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
  group: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
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

  // --- Profile tab (Yalla-style: brand header + identity hero + grouped sections) ---
  pgScroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  pgHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  pgBrandLogo: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center' },
  pgBrandText: { flex: 1 },
  pgBrandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  pgBrandName: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text, flexShrink: 1 },
  pgBrandTag: { backgroundColor: theme.color.accentSoft, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
  pgBrandTagText: { fontSize: 10, fontWeight: '800', color: theme.color.primary, letterSpacing: 0.4 },
  pgBrandSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 1 },
  pgBell: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', ...theme.shadow.soft },
  pgPressed: { opacity: 0.8 },

  pgHero: { backgroundColor: theme.color.primary, borderRadius: theme.radius.xl, padding: theme.spacing.lg, gap: theme.spacing.md, overflow: 'hidden', ...theme.shadow.hero },
  pgHeroBlobA: { position: 'absolute', top: -50, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.12)' },
  pgHeroBlobB: { position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.08)' },
  pgHeroTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  pgHeroAvatar: { width: 60, height: 60, borderRadius: theme.radius.lg, backgroundColor: theme.color.onHeroSoft, alignItems: 'center', justifyContent: 'center' },
  pgHeroInitials: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.primaryText },
  pgHeroHead: { flex: 1, gap: theme.spacing.xs },
  pgHeroName: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.primaryText },
  pgHeroTags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  pgHeroTag: { backgroundColor: theme.color.onHeroSoft, borderRadius: theme.radius.sm, paddingVertical: 3, paddingHorizontal: theme.spacing.sm },
  pgHeroTagText: { color: theme.color.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  pgStatStrip: { flexDirection: 'row', alignItems: 'center', paddingTop: theme.spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
  pgStat: { flex: 1, gap: 2 },
  pgStatTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pgStatValue: { color: theme.color.primaryText, fontSize: theme.fontSize.label, fontWeight: '800', flexShrink: 1 },
  pgStatLabel: { color: theme.color.primaryText, opacity: 0.75, fontSize: theme.fontSize.caption },
  pgStatDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: theme.spacing.md },

  pgSection: { gap: theme.spacing.sm },
  pgSectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: theme.spacing.xs },
  pgSectionTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  pgSectionHint: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, flexShrink: 1, marginLeft: theme.spacing.sm },
  pgSectionCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, overflow: 'hidden', ...theme.shadow.soft },
  pgRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md },
  pgRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border },
  pgRowIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  pgRowText: { flex: 1 },
  pgRowTitle: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  pgRowSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },
  pgLogout: { marginTop: theme.spacing.sm },
  pgPowered: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, marginTop: theme.spacing.sm },
});
