export const MyTaskType = {
  WalkInApproval: 'walkin_approval',
  ParcelPickup: 'parcel_pickup',
  MaintenanceDue: 'maintenance_due',
  KycPending: 'kyc_pending',
  ApprovedWalkInCheckIn: 'approved_walkin_checkin',
  ActiveSos: 'active_sos',
  ResidentToVerify: 'resident_verify',
  OpenTicket: 'open_ticket',
  OverdueBill: 'overdue_bill',
  PendingPaymentApproval: 'pending_payment_approval',
} as const;

export interface MyTaskSummaryItem {
  readonly type: string;
  readonly label: string;
  readonly count: number;
  readonly severity: string;
}

export interface MyTaskCard {
  readonly type: string;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly meta: string | null;
  readonly amount: number | null;
  readonly dateUtc: string | null;
  readonly status: string | null;
}

export interface MaintenanceBill {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly amount: number;
  readonly amountPaid: number;
  readonly amountDue: number;
  readonly label: string;
  readonly status: string;
  readonly dueDateUtc: string | null;
  readonly issuedAtUtc: string;
}

export interface MaintenancePayment {
  readonly id: string;
  readonly maintenanceBillId: string;
  readonly amount: number;
  readonly method: string;
  readonly status: string;
}
