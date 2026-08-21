import type {
  Cents,
  DateOnly,
  Metres,
  Millilitres,
  Nullable,
  Seconds,
  Timestamp,
  UUID,
} from './primitives';
import type {
  AdminRole,
  BenefitStatus,
  CodeKind,
  CodeStatus,
  FineStatus,
  FreeFlowStatus,
  FuelType,
  GoalBasis,
  GoalPeriod,
  InfluencerStatus,
  JourneyStatus,
  NotificationCategory,
  PlanCode,
  PlanSource,
  RecurringCostPeriod,
  ReferralStatus,
  SupportAuthorKind,
  SupportPriority,
  SupportTicketStatus,
  ThemePreference,
  VehicleOwnership,
  VehicleType,
  WorkMode,
} from './enums';

/* ---------------------------------------------------------------- identity */

export interface Profile {
  id: UUID;
  firstName: string;
  lastName: Nullable<string>;
  preferredName: Nullable<string>;
  email: string;
  phone: Nullable<string>;
  avatarPath: Nullable<string>;
  city: Nullable<string>;
  state: Nullable<string>;
  birthDate: Nullable<DateOnly>;
  /** Voluntary. Never required, never used to gate features. */
  gender: Nullable<string>;
  workModes: WorkMode[];
  onboardingCompletedAt: Nullable<Timestamp>;
  tourCompletedAt: Nullable<Timestamp>;
  blockedAt: Nullable<Timestamp>;
  createdAt: Timestamp;
  lastSeenAt: Nullable<Timestamp>;
}

export interface UserPreferences {
  userId: UUID;
  theme: ThemePreference;
  locale: string;
  currency: string;
  /** Opt-in to contributing anonymised rows to the benchmark pool. */
  benchmarkOptIn: boolean;
  pushEnabled: boolean;
}

/* ---------------------------------------------------------------- vehicles */

export interface VehicleModelRef {
  id: UUID;
  makeName: string;
  modelName: string;
  versionName: Nullable<string>;
  year: Nullable<number>;
  engine: Nullable<string>;
  fuelType: Nullable<FuelType>;
  /** Reference consumption from the admin-managed catalogue, in metres/litre. */
  urbanConsumption: Nullable<number>;
  highwayConsumption: Nullable<number>;
}

export interface UserVehicle {
  id: UUID;
  userId: UUID;
  vehicleType: VehicleType;
  modelId: Nullable<UUID>;
  /** Free-text fallback when the catalogue has no match. */
  customLabel: Nullable<string>;
  year: Nullable<number>;
  fuelType: Nullable<FuelType>;
  ownership: VehicleOwnership;
  /** Catalogue estimate, metres per litre. Never silently replaced by measured. */
  estimatedConsumption: Nullable<number>;
  /** Derived from fuel_logs once enough odometer data exists. */
  measuredConsumption: Nullable<number>;
  /** True once the user explicitly accepted the measured figure. */
  useMeasuredConsumption: boolean;
  isPrimary: boolean;
  archivedAt: Nullable<Timestamp>;
}

/* ---------------------------------------------------------------- platforms */

export interface Platform {
  id: UUID;
  slug: string;
  name: string;
  logoPath: Nullable<string>;
  workModes: WorkMode[];
  isActive: boolean;
  sortOrder: number;
}

/* ---------------------------------------------------------------- journeys */

export interface Journey {
  id: UUID;
  userId: UUID;
  vehicleId: Nullable<UUID>;
  status: JourneyStatus;
  startedAt: Timestamp;
  endedAt: Nullable<Timestamp>;
  /** Sum of paused intervals; excluded from worked time. */
  pausedSeconds: Seconds;
  odometerStart: Nullable<Metres>;
  odometerEnd: Nullable<Metres>;
  /** Set when the user reports distance directly instead of odometer readings. */
  distanceOverride: Nullable<Metres>;
  note: Nullable<string>;
  createdAt: Timestamp;
}

/**
 * Something the driver sells inside the car: water, sweets, a phone charger,
 * perfume. Money from the passenger rather than from the platform.
 */
export interface Product {
  id: UUID;
  userId: UUID;
  name: string;
  /** What the passenger pays for one. */
  unitPrice: Cents;
  /** What one cost the driver. Null when they never said. */
  unitCost: Nullable<Cents>;
  isActive: boolean;
  sortOrder: number;
}

/**
 * A revenue row is either a platform's takings or a product sale, never both:
 * `platformId` and `productId` exclude each other, enforced by the database.
 */
export interface Revenue {
  id: UUID;
  userId: UUID;
  journeyId: Nullable<UUID>;
  platformId: Nullable<UUID>;
  /** Set when this row is a sale rather than a fare. */
  productId: Nullable<UUID>;
  /** How many units were sold. Null on everything that is not a sale. */
  quantity: Nullable<number>;
  date: DateOnly;
  amount: Cents;
  tips: Cents;
  /** Rides for rideshare/taxi, drops for delivery. Null when not tracked. */
  tripCount: Nullable<number>;
  note: Nullable<string>;
  createdAt: Timestamp;
}

export interface ExpenseCategory {
  id: UUID;
  slug: string;
  name: string;
  /** Vehicle-attributable costs feed cost-per-km; personal ones do not. */
  isVehicleCost: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface Expense {
  id: UUID;
  userId: UUID;
  journeyId: Nullable<UUID>;
  categoryId: UUID;
  date: DateOnly;
  amount: Cents;
  note: Nullable<string>;
  createdAt: Timestamp;
}

export interface FuelLog {
  id: UUID;
  userId: UUID;
  vehicleId: Nullable<UUID>;
  journeyId: Nullable<UUID>;
  date: DateOnly;
  fuelType: FuelType;
  totalAmount: Cents;
  /** Cents per litre. */
  pricePerLitre: Nullable<Cents>;
  volume: Nullable<Millilitres>;
  odometer: Nullable<Metres>;
  station: Nullable<string>;
  createdAt: Timestamp;
}

export interface MaintenanceLog {
  id: UUID;
  userId: UUID;
  vehicleId: Nullable<UUID>;
  typeSlug: string;
  date: DateOnly;
  amount: Cents;
  odometer: Nullable<Metres>;
  nextDueOdometer: Nullable<Metres>;
  nextDueDate: Nullable<DateOnly>;
  note: Nullable<string>;
}

export interface RecurringCost {
  id: UUID;
  userId: UUID;
  vehicleId: Nullable<UUID>;
  categoryId: UUID;
  label: string;
  amount: Cents;
  period: RecurringCostPeriod;
  startDate: DateOnly;
  endDate: Nullable<DateOnly>;
  isActive: boolean;
}

/* ------------------------------------------------------------------- goals */

export interface Goal {
  id: UUID;
  userId: UUID;
  period: GoalPeriod;
  basis: GoalBasis;
  target: Cents;
  startDate: DateOnly;
  endDate: Nullable<DateOnly>;
  isActive: boolean;
}

/* -------------------------------------------------- obligations & reminders */

export interface FreeFlowRecord {
  id: UUID;
  userId: UUID;
  operator: string;
  passedAt: DateOnly;
  amount: Nullable<Cents>;
  dueDate: Nullable<DateOnly>;
  status: FreeFlowStatus;
  note: Nullable<string>;
}

export interface Fine {
  id: UUID;
  userId: UUID;
  description: string;
  issuedAt: DateOnly;
  amount: Cents;
  dueDate: Nullable<DateOnly>;
  discountAmount: Nullable<Cents>;
  discountDeadline: Nullable<DateOnly>;
  points: Nullable<number>;
  status: FineStatus;
}

/* ----------------------------------------------------------- notifications */

export interface UserNotification {
  id: UUID;
  userId: UUID;
  category: NotificationCategory;
  title: string;
  body: string;
  /** In-app route to open on tap, e.g. `/support/<ticketId>`. */
  deepLink: Nullable<string>;
  ctaLabel: Nullable<string>;
  imagePath: Nullable<string>;
  readAt: Nullable<Timestamp>;
  createdAt: Timestamp;
}

/* ----------------------------------------------------------------- support */

export interface SupportCategory {
  id: UUID;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SupportTicket {
  id: UUID;
  /** Short human-facing reference, e.g. `DNQ-1042`. Internal-first by design. */
  reference: string;
  userId: UUID;
  categoryId: Nullable<UUID>;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  assignedAdminId: Nullable<UUID>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  firstAgentReplyAt: Nullable<Timestamp>;
  resolvedAt: Nullable<Timestamp>;
  closedAt: Nullable<Timestamp>;
  lastMessageAt: Timestamp;
  /** App build the ticket was opened from – powers "tickets by version". */
  appVersion: Nullable<string>;
}

export interface SupportMessage {
  id: UUID;
  ticketId: UUID;
  authorKind: SupportAuthorKind;
  authorId: Nullable<UUID>;
  body: string;
  attachmentPath: Nullable<string>;
  /** Internal notes are stripped by RLS before they can reach a user. */
  isInternalNote: boolean;
  createdAt: Timestamp;
  readByUserAt: Nullable<Timestamp>;
}

/* ------------------------------------------- growth: codes, referrals, influencers */

export interface PromotionCode {
  id: UUID;
  code: string;
  kind: CodeKind;
  /** Owning end-user for referral codes; owning influencer for influencer codes. */
  ownerUserId: Nullable<UUID>;
  influencerId: Nullable<UUID>;
  campaignId: Nullable<UUID>;
  benefitAmount: Cents;
  startsAt: Nullable<Timestamp>;
  expiresAt: Nullable<Timestamp>;
  maxUses: Nullable<number>;
  useCount: number;
  status: CodeStatus;
  createdAt: Timestamp;
}

export interface Referral {
  id: UUID;
  referrerUserId: UUID;
  referredUserId: UUID;
  codeId: UUID;
  status: ReferralStatus;
  createdAt: Timestamp;
  convertedAt: Nullable<Timestamp>;
}

export interface DiscountBenefit {
  id: UUID;
  userId: UUID;
  codeId: Nullable<UUID>;
  referralId: Nullable<UUID>;
  amount: Cents;
  status: BenefitStatus;
  expiresAt: Nullable<Timestamp>;
  usedAt: Nullable<Timestamp>;
  createdAt: Timestamp;
}

export interface InfluencerApplication {
  id: UUID;
  userId: Nullable<UUID>;
  name: string;
  email: string;
  phone: Nullable<string>;
  city: string;
  state: string;
  instagram: Nullable<string>;
  tiktok: Nullable<string>;
  youtube: Nullable<string>;
  otherNetwork: Nullable<string>;
  followersEstimate: Nullable<number>;
  contentType: string;
  message: Nullable<string>;
  status: InfluencerStatus;
  reviewedByAdminId: Nullable<UUID>;
  reviewedAt: Nullable<Timestamp>;
  internalNote: Nullable<string>;
  createdAt: Timestamp;
}

export interface UserAttribution {
  userId: UUID;
  source: Nullable<string>;
  medium: Nullable<string>;
  campaign: Nullable<string>;
  codeId: Nullable<UUID>;
  influencerId: Nullable<UUID>;
  referrerUserId: Nullable<UUID>;
  signupOrigin: Nullable<string>;
  /** Written once at signup. Never overwritten – see PRODUCT_RULES.md §91. */
  capturedAt: Timestamp;
}

/* -------------------------------------------------------------- monetisation */

export interface Subscription {
  id: UUID;
  userId: UUID;
  plan: PlanCode;
  source: PlanSource;
  startedAt: Timestamp;
  /** Null means open-ended (paid subscription or unlimited courtesy). */
  expiresAt: Nullable<Timestamp>;
  cancelledAt: Nullable<Timestamp>;
  grantedByAdminId: Nullable<UUID>;
  note: Nullable<string>;
}

/* -------------------------------------------------------------------- admin */

export interface AdminUser {
  userId: UUID;
  role: AdminRole;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface AdminLog {
  id: UUID;
  adminUserId: UUID;
  action: string;
  targetTable: Nullable<string>;
  targetId: Nullable<string>;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
}
