/**
 * Preload script — runs in an isolated context before the renderer.
 *
 * Only explicitly listed APIs are exposed to the renderer via
 * contextBridge.  Never expose ipcRenderer directly.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  IpcChannel,
  IpcResult,
  DbQueryPayload,
  ApiRequestPayload,
  AwardPeriod,
  AwardPeriodSavePayload,
  StudentResponseStatusUpdatePayload,
  DashboardNominationsSummary,
  StudentResponse,
  MasterDataUploadLog,
  MasterDataUploadPayload,
  TeachingAwardApplication,
  TeachingAwardApplicationDownloadPayload,
  TeachingAwardApplicationListPayload,
  TeachingAwardApplicationsZipPayload,
  TeachingAwardDownloadResult,
} from '../shared/types';

const bridge = {
  /** Invoke an IPC channel and return a typed result. */
  invoke<T = unknown>(channel: IpcChannel, payload?: unknown): Promise<IpcResult<T>> {
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>;
  },

  /** Convenience wrapper for database queries. */
  dbQuery<T = unknown>(payload: DbQueryPayload): Promise<IpcResult<T>> {
    return ipcRenderer.invoke('db:query', payload) as Promise<IpcResult<T>>;
  },

  /** Convenience wrapper for database write operations. */
  dbRun(payload: DbQueryPayload): Promise<IpcResult> {
    return ipcRenderer.invoke('db:run', payload);
  },

  /** Convenience wrapper for proxied API calls. */
  apiRequest<T = unknown>(payload: ApiRequestPayload): Promise<IpcResult<T>> {
    return ipcRenderer.invoke('api:request', payload) as Promise<IpcResult<T>>;
  },

  listAwardPeriods(): Promise<IpcResult<AwardPeriod[]>> {
    return ipcRenderer.invoke(IPC_CHANNELS.PERIOD_LIST) as Promise<IpcResult<AwardPeriod[]>>;
  },

  saveAwardPeriod(payload: AwardPeriodSavePayload): Promise<IpcResult<AwardPeriod>> {
    return ipcRenderer.invoke(IPC_CHANNELS.PERIOD_SAVE, payload) as Promise<IpcResult<AwardPeriod>>;
  },

  closeAwardPeriod(id: string): Promise<IpcResult<AwardPeriod>> {
    return ipcRenderer.invoke(IPC_CHANNELS.PERIOD_CLOSE, { id }) as Promise<IpcResult<AwardPeriod>>;
  },
  uploadMasterData(payload: MasterDataUploadPayload): Promise<IpcResult<MasterDataUploadLog>> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MASTER_DATA_UPLOAD,
      payload,
    ) as Promise<IpcResult<MasterDataUploadLog>>;
  },

  listMasterDataUploads(): Promise<IpcResult<MasterDataUploadLog[]>> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MASTER_DATA_UPLOADS_LIST,
    ) as Promise<IpcResult<MasterDataUploadLog[]>>;
  },

  previewTutorList(buffer: ArrayBuffer): Promise<IpcResult> {
  return ipcRenderer.invoke('tutor:preview', buffer) as Promise<IpcResult>
  },

  uploadTutors(tutors: unknown[]): Promise<IpcResult> {
    return ipcRenderer.invoke('tutor:upload', tutors) as Promise<IpcResult>
  },

  listStudentResponses(): Promise<IpcResult<StudentResponse[]>> {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENT_RESPONSES_LIST) as Promise<IpcResult<StudentResponse[]>>;
  },

  sendEmails(payload: unknown): Promise<IpcResult> {
  return ipcRenderer.invoke('email:send', payload) as Promise<IpcResult>;
  },

  updateStudentResponseStatus(
    payload: StudentResponseStatusUpdatePayload,
  ): Promise<IpcResult<StudentResponse>> {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENT_RESPONSES_UPDATE, payload) as Promise<IpcResult<StudentResponse>>;
  },
    
  getDashboardNominations(): Promise<IpcResult<DashboardNominationsSummary>> {
    return ipcRenderer.invoke(IPC_CHANNELS.DASHBOARD_NOMINATIONS) as Promise<IpcResult<DashboardNominationsSummary>>;
  },

  listTeachingAwardApplications(
    payload: TeachingAwardApplicationListPayload = {},
  ): Promise<IpcResult<TeachingAwardApplication[]>> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TEACHING_AWARD_APPLICATIONS_LIST,
      payload,
    ) as Promise<IpcResult<TeachingAwardApplication[]>>;
  },

  downloadTeachingAwardApplication(
    payload: TeachingAwardApplicationDownloadPayload,
  ): Promise<IpcResult<TeachingAwardDownloadResult>> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TEACHING_AWARD_APPLICATION_DOWNLOAD,
      payload,
    ) as Promise<IpcResult<TeachingAwardDownloadResult>>;
  },

  downloadTeachingAwardApplicationsZip(
    payload: TeachingAwardApplicationsZipPayload,
  ): Promise<IpcResult<TeachingAwardDownloadResult>> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TEACHING_AWARD_APPLICATIONS_DOWNLOAD_ZIP,
      payload,
    ) as Promise<IpcResult<TeachingAwardDownloadResult>>;
  },
};

contextBridge.exposeInMainWorld('electronAPI', bridge);

/** Augment the global Window type so the renderer has full TypeScript support. */
export type ElectronAPI = typeof bridge;
