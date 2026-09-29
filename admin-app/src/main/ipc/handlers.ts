/**
 * IPC handler registrations.
 *
 * All ipcMain.handle() calls live here so the main process entry file stays
 * clean. Each handler maps an IPC channel (defined in shared/types) to a
 * main-process operation.
 */

import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IpcResult,
  DbQueryPayload,
  ApiRequestPayload,
  AwardPeriod,
  AwardPeriodSavePayload,
  DashboardNominationsSummary,
  DashboardNomination,
  LecturerEmailStatus,
  NominationApprovalStatus,
} from '../../shared/types';
import { db, getSupabaseClient } from '../db';
import { apiClient } from '../api';
import { handleTutorList, previewTutorList, uploadTutors } from './parseTutors';
//import { sendNominationEmails } from './email';
import { formatError } from './ipcError';
import { createStudentResponseHandlers } from './studentResponseHandlers';
import { createMasterDataHandlers } from './masterDataHandlers';
import { createSupabaseMasterDataUploadLogStore } from './masterDataUploadLogStore';
import { createApplicationDownloadHandlers } from './applicationDownloadHandlers';

interface AwardPeriodRow {
  id: string;
  name: string;
  nomination_open_at: string;
  nomination_close_at: string;
  application_open_at: string;
  application_close_at: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface DashboardNominationRow {
  id: number;
  student_name: string;
  student_id: string;
  scholar_name: string;
  unit_code: string;
  unit_name: string | null;
  teaching_period: string;
  role_of_unit: string;
  approval_status: string;
  created_at?: string;
}

interface NominatedTeacherRow {
  scholar_id: number | null;
  staff_id: string | null;
  scholar_name: string;
}

interface ScholarEmailRow {
  id: number;
  staff_id: string | null;
  name: string;
  email: string | null;
}


function toDashboardNomination(row: DashboardNominationRow): DashboardNomination {
  return {
    id: row.id,
    studentName: row.student_name,
    studentId: row.student_id,
    scholarName: row.scholar_name,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    teachingPeriod: row.teaching_period,
    roleOfUnit: row.role_of_unit,
    approvalStatus: row.approval_status as NominationApprovalStatus,
    createdAt: row.created_at,
  };
}

function toAwardPeriod(row: AwardPeriodRow): AwardPeriod {
  return {
    id: row.id,
    name: row.name,
    nominationOpenAt: row.nomination_open_at,
    nominationCloseAt: row.nomination_close_at,
    applicationOpenAt: row.application_open_at,
    applicationCloseAt: row.application_close_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getNominatedTeacherKey(row: NominatedTeacherRow): string {
  // Dedupe by the real person. `staff_id` is the official staff identifier;
  // `scholar_id` only identifies a teaching record (one teacher teaching a unit
  // in a period), so the same teacher across multiple units/periods has several
  // `scholar_id` values and must not be used to count unique teachers.
  if (hasText(row.staff_id)) {
    return `staff:${row.staff_id.trim()}`;
  }

  return `name:${row.scholar_name.trim().toLowerCase()}`;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getLecturerEmailStatus(
  nominations: NominatedTeacherRow[],
  scholars: ScholarEmailRow[],
): LecturerEmailStatus {
  const scholarById = new Map(scholars.map(scholar => [scholar.id, scholar]));
  const scholarByStaffId = new Map(
    scholars
      .filter(scholar => hasText(scholar.staff_id))
      .map(scholar => [scholar.staff_id as string, scholar]),
  );
  const scholarsByName = new Map<string, ScholarEmailRow[]>();

  for (const scholar of scholars) {
    const key = scholar.name.trim().toLowerCase();
    const existing = scholarsByName.get(key) ?? [];
    existing.push(scholar);
    scholarsByName.set(key, existing);
  }

  const uniqueNominatedLecturers = new Map<string, NominatedTeacherRow>();

  for (const nomination of nominations) {
    uniqueNominatedLecturers.set(getNominatedTeacherKey(nomination), nomination);
  }

  let withEmail = 0;

  for (const nomination of uniqueNominatedLecturers.values()) {
    const matchedById = nomination.scholar_id !== null
      ? scholarById.get(nomination.scholar_id)
      : undefined;
    const matchedByStaffId = hasText(nomination.staff_id)
      ? scholarByStaffId.get(nomination.staff_id as string)
      : undefined;
    const matchedByName = scholarsByName.get(nomination.scholar_name.trim().toLowerCase()) ?? [];
    const hasEmail = [matchedById, matchedByStaffId, ...matchedByName]
      .some(scholar => hasText(scholar?.email));

    if (hasEmail) {
      withEmail += 1;
    }
  }

  const totalLecturers = uniqueNominatedLecturers.size;

  return {
    totalLecturers,
    withEmail,
    missingEmail: totalLecturers - withEmail,
    trackingConfigured: false,
  };
}

function validatePeriodPayload(payload: AwardPeriodSavePayload): void {
  if (!payload.name.trim()) {
    throw new Error('Period name is required.');
  }

  const nominationOpenAt = Date.parse(payload.nominationOpenAt);
  const nominationCloseAt = Date.parse(payload.nominationCloseAt);
  const applicationOpenAt = Date.parse(payload.applicationOpenAt);
  const applicationCloseAt = Date.parse(payload.applicationCloseAt);

  if (
    Number.isNaN(nominationOpenAt) ||
    Number.isNaN(nominationCloseAt) ||
    Number.isNaN(applicationOpenAt) ||
    Number.isNaN(applicationCloseAt)
  ) {
    throw new Error('All period date-times must be valid.');
  }

  if (nominationOpenAt >= nominationCloseAt) {
    throw new Error('Nomination opening time must be before nomination closing time.');
  }

  if (applicationOpenAt >= applicationCloseAt) {
    throw new Error('Application opening time must be before application closing time.');
  }

  if (nominationCloseAt > applicationOpenAt) {
    throw new Error('Application opening time cannot be before nomination closing time.');
  }
}

export function registerIpcHandlers(): void {
  const supabaseClient = getSupabaseClient();
  const studentResponseHandlers = createStudentResponseHandlers(supabaseClient);
  const masterDataUploadLogStore = createSupabaseMasterDataUploadLogStore(
    supabaseClient,
  );
  const masterDataHandlers = createMasterDataHandlers(
    supabaseClient,
    masterDataUploadLogStore,
  );
  const applicationDownloadHandlers = createApplicationDownloadHandlers(supabaseClient);

  // -------------------------------------------------------------------------
  // Database handlers
  // -------------------------------------------------------------------------
  ipcMain.handle(
    IPC_CHANNELS.DB_QUERY,
    async (_event, payload: DbQueryPayload): Promise<IpcResult> => {
      try {
        const data = db.query(payload.sql, payload.params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_RUN,
    async (_event, payload: DbQueryPayload): Promise<IpcResult> => {
      try {
        const data = db.run(payload.sql, payload.params);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PERIOD_LIST,
    async (): Promise<IpcResult<AwardPeriod[]>> => {
      try {
        const { data, error } = await getSupabaseClient()
          .from('award_periods')
          .select(
            'id,name,nomination_open_at,nomination_close_at,application_open_at,application_close_at,is_active,created_at,updated_at',
          )
          .order('nomination_open_at', { ascending: false });

        if (error) {
          throw error;
        }

        return { success: true, data: (data ?? []).map(row => toAwardPeriod(row as AwardPeriodRow)) };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PERIOD_SAVE,
    async (_event, payload: AwardPeriodSavePayload): Promise<IpcResult<AwardPeriod>> => {
      try {
        validatePeriodPayload(payload);

        const row = {
          ...(payload.id ? { id: payload.id } : {}),
          name: payload.name.trim(),
          nomination_open_at: payload.nominationOpenAt,
          nomination_close_at: payload.nominationCloseAt,
          application_open_at: payload.applicationOpenAt,
          application_close_at: payload.applicationCloseAt,
          is_active: payload.isActive,
          updated_at: new Date().toISOString(),
        };

        const selectColumns =
          'id,name,nomination_open_at,nomination_close_at,application_open_at,application_close_at,is_active,created_at,updated_at';

        const { data, error } = payload.id
          ? await getSupabaseClient()
            .from('award_periods')
            .update(row)
            .eq('id', payload.id)
            .select(selectColumns)
            .single()
          : await getSupabaseClient()
            .from('award_periods')
            .insert(row)
            .select(selectColumns)
            .single();

        if (error) {
          throw error;
        }

        return { success: true, data: toAwardPeriod(data as AwardPeriodRow) };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PERIOD_CLOSE,
    async (_event, payload: { id: string }): Promise<IpcResult<AwardPeriod>> => {
      try {
        const now = Date.now();
        const nominationOpenAt = new Date(now - 4_000).toISOString();
        const nominationCloseAt = new Date(now - 3_000).toISOString();
        const applicationOpenAt = new Date(now - 2_000).toISOString();
        const applicationCloseAt = new Date(now - 1_000).toISOString();
        const updatedAt = new Date(now).toISOString();

        const { data, error } = await getSupabaseClient()
          .from('award_periods')
          .update({
            nomination_open_at: nominationOpenAt,
            nomination_close_at: nominationCloseAt,
            application_open_at: applicationOpenAt,
            application_close_at: applicationCloseAt,
            is_active: false,
            updated_at: updatedAt,
          })
          .eq('id', payload.id)
          .select(
            'id,name,nomination_open_at,nomination_close_at,application_open_at,application_close_at,is_active,created_at,updated_at',
          )
          .single();

        if (error) {
          throw error;
        }

        return { success: true, data: toAwardPeriod(data as AwardPeriodRow) };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.STUDENT_RESPONSES_LIST, studentResponseHandlers.list);
  ipcMain.handle(IPC_CHANNELS.STUDENT_RESPONSES_UPDATE, studentResponseHandlers.update);
  ipcMain.handle(
    IPC_CHANNELS.DASHBOARD_NOMINATIONS,
    async (): Promise<IpcResult<DashboardNominationsSummary>> => {
      try {
        const { count, error: countError } = await getSupabaseClient()
          .from('nominations')
          .select('id', { count: 'exact', head: true });

        if (countError) {
          throw countError;
        }

        const { count: pendingCount, error: pendingCountError } = await getSupabaseClient()
          .from('nominations')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status', 'Pending');

        if (pendingCountError) {
          throw pendingCountError;
        }

        const { count: submittedApplications, error: submittedApplicationsError } = await getSupabaseClient()
          .from('teaching_award_applications')
          .select('id', { count: 'exact', head: true });

        if (submittedApplicationsError) {
          throw submittedApplicationsError;
        }

        const { data: nominatedTeacherRows, error: nominatedTeachersError } = await getSupabaseClient()
          .from('nominations')
          .select('scholar_id,staff_id,scholar_name');

        if (nominatedTeachersError) {
          throw nominatedTeachersError;
        }

        const nominatedTeacherRecords = (nominatedTeacherRows ?? [])
          .map(row => row as NominatedTeacherRow);
        const nominatedTeachers = new Set(
          nominatedTeacherRecords.map(row => getNominatedTeacherKey(row)),
        ).size;

        const { data: scholarEmailRows, error: scholarEmailsError } = await getSupabaseClient()
          .from('scholars')
          .select('id,staff_id,name,email');

        if (scholarEmailsError) {
          throw scholarEmailsError;
        }

        const lecturerEmailStatus = getLecturerEmailStatus(
          nominatedTeacherRecords,
          (scholarEmailRows ?? []).map(row => row as ScholarEmailRow),
        );

        const { data, error } = await getSupabaseClient()
          .from('nominations')
          .select(
            'id,student_name,student_id,scholar_name,unit_code,unit_name,teaching_period,role_of_unit,approval_status,created_at',
          )
          .order('created_at', { ascending: false })
          .limit(8);

        if (error) {
          throw error;
        }

        return {
          success: true,
          data: {
            totalNominations: count ?? 0,
            nominatedTeachers,
            submittedApplications: submittedApplications ?? 0,
            lecturerEmailStatus,
            pendingNominationsToReview: pendingCount ?? 0,
            recentNominations: (data ?? []).map(row => toDashboardNomination(row as DashboardNominationRow)),
          },
        };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.MASTER_DATA_UPLOADS_LIST, masterDataHandlers.list);
  ipcMain.handle(IPC_CHANNELS.MASTER_DATA_UPLOAD, masterDataHandlers.upload);
  ipcMain.handle(
    IPC_CHANNELS.TEACHING_AWARD_APPLICATIONS_LIST,
    applicationDownloadHandlers.list,
  );
  ipcMain.handle(
    IPC_CHANNELS.TEACHING_AWARD_APPLICATION_DOWNLOAD,
    applicationDownloadHandlers.download,
  );
  ipcMain.handle(
    IPC_CHANNELS.TEACHING_AWARD_APPLICATIONS_DOWNLOAD_ZIP,
    applicationDownloadHandlers.downloadZip,
  );

  // -------------------------------------------------------------------------
  // API proxy handler — keeps API keys out of the renderer
  // -------------------------------------------------------------------------
  ipcMain.handle(
    IPC_CHANNELS.API_REQUEST,
    async (_event, payload: ApiRequestPayload): Promise<IpcResult> => {
      try {
        const data = await apiClient.request(payload.url, {
          method: payload.method,
          headers: payload.headers,
          body: payload.data,
        });
        return { success: true, data };
      } catch (err) {
        return { success: false, error: formatError(err) };
      }
    },
  );

  console.log('[IPC] Handlers registered');
}
