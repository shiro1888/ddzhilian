import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

export interface AccountUserSummary {
  id: string;
  email: string;
  createdAt?: string;
}

export interface AccountImageQuotaPeriod {
  date: string;
  periodStartedAt: string;
  resetAt: string;
  resetHour: number;
  timezoneOffsetMinutes: number;
}

export interface AdminAccountUserSummary {
  id: string;
  email: string;
  imageQuotaUsed: number;
  imagePaidQuotaRemaining: number;
  imagePaidQuotaUsed: number;
  imageQuotaPeriodStartedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminAccountUserQuotaUpdate {
  userId: string;
  periodStartedAt: string;
  imageQuotaUsed?: number;
  imagePaidQuotaRemaining?: number;
  imagePaidQuotaUsed?: number;
}

export type AdminAccountRole = 'super_admin' | 'admin';

export type AdminAccountRoleSource = 'env' | 'database';

export interface AdminAccountSession {
  userId: string;
  email: string;
  role: AdminAccountRole;
  isSuperAdmin: boolean;
}

export interface AdminAccountRoleSummary extends AdminAccountSession {
  source: AdminAccountRoleSource;
  createdAt?: string;
  updatedAt?: string;
}

export type AccountImageQuotaStatus = AccountImageQuotaPeriod & {
  limit: number;
  used: number;
  remaining: number;
  freeLimit: number;
  freeUsed: number;
  freeReserved: number;
  freeRemaining: number;
  paidRemaining: number;
  paidUsed: number;
  paidReserved: number;
  totalReserved: number;
  totalRemaining: number;
};

export type AccountImageQuotaReservation = {
  reservationId: string;
  periodStartedAt: string;
  freeCount: number;
  paidCount: number;
  expiresAt: string;
};

export interface AccountSession {
  user: AccountUserSummary;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export interface AccountRegistrationResult {
  email: string;
  requiresEmailConfirmation: true;
  user?: AccountUserSummary;
}

export type AccountEmailConfirmType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email';

export interface AccountRegistryOptions {
  url: string;
  serviceRoleKey: string;
  authKey?: string;
  userProfilesTable: string;
  adminRolesTable: string;
  emailRedirectTo?: string;
}

export class AccountAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

type UserProfileQuotaRow = {
  user_id: string;
  image_quota_period_started_at: string | null;
  image_quota_used: number | null;
  image_paid_quota_remaining: number | null;
  image_paid_quota_used: number | null;
  updated_at: string | null;
};

type UserProfileAdminRow = UserProfileQuotaRow & {
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ImageQuotaReservationRpcPayload = {
  freeUsed?: unknown;
  paidRemaining?: unknown;
  paidUsed?: unknown;
  freeReserved?: unknown;
  paidReserved?: unknown;
  reservation?: {
    reservationId?: unknown;
    periodStartedAt?: unknown;
    freeCount?: unknown;
    paidCount?: unknown;
    expiresAt?: unknown;
  };
};

type AdminRoleRow = {
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const userProfileQuotaSelect =
  'user_id,image_quota_period_started_at,image_quota_used,image_paid_quota_remaining,image_paid_quota_used,updated_at' as const;
const userProfileAdminSelect =
  'user_id,email,image_quota_period_started_at,image_quota_used,image_paid_quota_remaining,image_paid_quota_used,created_at,updated_at' as const;
const adminRoleSelect = 'user_id,email,role,created_at,updated_at' as const;
const imageQuotaReservationsTable = 'image_quota_reservations';
const supabaseAuthUsersPageSize = 100;
const userProfilesBatchSize = 100;

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizeEmailSet(values: readonly string[]) {
  return new Set(
    values
      .map((value) => normalizeEmail(value))
      .filter((value) => validateEmail(value)),
  );
}

function validatePassword(password: unknown) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function normalizeEmailConfirmType(value: unknown): AccountEmailConfirmType {
  const normalized = typeof value === 'string' && value.trim()
    ? value.trim()
    : 'email';
  const allowedTypes: readonly AccountEmailConfirmType[] = [
    'signup',
    'invite',
    'magiclink',
    'recovery',
    'email_change',
    'email',
  ];

  if (allowedTypes.includes(normalized as AccountEmailConfirmType)) {
    return normalized as AccountEmailConfirmType;
  }

  throw new AccountAuthError('邮箱确认链接类型无效。', 400);
}

function normalizeEmailConfirmTokenHash(value: unknown) {
  const tokenHash = typeof value === 'string' ? value.trim() : '';
  if (!tokenHash || tokenHash.length > 512) {
    throw new AccountAuthError('邮箱确认链接无效或已过期。', 400);
  }

  return tokenHash;
}

function toUserSummary(user: User): AccountUserSummary {
  return {
    id: user.id,
    email: user.email ?? '',
    createdAt: user.created_at,
  };
}

function toAccountSession(session: Session): AccountSession {
  if (!session.user || !session.access_token || !session.refresh_token) {
    throw new AccountAuthError('Supabase did not return a complete user session.', 502);
  }

  return {
    user: toUserSummary(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
  };
}

function hasConfirmedEmail(user: User) {
  const candidate = user as User & {
    confirmed_at?: string | null;
    email_confirmed_at?: string | null;
  };

  return Boolean(candidate.email_confirmed_at || candidate.confirmed_at);
}

function assertConfirmedEmail(user: User) {
  if (!hasConfirmedEmail(user)) {
    throw new AccountAuthError('请先打开确认邮件完成邮箱验证，然后再登录。', 403);
  }
}

function getSupabaseErrorStatus(error: unknown) {
  const candidate = error as { status?: unknown };
  return typeof candidate.status === 'number' ? candidate.status : undefined;
}

function normalizeQuotaUsed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function normalizeQuotaCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  return 0;
}

function normalizeEditableQuota(value: unknown, fieldLabel: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AccountAuthError(`${fieldLabel}必须是非负整数。`, 400);
  }

  return Math.trunc(value);
}

function isSameQuotaPeriod(left: string | null | undefined, right: string) {
  if (!left) {
    return false;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function buildImageQuotaStatus(
  period: AccountImageQuotaPeriod,
  freeLimit: number,
  freeUsed: number,
  paidRemaining: number,
  paidUsed: number,
  reserved: {
    free: number;
    paid: number;
  } = { free: 0, paid: 0 },
): AccountImageQuotaStatus {
  const normalizedFreeLimit = Math.max(0, Math.trunc(freeLimit));
  const normalizedFreeUsed = normalizeQuotaUsed(freeUsed);
  const freeReserved = normalizeQuotaCount(reserved.free);
  const paidReserved = normalizeQuotaCount(reserved.paid);
  const freeRemaining = Math.max(0, normalizedFreeLimit - normalizedFreeUsed - freeReserved);
  const normalizedPaidRemaining = normalizeQuotaUsed(paidRemaining);
  const availablePaidRemaining = Math.max(0, normalizedPaidRemaining - paidReserved);
  const totalRemaining = freeRemaining + availablePaidRemaining;

  return {
    ...period,
    limit: normalizedFreeLimit,
    used: normalizedFreeUsed,
    remaining: totalRemaining,
    freeLimit: normalizedFreeLimit,
    freeUsed: normalizedFreeUsed,
    freeReserved,
    freeRemaining,
    paidRemaining: availablePaidRemaining,
    paidUsed: normalizeQuotaUsed(paidUsed),
    paidReserved,
    totalReserved: freeReserved + paidReserved,
    totalRemaining,
  };
}

function readQuotaSnapshot(
  row: UserProfileQuotaRow,
  period: AccountImageQuotaPeriod,
  limit: number,
  reserved: {
    free: number;
    paid: number;
  } = { free: 0, paid: 0 },
) {
  const freeUsed = isSameQuotaPeriod(row.image_quota_period_started_at, period.periodStartedAt)
    ? normalizeQuotaUsed(row.image_quota_used)
    : 0;
  const paidRemaining = normalizeQuotaUsed(row.image_paid_quota_remaining);
  const paidUsed = normalizeQuotaUsed(row.image_paid_quota_used);

  return {
    status: buildImageQuotaStatus(period, limit, freeUsed, paidRemaining, paidUsed, reserved),
    freeUsed,
    paidRemaining,
    paidUsed,
  };
}

function normalizeImageQuotaReservation(value: ImageQuotaReservationRpcPayload['reservation']) {
  const reservationId = typeof value?.reservationId === 'string' ? value.reservationId.trim() : '';
  const periodStartedAt = typeof value?.periodStartedAt === 'string' ? value.periodStartedAt.trim() : '';
  const expiresAt = typeof value?.expiresAt === 'string' ? value.expiresAt.trim() : '';

  if (!reservationId || !periodStartedAt || !expiresAt) {
    throw new AccountAuthError('数据库未返回有效的生图额度预占记录。', 500);
  }

  return {
    reservationId,
    periodStartedAt,
    freeCount: normalizeQuotaCount(value?.freeCount),
    paidCount: normalizeQuotaCount(value?.paidCount),
    expiresAt,
  };
}

function buildQuotaStatusFromReservationPayload(
  payload: ImageQuotaReservationRpcPayload,
  period: AccountImageQuotaPeriod,
  limit: number,
) {
  return buildImageQuotaStatus(
    period,
    limit,
    normalizeQuotaCount(payload.freeUsed),
    normalizeQuotaCount(payload.paidRemaining),
    normalizeQuotaCount(payload.paidUsed),
    {
      free: normalizeQuotaCount(payload.freeReserved),
      paid: normalizeQuotaCount(payload.paidReserved),
    },
  );
}

function normalizeReservationRpcPayload(data: unknown): ImageQuotaReservationRpcPayload {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return normalizeReservationRpcPayload(parsed);
    } catch {
      throw new AccountAuthError('数据库返回的额度预占结果无效。', 500);
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AccountAuthError('数据库返回的额度预占结果无效。', 500);
  }

  return data as ImageQuotaReservationRpcPayload;
}

function toImageQuotaReservationError(error: unknown, fallback: string) {
  const candidate = error as { message?: unknown };
  const message = typeof candidate.message === 'string'
    ? candidate.message
    : error instanceof Error
      ? error.message
      : String(error);

  if (/IMAGE_QUOTA_EXHAUSTED/i.test(message)) {
    return new AccountAuthError('总额度已耗尽。', 429);
  }

  if (/IMAGE_QUOTA_RESERVATION_NOT_ACTIVE|IMAGE_QUOTA_RESERVATION_NOT_FOUND/i.test(message)) {
    return new AccountAuthError('生图额度预占已失效，请重新提交。', 409);
  }

  if (/reserve_image_quota|confirm_image_quota_reservation|release_image_quota_reservation|image_quota_reservations|function|schema cache|does not exist/i.test(message)) {
    return new AccountAuthError('生图额度预占数据库不可用，请先执行 Supabase 迁移。', 503);
  }

  return new AccountAuthError(message || fallback, 500);
}

function toAdminUserSummary(user: User, profile?: UserProfileAdminRow): AdminAccountUserSummary {
  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    imageQuotaUsed: normalizeQuotaUsed(profile?.image_quota_used),
    imagePaidQuotaRemaining: normalizeQuotaUsed(profile?.image_paid_quota_remaining),
    imagePaidQuotaUsed: normalizeQuotaUsed(profile?.image_paid_quota_used),
    imageQuotaPeriodStartedAt: profile?.image_quota_period_started_at ?? undefined,
    createdAt: profile?.created_at ?? user.created_at,
    updatedAt: profile?.updated_at ?? user.updated_at,
  };
}

function toAdminSession(user: AccountUserSummary, role: AdminAccountRole): AdminAccountSession {
  return {
    userId: user.id,
    email: normalizeEmail(user.email),
    role,
    isSuperAdmin: role === 'super_admin',
  };
}

function toAdminRoleSummary(
  input: {
    userId: string;
    email: string;
    role: AdminAccountRole;
    source: AdminAccountRoleSource;
    createdAt?: string;
    updatedAt?: string;
  },
): AdminAccountRoleSummary {
  return {
    userId: input.userId,
    email: normalizeEmail(input.email),
    role: input.role,
    isSuperAdmin: input.role === 'super_admin',
    source: input.source,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function compareAdminRoles(left: AdminAccountRoleSummary, right: AdminAccountRoleSummary) {
  if (left.role !== right.role) {
    return left.role === 'super_admin' ? -1 : 1;
  }

  return left.email.localeCompare(right.email);
}

export class AccountRegistry {
  private readonly serviceRoleClient: SupabaseClient;

  private readonly authClient: SupabaseClient;

  private readonly userProfilesTable: string;

  private readonly adminRolesTable: string;

  private readonly emailRedirectTo?: string;

  constructor(options: AccountRegistryOptions) {
    this.serviceRoleClient = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.authClient = createClient(options.url, options.authKey || options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.userProfilesTable = options.userProfilesTable;
    this.adminRolesTable = options.adminRolesTable;
    this.emailRedirectTo = options.emailRedirectTo;
  }

  async assertReady() {
    const { error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .select(userProfileQuotaSelect)
      .limit(1);

    if (error) {
      throw new AccountAuthError('账号数据库不可用，请先执行 Supabase 迁移。', 503);
    }
  }

  async register(input: { email: unknown; password: unknown }): Promise<AccountRegistrationResult> {
    const email = normalizeEmail(input.email);
    if (!validateEmail(email)) {
      throw new AccountAuthError('请输入有效的邮箱地址。', 400);
    }

    if (!validatePassword(input.password)) {
      throw new AccountAuthError('密码长度需要在 8 到 128 个字符之间。', 400);
    }

    const password = input.password as string;
    await this.assertReady();

    const { data, error } = await this.authClient.auth.signUp({
      email,
      password,
      options: this.emailRedirectTo
        ? {
            emailRedirectTo: this.emailRedirectTo,
          }
        : undefined,
    });

    if (error) {
      const statusCode = /already|registered|exists/i.test(error.message)
        ? 409
        : (getSupabaseErrorStatus(error) ?? 400);
      throw new AccountAuthError(error.message || '账号注册失败。', statusCode);
    }

    if (data.session) {
      if (data.user?.id) {
        await this.serviceRoleClient.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      }

      throw new AccountAuthError('Supabase 邮箱确认未启用，请先在 Authentication 的 Email provider 中开启 Confirm email。', 503);
    }

    return {
      email,
      requiresEmailConfirmation: true,
      user: data.user ? toUserSummary(data.user) : undefined,
    };
  }

  async signIn(input: { email: unknown; password: unknown }) {
    const email = normalizeEmail(input.email);
    if (!validateEmail(email) || typeof input.password !== 'string' || !input.password) {
      throw new AccountAuthError('邮箱或密码不正确。', 401);
    }

    await this.assertReady();

    const { data, error } = await this.authClient.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error) {
      const isEmailNotConfirmed = /email.*not.*confirm/i.test(error.message);
      const isInvalidCredentials = /invalid.*login.*credentials/i.test(error.message);
      const message = isEmailNotConfirmed
        ? '请先打开确认邮件完成邮箱验证，然后再登录。'
        : isInvalidCredentials
          ? '邮箱或密码不正确。'
          : (error.message || '邮箱或密码不正确。');
      const statusCode = isEmailNotConfirmed
        ? 403
        : isInvalidCredentials
          ? 401
          : (getSupabaseErrorStatus(error) ?? 401);
      throw new AccountAuthError(message, statusCode);
    }

    if (!data.session) {
      throw new AccountAuthError('邮箱或密码不正确。', 401);
    }

    assertConfirmedEmail(data.session.user);
    const accountSession = toAccountSession(data.session);
    await this.upsertProfile(accountSession.user);
    return accountSession;
  }

  async confirmEmail(input: {
    tokenHash: unknown;
    type: unknown;
  }): Promise<AccountSession | undefined> {
    const tokenHash = normalizeEmailConfirmTokenHash(input.tokenHash);
    const type = normalizeEmailConfirmType(input.type);

    const { data, error } = await this.authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      throw new AccountAuthError(error.message || '邮箱确认链接无效或已过期。', getSupabaseErrorStatus(error) ?? 400);
    }

    if (!data.user) {
      throw new AccountAuthError('邮箱确认链接无效或已过期。', 400);
    }

    if (!data.session) {
      assertConfirmedEmail(data.user);
      await this.upsertProfile(toUserSummary(data.user));
      return undefined;
    }

    assertConfirmedEmail(data.session.user);
    const accountSession = toAccountSession(data.session);
    await this.upsertProfile(accountSession.user);
    return accountSession;
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new AccountAuthError(error?.message || '账号会话已失效。', getSupabaseErrorStatus(error) ?? 401);
    }

    assertConfirmedEmail(data.user);
    const user = toUserSummary(data.user);
    await this.upsertProfile(user);
    return user;
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await this.authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new AccountAuthError(error?.message || '账号会话刷新失败。', getSupabaseErrorStatus(error) ?? 401);
    }

    assertConfirmedEmail(data.session.user);
    const accountSession = toAccountSession(data.session);
    await this.upsertProfile(accountSession.user);
    return accountSession;
  }

  async getImageQuotaStatus(input: {
    user: AccountUserSummary;
    period: AccountImageQuotaPeriod;
    limit: number;
  }) {
    const row = await this.readProfileQuota(input.user);
    const reserved = await this.readActiveImageQuotaReservationTotals(input.user.id, input.period.periodStartedAt);
    const snapshot = readQuotaSnapshot(row, input.period, input.limit, reserved);

    if (!isSameQuotaPeriod(row.image_quota_period_started_at, input.period.periodStartedAt)) {
      await this.writeProfileQuota(input.user.id, input.period.periodStartedAt, snapshot.freeUsed);
    }

    return snapshot.status;
  }

  async reserveImageQuota(input: {
    user: AccountUserSummary;
    period: AccountImageQuotaPeriod;
    limit: number;
    imageCount: number;
    reservationId: string;
    expiresAt: string;
  }) {
    const imageCount = Math.max(0, Math.trunc(input.imageCount));
    if (imageCount <= 0) {
      throw new AccountAuthError('生图额度预占数量必须大于 0。', 400);
    }

    await this.upsertProfile(input.user);

    const { data, error } = await this.serviceRoleClient.rpc('reserve_image_quota', {
      p_user_id: input.user.id,
      p_email: input.user.email,
      p_period_started_at: input.period.periodStartedAt,
      p_free_limit: input.limit,
      p_image_count: imageCount,
      p_reservation_id: input.reservationId,
      p_expires_at: input.expiresAt,
    });

    if (error) {
      throw toImageQuotaReservationError(error, '生图额度预占失败。');
    }

    const payload = normalizeReservationRpcPayload(data);
    return {
      quota: buildQuotaStatusFromReservationPayload(payload, input.period, input.limit),
      reservation: normalizeImageQuotaReservation(payload.reservation),
    };
  }

  async confirmImageQuotaReservation(input: {
    user: AccountUserSummary;
    reservation: AccountImageQuotaReservation;
    period: AccountImageQuotaPeriod;
    limit: number;
    imageCount: number;
  }) {
    const { data, error } = await this.serviceRoleClient.rpc('confirm_image_quota_reservation', {
      p_user_id: input.user.id,
      p_reservation_id: input.reservation.reservationId,
      p_free_limit: input.limit,
      p_image_count: Math.max(0, Math.trunc(input.imageCount)),
    });

    if (error) {
      throw toImageQuotaReservationError(error, '生图额度确认失败。');
    }

    return buildQuotaStatusFromReservationPayload(
      normalizeReservationRpcPayload(data),
      {
        ...input.period,
        periodStartedAt: input.reservation.periodStartedAt,
      },
      input.limit,
    );
  }

  async releaseImageQuotaReservation(input: {
    user: AccountUserSummary;
    reservation: AccountImageQuotaReservation;
    period: AccountImageQuotaPeriod;
    limit: number;
  }) {
    const { data, error } = await this.serviceRoleClient.rpc('release_image_quota_reservation', {
      p_user_id: input.user.id,
      p_reservation_id: input.reservation.reservationId,
      p_free_limit: input.limit,
    });

    if (error) {
      throw toImageQuotaReservationError(error, '生图额度预占释放失败。');
    }

    return buildQuotaStatusFromReservationPayload(
      normalizeReservationRpcPayload(data),
      {
        ...input.period,
        periodStartedAt: input.reservation.periodStartedAt,
      },
      input.limit,
    );
  }

  async addImageQuotaUsage(input: {
    user: AccountUserSummary;
    period: AccountImageQuotaPeriod;
    limit: number;
    imageCount: number;
  }) {
    const imageCount = Math.max(0, Math.trunc(input.imageCount));
    if (imageCount === 0) {
      return this.getImageQuotaStatus({
        user: input.user,
        period: input.period,
        limit: input.limit,
      });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await this.readProfileQuota(input.user);
      const snapshot = readQuotaSnapshot(row, input.period, input.limit);

      if (imageCount > snapshot.status.totalRemaining) {
        throw new AccountAuthError('总额度已耗尽。', 429);
      }

      const freeUsage = Math.min(imageCount, snapshot.status.freeRemaining);
      const paidUsage = imageCount - freeUsage;
      const nextRow = await this.tryWriteProfileQuotaAtomically({
        userId: input.user.id,
        expectedUpdatedAt: row.updated_at,
        nextPeriodStartedAt: input.period.periodStartedAt,
        nextFreeUsed: snapshot.freeUsed + freeUsage,
        nextPaidRemaining: snapshot.paidRemaining - paidUsage,
        nextPaidUsed: snapshot.paidUsed + paidUsage,
      });

      if (!nextRow) {
        continue;
      }

      return buildImageQuotaStatus(
        input.period,
        input.limit,
        normalizeQuotaUsed(nextRow.image_quota_used),
        normalizeQuotaUsed(nextRow.image_paid_quota_remaining),
        normalizeQuotaUsed(nextRow.image_paid_quota_used),
      );
    }

    throw new AccountAuthError('账号额度更新冲突，请重试。', 409);
  }

  async listUsers(limit?: number): Promise<AdminAccountUserSummary[]> {
    await this.assertReady();

    const authUsers = await this.listAuthUsers(limit);
    const profiles = await this.listProfileRowsForUsers(authUsers.map((user) => user.id));

    return authUsers.map((user) => toAdminUserSummary(user, profiles.get(user.id)));
  }

  async getAdminUserForAccount(
    user: AccountUserSummary,
    superAdminEmails: readonly string[],
  ): Promise<AdminAccountSession | undefined> {
    const normalizedEmail = normalizeEmail(user.email);
    const superEmailSet = normalizeEmailSet(superAdminEmails);
    if (superEmailSet.has(normalizedEmail)) {
      return toAdminSession({ ...user, email: normalizedEmail }, 'super_admin');
    }

    await this.assertAdminRolesReady();

    const { data, error } = await this.serviceRoleClient
      .from(this.adminRolesTable)
      .select(adminRoleSelect)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '管理员角色读取失败。', getSupabaseErrorStatus(error) ?? 500);
    }

    if (!data) {
      return undefined;
    }

    return toAdminSession({ ...user, email: normalizedEmail || (data as AdminRoleRow).email || '' }, 'admin');
  }

  async getAdminUserById(
    userId: string,
    superAdminEmails: readonly string[],
  ): Promise<AdminAccountSession | undefined> {
    const { data, error } = await this.serviceRoleClient.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new AccountAuthError(error?.message || '管理员账号不存在。', getSupabaseErrorStatus(error) ?? 401);
    }

    return this.getAdminUserForAccount(toUserSummary(data.user), superAdminEmails);
  }

  async listAdminRoles(superAdminEmails: readonly string[]): Promise<AdminAccountRoleSummary[]> {
    const authUsers = await this.listAuthUsers();
    const usersById = new Map(authUsers.map((user) => [user.id, user]));
    const usersByEmail = new Map(
      authUsers
        .map((user) => [normalizeEmail(user.email), user] as const)
        .filter(([email]) => Boolean(email)),
    );
    const superEmailSet = normalizeEmailSet(superAdminEmails);
    const roles: AdminAccountRoleSummary[] = [];
    const usedKeys = new Set<string>();

    for (const email of superEmailSet) {
      const authUser = usersByEmail.get(email);
      roles.push(toAdminRoleSummary({
        userId: authUser?.id ?? '',
        email,
        role: 'super_admin',
        source: 'env',
        createdAt: authUser?.created_at,
        updatedAt: authUser?.updated_at,
      }));
      usedKeys.add(authUser?.id ? `id:${authUser.id}` : `email:${email}`);
    }

    let roleRows: AdminRoleRow[] = [];
    try {
      await this.assertAdminRolesReady();
      roleRows = await this.listAdminRoleRows();
    } catch (error) {
      if (error instanceof AccountAuthError && error.statusCode === 503) {
        return roles.sort(compareAdminRoles);
      }

      throw error;
    }

    for (const row of roleRows) {
      const authUser = usersById.get(row.user_id);
      const email = normalizeEmail(authUser?.email ?? row.email);
      const key = authUser?.id ? `id:${authUser.id}` : `email:${email}`;
      if (usedKeys.has(key) || superEmailSet.has(email)) {
        continue;
      }

      roles.push(toAdminRoleSummary({
        userId: row.user_id,
        email,
        role: 'admin',
        source: 'database',
        createdAt: row.created_at ?? authUser?.created_at,
        updatedAt: row.updated_at ?? authUser?.updated_at,
      }));
      usedKeys.add(key);
    }

    return roles.sort(compareAdminRoles);
  }

  async addAdminRole(input: {
    email: unknown;
    superAdminEmails: readonly string[];
  }): Promise<AdminAccountRoleSummary> {
    const email = normalizeEmail(input.email);
    if (!validateEmail(email)) {
      throw new AccountAuthError('请输入有效的管理员邮箱。', 400);
    }

    if (normalizeEmailSet(input.superAdminEmails).has(email)) {
      throw new AccountAuthError('该邮箱已经是超级管理员。', 409);
    }

    await this.assertAdminRolesReady();

    const authUser = await this.findAuthUserByEmail(email);
    if (!authUser) {
      throw new AccountAuthError('该邮箱还没有注册账号，请先让用户完成账号注册。', 404);
    }

    const now = new Date().toISOString();
    const { data, error } = await this.serviceRoleClient
      .from(this.adminRolesTable)
      .upsert(
        {
          user_id: authUser.id,
          email: normalizeEmail(authUser.email) || email,
          role: 'admin',
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select(adminRoleSelect)
      .maybeSingle();

    if (error || !data) {
      throw new AccountAuthError(error?.message || '管理员添加失败。', getSupabaseErrorStatus(error) ?? 500);
    }

    const row = data as AdminRoleRow;
    return toAdminRoleSummary({
      userId: row.user_id,
      email: authUser.email ?? row.email ?? email,
      role: 'admin',
      source: 'database',
      createdAt: row.created_at ?? authUser.created_at,
      updatedAt: row.updated_at ?? authUser.updated_at,
    });
  }

  async removeAdminRole(input: {
    userId: unknown;
    superAdminEmails: readonly string[];
  }): Promise<void> {
    const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (!userId) {
      throw new AccountAuthError('管理员用户 ID 不能为空。', 400);
    }

    await this.assertAdminRolesReady();

    const { data: authData } = await this.serviceRoleClient.auth.admin.getUserById(userId);
    const authEmail = normalizeEmail(authData.user?.email);
    if (authEmail && normalizeEmailSet(input.superAdminEmails).has(authEmail)) {
      throw new AccountAuthError('超级管理员来自环境变量，不能在角色表中删除。', 400);
    }

    const { data, error } = await this.serviceRoleClient
      .from(this.adminRolesTable)
      .delete()
      .eq('user_id', userId)
      .select(adminRoleSelect)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '管理员删除失败。', getSupabaseErrorStatus(error) ?? 500);
    }

    if (!data) {
      throw new AccountAuthError('管理员记录不存在。', 404);
    }
  }

  async updateUserQuota(input: AdminAccountUserQuotaUpdate): Promise<AdminAccountUserSummary> {
    await this.assertReady();

    const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (!userId) {
      throw new AccountAuthError('用户 ID 不能为空。', 400);
    }

    const hasQuotaUpdate =
      input.imageQuotaUsed !== undefined ||
      input.imagePaidQuotaRemaining !== undefined ||
      input.imagePaidQuotaUsed !== undefined;

    if (!hasQuotaUpdate) {
      throw new AccountAuthError('没有需要保存的用户额度字段。', 400);
    }

    const { data: authData, error: authError } = await this.serviceRoleClient.auth.admin.getUserById(userId);
    const authUser = authData.user;

    if (authError || !authUser) {
      throw new AccountAuthError(authError?.message || '用户不存在。', getSupabaseErrorStatus(authError) ?? 404);
    }

    await this.upsertProfile(toUserSummary(authUser));

    const updatePayload: Record<string, string | number> = {
      updated_at: new Date().toISOString(),
    };

    if (input.imageQuotaUsed !== undefined) {
      updatePayload.image_quota_period_started_at = input.periodStartedAt;
      updatePayload.image_quota_used = normalizeEditableQuota(input.imageQuotaUsed, '免费额度已用');
    }

    if (input.imagePaidQuotaRemaining !== undefined) {
      updatePayload.image_paid_quota_remaining = normalizeEditableQuota(input.imagePaidQuotaRemaining, '付费剩余额度');
    }

    if (input.imagePaidQuotaUsed !== undefined) {
      updatePayload.image_paid_quota_used = normalizeEditableQuota(input.imagePaidQuotaUsed, '付费已用额度');
    }

    const { data, error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .update(updatePayload)
      .eq('user_id', userId)
      .select(userProfileAdminSelect)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '用户额度保存失败。', 500);
    }

    if (!data) {
      throw new AccountAuthError('用户资料不存在。', 404);
    }

    return toAdminUserSummary(authUser, data as UserProfileAdminRow);
  }

  private async listAuthUsers(limit?: number): Promise<User[]> {
    const normalizedLimit = typeof limit === 'number' && Number.isFinite(limit)
      ? Math.max(1, Math.trunc(limit))
      : Number.POSITIVE_INFINITY;
    const authUsers: User[] = [];
    let page = 1;

    while (authUsers.length < normalizedLimit) {
      const remaining = normalizedLimit - authUsers.length;
      const perPage = Math.min(
        supabaseAuthUsersPageSize,
        Number.isFinite(remaining) ? remaining : supabaseAuthUsersPageSize,
      );
      const { data, error } = await this.serviceRoleClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw new AccountAuthError(error.message || 'Supabase Auth 用户列表读取失败。', getSupabaseErrorStatus(error) ?? 500);
      }

      const batch = data.users ?? [];
      authUsers.push(...batch);

      if (batch.length < perPage) {
        break;
      }

      page += 1;
    }

    return authUsers;
  }

  private async assertAdminRolesReady() {
    const { error } = await this.serviceRoleClient
      .from(this.adminRolesTable)
      .select(adminRoleSelect)
      .limit(1);

    if (error) {
      throw new AccountAuthError('管理员角色数据库不可用，请先执行 Supabase 迁移。', 503);
    }
  }

  private async listAdminRoleRows(): Promise<AdminRoleRow[]> {
    const { data, error } = await this.serviceRoleClient
      .from(this.adminRolesTable)
      .select(adminRoleSelect)
      .order('created_at', { ascending: true });

    if (error) {
      throw new AccountAuthError(error.message || '管理员角色列表读取失败。', getSupabaseErrorStatus(error) ?? 500);
    }

    return (data ?? []) as AdminRoleRow[];
  }

  private async findAuthUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = normalizeEmail(email);
    const users = await this.listAuthUsers();
    return users.find((user) => normalizeEmail(user.email) === normalizedEmail);
  }

  private async listProfileRowsForUsers(userIds: string[]): Promise<Map<string, UserProfileAdminRow>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const profiles = new Map<string, UserProfileAdminRow>();
    for (let index = 0; index < userIds.length; index += userProfilesBatchSize) {
      const batchUserIds = userIds.slice(index, index + userProfilesBatchSize);
      const { data, error } = await this.serviceRoleClient
        .from(this.userProfilesTable)
        .select(userProfileAdminSelect)
        .in('user_id', batchUserIds);

      if (error) {
        throw new AccountAuthError(error.message || '用户列表读取失败。', 500);
      }

      for (const row of (data ?? []) as UserProfileAdminRow[]) {
        profiles.set(row.user_id, row);
      }
    }

    return profiles;
  }

  private async upsertProfile(user: AccountUserSummary) {
    const { error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      throw new AccountAuthError(error.message || '账号资料保存失败。', 500);
    }
  }

  private async readProfileQuota(user: AccountUserSummary): Promise<UserProfileQuotaRow> {
    await this.upsertProfile(user);

    const { data, error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .select(userProfileQuotaSelect)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '账号额度读取失败。', 500);
    }

    if (!data) {
      throw new AccountAuthError('账号资料不存在。', 404);
    }

    return data as UserProfileQuotaRow;
  }

  private async readActiveImageQuotaReservationTotals(
    userId: string,
    periodStartedAt: string,
  ) {
    const { data, error } = await this.serviceRoleClient
      .from(imageQuotaReservationsTable)
      .select('free_count,paid_count')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('period_started_at', periodStartedAt)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      throw toImageQuotaReservationError(error, '生图额度预占读取失败。');
    }

    return (data ?? []).reduce(
      (totals, row) => ({
        free: totals.free + normalizeQuotaCount((row as { free_count?: unknown }).free_count),
        paid: totals.paid + normalizeQuotaCount((row as { paid_count?: unknown }).paid_count),
      }),
      { free: 0, paid: 0 },
    );
  }

  private async writeProfileQuota(
    userId: string,
    periodStartedAt: string,
    used: number,
    paidQuota?: {
      remaining: number;
      used: number;
    },
  ): Promise<UserProfileQuotaRow> {
    const updatePayload: Record<string, string | number> = {
      image_quota_period_started_at: periodStartedAt,
      image_quota_used: Math.max(0, Math.trunc(used)),
      updated_at: new Date().toISOString(),
    };

    if (paidQuota) {
      updatePayload.image_paid_quota_remaining = Math.max(0, Math.trunc(paidQuota.remaining));
      updatePayload.image_paid_quota_used = Math.max(0, Math.trunc(paidQuota.used));
    }

    const { data, error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .update(updatePayload)
      .eq('user_id', userId)
      .select(userProfileQuotaSelect)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '账号额度保存失败。', 500);
    }

    if (!data) {
      throw new AccountAuthError('账号资料不存在。', 404);
    }

    return data as UserProfileQuotaRow;
  }

  private async tryWriteProfileQuotaAtomically(input: {
    userId: string;
    expectedUpdatedAt: string | null;
    nextPeriodStartedAt: string;
    nextFreeUsed: number;
    nextPaidRemaining: number;
    nextPaidUsed: number;
  }): Promise<UserProfileQuotaRow | null> {
    const expectedUpdatedAt = input.expectedUpdatedAt?.trim();
    if (!expectedUpdatedAt) {
      throw new AccountAuthError('账号额度状态缺少 updated_at，无法安全更新。', 500);
    }

    const nextUpdatedAt = new Date().toISOString();
    const { data, error } = await this.serviceRoleClient
      .from(this.userProfilesTable)
      .update({
        image_quota_period_started_at: input.nextPeriodStartedAt,
        image_quota_used: Math.max(0, Math.trunc(input.nextFreeUsed)),
        image_paid_quota_remaining: Math.max(0, Math.trunc(input.nextPaidRemaining)),
        image_paid_quota_used: Math.max(0, Math.trunc(input.nextPaidUsed)),
        updated_at: nextUpdatedAt,
      })
      .eq('user_id', input.userId)
      .eq('updated_at', expectedUpdatedAt)
      .select(userProfileQuotaSelect)
      .maybeSingle();

    if (error) {
      throw new AccountAuthError(error.message || '账号额度保存失败。', 500);
    }

    return data ? data as UserProfileQuotaRow : null;
  }
}
