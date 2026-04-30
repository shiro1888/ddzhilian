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
  freeRemaining: number;
  paidRemaining: number;
  paidUsed: number;
  totalRemaining: number;
};

export interface AccountSession {
  user: AccountUserSummary;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export interface AccountRegistryOptions {
  url: string;
  serviceRoleKey: string;
  userProfilesTable: string;
  adminRolesTable: string;
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
};

type UserProfileAdminRow = UserProfileQuotaRow & {
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AdminRoleRow = {
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const userProfileQuotaSelect =
  'user_id,image_quota_period_started_at,image_quota_used,image_paid_quota_remaining,image_paid_quota_used' as const;
const userProfileAdminSelect =
  'user_id,email,image_quota_period_started_at,image_quota_used,image_paid_quota_remaining,image_paid_quota_used,created_at,updated_at' as const;
const adminRoleSelect = 'user_id,email,role,created_at,updated_at' as const;
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

function getSupabaseErrorStatus(error: unknown) {
  const candidate = error as { status?: unknown };
  return typeof candidate.status === 'number' ? candidate.status : undefined;
}

function normalizeQuotaUsed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
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
): AccountImageQuotaStatus {
  const normalizedFreeLimit = Math.max(0, Math.trunc(freeLimit));
  const normalizedFreeUsed = normalizeQuotaUsed(freeUsed);
  const freeRemaining = Math.max(0, normalizedFreeLimit - normalizedFreeUsed);
  const normalizedPaidRemaining = normalizeQuotaUsed(paidRemaining);
  const totalRemaining = freeRemaining + normalizedPaidRemaining;

  return {
    ...period,
    limit: normalizedFreeLimit,
    used: normalizedFreeUsed,
    remaining: totalRemaining,
    freeLimit: normalizedFreeLimit,
    freeUsed: normalizedFreeUsed,
    freeRemaining,
    paidRemaining: normalizedPaidRemaining,
    paidUsed: normalizeQuotaUsed(paidUsed),
    totalRemaining,
  };
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

  constructor(options: AccountRegistryOptions) {
    this.serviceRoleClient = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.authClient = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.userProfilesTable = options.userProfilesTable;
    this.adminRolesTable = options.adminRolesTable;
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

  async register(input: { email: unknown; password: unknown }) {
    const email = normalizeEmail(input.email);
    if (!validateEmail(email)) {
      throw new AccountAuthError('请输入有效的邮箱地址。', 400);
    }

    if (!validatePassword(input.password)) {
      throw new AccountAuthError('密码长度需要在 8 到 128 个字符之间。', 400);
    }

    const password = input.password as string;
    await this.assertReady();

    const { data, error } = await this.serviceRoleClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      const statusCode = /already|registered|exists/i.test(error.message) ? 409 : (getSupabaseErrorStatus(error) ?? 400);
      throw new AccountAuthError(error.message || '账号注册失败。', statusCode);
    }

    try {
      return await this.signIn({ email, password });
    } catch (signInError) {
      if (data.user?.id) {
        await this.serviceRoleClient.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      }

      throw signInError;
    }
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

    if (error || !data.session) {
      throw new AccountAuthError(error?.message || '邮箱或密码不正确。', getSupabaseErrorStatus(error) ?? 401);
    }

    const accountSession = toAccountSession(data.session);
    await this.upsertProfile(accountSession.user);
    return accountSession;
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new AccountAuthError(error?.message || '账号会话已失效。', getSupabaseErrorStatus(error) ?? 401);
    }

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
    const used = isSameQuotaPeriod(row.image_quota_period_started_at, input.period.periodStartedAt)
      ? normalizeQuotaUsed(row.image_quota_used)
      : 0;
    const paidRemaining = normalizeQuotaUsed(row.image_paid_quota_remaining);
    const paidUsed = normalizeQuotaUsed(row.image_paid_quota_used);

    if (!isSameQuotaPeriod(row.image_quota_period_started_at, input.period.periodStartedAt)) {
      await this.writeProfileQuota(input.user.id, input.period.periodStartedAt, used);
    }

    return buildImageQuotaStatus(input.period, input.limit, used, paidRemaining, paidUsed);
  }

  async addImageQuotaUsage(input: {
    user: AccountUserSummary;
    period: AccountImageQuotaPeriod;
    limit: number;
    imageCount: number;
  }) {
    const imageCount = Math.max(0, Math.trunc(input.imageCount));
    const current = await this.getImageQuotaStatus({
      user: input.user,
      period: input.period,
      limit: input.limit,
    });

    if (imageCount === 0) {
      return current;
    }

    if (imageCount > current.totalRemaining) {
      throw new AccountAuthError('总额度已耗尽。', 429);
    }

    const freeUsage = Math.min(imageCount, current.freeRemaining);
    const paidUsage = imageCount - freeUsage;
    const row = await this.writeProfileQuota(
      input.user.id,
      input.period.periodStartedAt,
      current.freeUsed + freeUsage,
      {
        remaining: current.paidRemaining - paidUsage,
        used: current.paidUsed + paidUsage,
      },
    );

    return buildImageQuotaStatus(
      input.period,
      input.limit,
      normalizeQuotaUsed(row.image_quota_used),
      normalizeQuotaUsed(row.image_paid_quota_remaining),
      normalizeQuotaUsed(row.image_paid_quota_used),
    );
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
}
