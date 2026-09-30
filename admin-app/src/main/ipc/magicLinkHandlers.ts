import type { SupabaseClient } from '@supabase/supabase-js';
import { ipcMain } from 'electron';
import type { IpcResult, TeachingAwardMagicLinkGeneratePayload, TeachingAwardMagicLinkResult, TeachingAwardMagicLinkTeacher } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/types';
import { formatError } from './ipcError';

interface ScholarMagicLinkRow {
  staff_id: string | null;
  name: string | null;
  email: string | null;
}

interface ResolvedMagicLinkTeacher extends TeachingAwardMagicLinkTeacher {
  email: string | null;
  issue?: string;
}

interface ActiveApplicationPeriod {
  id: string;
  application_close_at: string;
}

interface ExistingTeachingAwardInvitation {
  id: string;
}

function textValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildSyntheticEmail(staffId: string): string {
  const encodedStaffId = Buffer.from(staffId, 'utf8').toString('hex');
  return `staff-${encodedStaffId}@example.com`;
}

function buildTeachers(rows: ScholarMagicLinkRow[]): ResolvedMagicLinkTeacher[] {
  const grouped = new Map<string, ScholarMagicLinkRow[]>();
  for (const row of rows) {
    const staffId = textValue(row.staff_id);
    if (!staffId) continue;
    grouped.set(staffId, [...(grouped.get(staffId) ?? []), row]);
  }
  const teachers: ResolvedMagicLinkTeacher[] = [];
  for (const [staffId, teacherRows] of grouped) {
    const names = [...new Set(teacherRows.map(row => textValue(row.name)).filter(Boolean))];
    const emails = [...new Set(teacherRows.map(row => textValue(row.email).toLowerCase()).filter(Boolean))];
    const issue = emails.length > 1 ? 'Multiple different emails are stored for this staff ID.' : undefined;
    teachers.push({ staffId, name: names[0] || staffId, email: emails[0] ?? null, available: !issue, issue });
  }
  return teachers.sort((left, right) => left.name.localeCompare(right.name));
}

function getApplicationFormUrl(): string {
  const value = process.env.TEACHING_AWARD_FORM_URL?.trim() || 'http://localhost:8000/teaching-awards-form.html';
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('TEACHING_AWARD_FORM_URL must use http or https.');
  url.searchParams.set('appVersion', '20260930-4');
  return url.toString();
}

export function registerMagicLinkHandlers(client: SupabaseClient): void {
  ipcMain.handle(IPC_CHANNELS.TEACHING_AWARD_MAGIC_LINK_TEACHERS, async (): Promise<IpcResult<TeachingAwardMagicLinkTeacher[]>> => {
    try {
      const { data, error } = await client.from('scholars').select('staff_id,name,email').order('name', { ascending: true });
      if (error) throw error;
      const teachers = buildTeachers((data ?? []) as ScholarMagicLinkRow[]).map(({ staffId, name, available }) => ({ staffId, name, available }));
      return { success: true, data: teachers };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEACHING_AWARD_MAGIC_LINKS_GENERATE, async (_event, payload: TeachingAwardMagicLinkGeneratePayload): Promise<IpcResult<TeachingAwardMagicLinkResult[]>> => {
    try {
      const staffIds = [...new Set((payload?.staffIds ?? []).map(value => textValue(value)).filter(Boolean))];
      if (staffIds.length === 0) throw new Error('Select at least one teacher.');
      const { data, error } = await client.from('scholars').select('staff_id,name,email').in('staff_id', staffIds);
      if (error) throw error;
      const teacherMap = new Map(buildTeachers((data ?? []) as ScholarMagicLinkRow[]).map(teacher => [teacher.staffId, teacher]));
      const redirectTo = getApplicationFormUrl();
      const generatedAt = new Date().toISOString();
      const { data: activePeriodData, error: activePeriodError } = await client.from('award_periods').select('id,application_close_at').eq('is_active', true).lte('application_open_at', generatedAt).gte('application_close_at', generatedAt).order('application_close_at', { ascending: true }).limit(1).maybeSingle();
      if (activePeriodError) throw activePeriodError;
      const activePeriod = activePeriodData as ActiveApplicationPeriod | null;
      if (!activePeriod?.id || !activePeriod.application_close_at) throw new Error('No active teaching award application period is currently open.');
      const results: TeachingAwardMagicLinkResult[] = [];
      for (const staffId of staffIds) {
        const teacher = teacherMap.get(staffId);
        if (!teacher) { results.push({ staffId, name: staffId, error: 'Teacher was not found.' }); continue; }
        if (!teacher.available) { results.push({ staffId, name: teacher.name, error: teacher.issue || 'The stored email data is inconsistent.' }); continue; }
        const email = teacher.email || buildSyntheticEmail(staffId);
        const invitationValues = { award_period_id: activePeriod.id, email, teacher_name: teacher.name, invited_at: generatedAt, expires_at: activePeriod.application_close_at, staff_id: staffId };
        const { data: existingInvitationData, error: invitationLookupError } = await client.from('teaching_award_invitations').select('id').eq('award_period_id', activePeriod.id).eq('staff_id', staffId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (invitationLookupError) { results.push({ staffId, name: teacher.name, error: `Could not check the invitation record: ${formatError(invitationLookupError)}` }); continue; }
        const existingInvitation = existingInvitationData as ExistingTeachingAwardInvitation | null;
        const invitationSaveResult = existingInvitation?.id
          ? await client.from('teaching_award_invitations').update(invitationValues).eq('id', existingInvitation.id)
          : await client.from('teaching_award_invitations').insert(invitationValues);
        if (invitationSaveResult.error) { results.push({ staffId, name: teacher.name, error: `Could not save the invitation record: ${formatError(invitationSaveResult.error)}` }); continue; }
        const { data: linkData, error: linkError } = await client.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
        if (linkError) { results.push({ staffId, name: teacher.name, error: formatError(linkError) }); continue; }
        const link = linkData.properties?.action_link;
        results.push(link ? { staffId, name: teacher.name, link } : { staffId, name: teacher.name, error: 'Supabase did not return an action link.' });
      }
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
