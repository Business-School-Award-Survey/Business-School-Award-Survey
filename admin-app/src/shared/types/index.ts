/** Shared TypeScript types and IPC channel definitions used by both
 *  the main process (Node.js) and the renderer process (Vue).
 */

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------
export const IPC_CHANNELS = {
  // File operations
  FILE_PARSE_CSV: 'file:parse-csv',

  // Database operations
  DB_QUERY: 'db:query',
  DB_RUN: 'db:run',
  PERIOD_LIST: 'period:list',
  PERIOD_SAVE: 'period:save',
  PERIOD_CLOSE: 'period:close',
  STUDENT_RESPONSES_LIST: 'student-responses:list',
  STUDENT_RESPONSES_UPDATE: 'student-responses:update',
  DASHBOARD_NOMINATIONS: 'dashboard:nominations',
  MASTER_DATA_UPLOAD: 'master-data:upload',
  MASTER_DATA_UPLOADS_LIST: 'master-data:uploads-list',
  TEACHING_AWARD_APPLICATIONS_LIST: 'teaching-award-applications:list',
  TEACHING_AWARD_APPLICATION_DOWNLOAD: 'teaching-award-applications:download',
  TEACHING_AWARD_APPLICATIONS_DOWNLOAD_ZIP: 'teaching-award-applications:download-zip',

  // API proxy
  API_REQUEST: 'api:request',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export interface CsvRow {
  [key: string]: string;
}

export interface ApiRequestPayload {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

export interface DbQueryPayload {
  sql: string;
  params?: unknown[];
}

export type PeriodStatus = 'Upcoming' | 'Nominations Open' | 'Applications Open' | 'Closed';

export interface AwardPeriod {
  id: string;
  name: string;
  nominationOpenAt: string;
  nominationCloseAt: string;
  applicationOpenAt: string;
  applicationCloseAt: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AwardPeriodSavePayload {
  id?: string;
  name: string;
  nominationOpenAt: string;
  nominationCloseAt: string;
  applicationOpenAt: string;
  applicationCloseAt: string;
  isActive: boolean;
}

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface StudentResponseStatusUpdatePayload {
  id: number;
  approvalStatus: ApprovalStatus;
}

export interface StudentResponse {
  id: number;
  studentName: string;
  studentId: string;
  scholarName: string;
  unitCode: string;
  unitName: string | null;
  teachingPeriod: string;
  roleOfUnit: string;
  statementSupport: string;
  approvalStatus: ApprovalStatus;
  createdAt?: string;
}

export type NominationApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface DashboardNomination {
  id: number;
  studentName: string;
  studentId: string;
  scholarName: string;
  unitCode: string;
  unitName: string | null;
  teachingPeriod: string;
  roleOfUnit: string;
  approvalStatus: NominationApprovalStatus;
  createdAt?: string;
}

export interface LecturerEmailStatus {
  totalLecturers: number;
  withEmail: number;
  missingEmail: number;
  trackingConfigured: boolean;
}

export interface DashboardNominationsSummary {
  totalNominations: number;
  nominatedTeachers: number;
  submittedApplications: number | null;
  lecturerEmailStatus: LecturerEmailStatus;
  pendingNominationsToReview: number;
  recentNominations: DashboardNomination[];
}

export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Interface for ScholarData, which represents
 * the JSON format to upload to the `scholars`
 * table in the database
 */
export interface ScholarData {
  "name": string,
  "unit"?: string,
  "unit_name"?: string,
  "role_of_unit"?: string,
  "staff_id"?: string,
  "semester"?: string,
}
export type MasterDataUploadStatus = 'Success' | 'Partial' | 'Failed';

export interface MasterDataUploadError {
  sheet: string;
  row?: number;
  message: string;
}

export interface MasterDataUploadPayload {
  fileName: string;
  bytes: ArrayBuffer;
}

export interface MasterDataUploadDraft {
  fileName: string;
  attemptedCount: number;
  successfulCount: number;
  failedCount: number;
  status: MasterDataUploadStatus;
  errors: MasterDataUploadError[];
}

export interface MasterDataUploadLog extends MasterDataUploadDraft {
  id: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export const TEACHING_AWARD_CATEGORIES = [
  'Citation Award category',
  'Excellence in Teaching category',
  'Sessional Lecturer category',
  'Early Career category',
  'Jin-Boon Lew Tutor category',
] as const;

export type TeachingAwardCategory = (typeof TEACHING_AWARD_CATEGORIES)[number];

export interface TeachingAwardApplication {
  id: string;
  awardPeriodId: string;
  applicantEmail: string;
  fullName: string;
  category: TeachingAwardCategory;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  submittedAt: string;
}

export interface TeachingAwardApplicationListPayload {
  awardPeriodId?: string;
}

export interface TeachingAwardApplicationDownloadPayload {
  applicationId: string;
}

export interface TeachingAwardApplicationsZipPayload {
  awardPeriodId: string;
  category?: TeachingAwardCategory;
}

export interface TeachingAwardDownloadFailure {
  applicationId: string;
  fileName: string;
  error: string;
}

export interface TeachingAwardDownloadResult {
  cancelled: boolean;
  savedPath?: string;
  downloadedCount: number;
  failures: TeachingAwardDownloadFailure[];
}
